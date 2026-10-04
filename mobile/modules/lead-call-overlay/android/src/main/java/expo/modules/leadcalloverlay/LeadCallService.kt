package expo.modules.leadcalloverlay

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Lives only from "Call" until the overlay is answered (max WATCH_LIMIT_MS). Foreground so Android
 * doesn't freeze the app mid-call and miss the end of the call.
 */
class LeadCallService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.leadcalloverlay.START"
    const val ACTION_TEST = "expo.modules.leadcalloverlay.TEST"
    const val EXTRA_LEAD_ID = "leadId"
    const val EXTRA_NAME = "name"
    const val EXTRA_PHONE = "phone"
    const val EXTRA_STATUSES = "statuses"
    private const val CHANNEL_ID = "lead-call-watch"
    private const val NOTIFICATION_ID = 7341
    private const val WATCH_LIMIT_MS = 3L * 60 * 60 * 1000
    private const val OVERLAY_LIMIT_MS = 3L * 60 * 1000
    /** If the call never goes off-hook (cancelled before dialing) give up after this long. */
    private const val NO_CALL_LIMIT_MS = 2L * 60 * 1000
  }

  private val handler = Handler(Looper.getMainLooper())
  private var telephony: TelephonyManager? = null
  private var callback: Any? = null
  private var sawOffHook = false
  private var overlay: View? = null
  private var leadId = ""
  private var name = ""
  private var phone = ""
  private var statuses: List<String> = emptyList()

  private val stopAll = Runnable { finish() }
  private val noCall = Runnable { if (!sawOffHook) finish() }
  private val overlayTimeout = Runnable {
    // Left unanswered: treat as "later" so the app reminds them again.
    LeadCallOverlayModule.emit(LeadCallOverlayModule.EVENT_LATER, leadId)
    finish()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    leadId = intent?.getStringExtra(EXTRA_LEAD_ID) ?: ""
    name = intent?.getStringExtra(EXTRA_NAME) ?: ""
    phone = intent?.getStringExtra(EXTRA_PHONE) ?: ""
    statuses = intent?.getStringArrayListExtra(EXTRA_STATUSES) ?: emptyList()

    goForeground()
    unregister()
    removeOverlay()
    handler.removeCallbacksAndMessages(null)
    sawOffHook = false

    when (intent?.action) {
      ACTION_TEST -> showOverlay()
      ACTION_START -> {
        if (!register()) {
          // Without phone-state access we can't tell when the call ends; the in-app popup still asks.
          finish()
          return START_NOT_STICKY
        }
        handler.postDelayed(stopAll, WATCH_LIMIT_MS)
        handler.postDelayed(noCall, NO_CALL_LIMIT_MS)
      }
      else -> finish()
    }
    return START_NOT_STICKY
  }

  private fun goForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Call follow-up", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown during a call to a lead so the app can ask how it went"
          setShowBadge(false)
        }
      )
    }
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Call follow-up")
      .setContentText(if (name.isNotBlank()) "We'll ask how the call with $name went" else "We'll ask how the call went")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun onCallState(state: Int) {
    when (state) {
      TelephonyManager.CALL_STATE_OFFHOOK, TelephonyManager.CALL_STATE_RINGING -> {
        sawOffHook = true
        handler.removeCallbacks(noCall)
      }
      TelephonyManager.CALL_STATE_IDLE -> if (sawOffHook) {
        sawOffHook = false
        unregister()
        LeadCallOverlayModule.emit(LeadCallOverlayModule.EVENT_CALL_ENDED, leadId)
        if (canDraw()) showOverlay() else finish()
      }
    }
  }

  @SuppressLint("MissingPermission")
  private fun register(): Boolean {
    val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return false
    telephony = tm
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return false
        val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
          override fun onCallStateChanged(state: Int) {
            handler.post { onCallState(state) }
          }
        }
        tm.registerTelephonyCallback(mainExecutor, cb)
        callback = cb
      } else {
        @Suppress("DEPRECATION")
        val listener = object : PhoneStateListener() {
          @Deprecated("Deprecated in Java")
          override fun onCallStateChanged(state: Int, phoneNumber: String?) {
            handler.post { onCallState(state) }
          }
        }
        @Suppress("DEPRECATION")
        tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
        callback = listener
      }
      true
    } catch (_: SecurityException) {
      false
    }
  }

  private fun unregister() {
    val tm = telephony ?: return
    val cb = callback ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && cb is TelephonyCallback) {
        tm.unregisterTelephonyCallback(cb)
      } else if (cb is PhoneStateListener) {
        @Suppress("DEPRECATION")
        tm.listen(cb, PhoneStateListener.LISTEN_NONE)
      }
    } catch (_: Exception) {
      // ignore
    }
    callback = null
  }

  private fun canDraw() = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun showOverlay() {
    if (!canDraw()) {
      finish()
      return
    }
    removeOverlay()
    val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    val bg = if (dark) Color.parseColor("#1F1B24") else Color.WHITE
    val fg = if (dark) Color.parseColor("#F5F1EE") else Color.parseColor("#1C1917")
    val muted = if (dark) Color.parseColor("#B5ADA6") else Color.parseColor("#6B625C")
    val brand = Color.parseColor("#E8590C")

    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(18), dp(16), dp(18), dp(14))
      background = GradientDrawable().apply {
        cornerRadius = dp(18).toFloat()
        setColor(bg)
      }
      elevation = dp(12).toFloat()
    }

    val headerRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val titles = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    titles.addView(TextView(this).apply {
      text = "Call ended — how did it go?"
      setTextColor(muted)
      textSize = 13f
    })
    titles.addView(TextView(this).apply {
      text = name.ifBlank { phone.ifBlank { "Lead" } }
      setTextColor(fg)
      textSize = 18f
      setTypeface(typeface, Typeface.BOLD)
      maxLines = 1
    })
    headerRow.addView(titles, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    headerRow.addView(TextView(this).apply {
      text = "✕"
      textSize = 20f
      setTextColor(muted)
      setPadding(dp(12), dp(4), dp(4), dp(4))
      contentDescription = "Remind me later"
      setOnClickListener { later() }
    })
    card.addView(headerRow)

    fun button(label: String, primary: Boolean, onTap: () -> Unit) = Button(this).apply {
      text = label
      isAllCaps = false
      textSize = 15f
      setTextColor(if (primary) Color.WHITE else fg)
      background = GradientDrawable().apply {
        cornerRadius = dp(24).toFloat()
        if (primary) setColor(brand) else {
          setColor(Color.TRANSPARENT)
          setStroke(dp(1), muted)
        }
      }
      minHeight = dp(46)
      setOnClickListener { onTap() }
    }

    val spacing = dp(8)
    for (s in statuses.take(8)) {
      card.addView(
        button(s, true) { choose(s) },
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = spacing }
      )
    }
    val bottom = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    bottom.addView(button("Later", false) { later() }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = spacing / 2 })
    bottom.addView(button("Open app", false) { openApp() }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = spacing / 2 })
    card.addView(bottom, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = spacing })

    val frame = LinearLayout(this).apply {
      setPadding(dp(14), 0, dp(14), 0)
      addView(card, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }

    @Suppress("DEPRECATION")
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP
      y = dp(72)
    }
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).addView(frame, params)
      overlay = frame
      handler.postDelayed(overlayTimeout, OVERLAY_LIMIT_MS)
    } catch (_: Exception) {
      finish()
    }
  }

  private fun choose(status: String) {
    if (leadId.isNotBlank()) LeadCallOverlayModule.deliverOutcome(this, leadId, status)
    finish()
  }

  private fun later() {
    if (leadId.isNotBlank()) LeadCallOverlayModule.emit(LeadCallOverlayModule.EVENT_LATER, leadId)
    finish()
  }

  private fun openApp() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      try { startActivity(it) } catch (_: Exception) { }
    }
    finish()
  }

  private fun removeOverlay() {
    handler.removeCallbacks(overlayTimeout)
    overlay?.let {
      try { (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(it) } catch (_: Exception) { }
    }
    overlay = null
  }

  private fun finish() {
    handler.removeCallbacksAndMessages(null)
    unregister()
    removeOverlay()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    unregister()
    removeOverlay()
    super.onDestroy()
  }
}
