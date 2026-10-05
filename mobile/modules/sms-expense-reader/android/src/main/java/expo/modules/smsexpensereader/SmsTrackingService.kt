package expo.modules.smsexpensereader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Always-on foreground service (only while tracking is ON). Its only job is to keep the app process
 * alive so the SMS receiver can hand each bank SMS to the live JS runtime, and so the headless JS task
 * is allowed to start. It reads nothing itself. Restarted after reboot/app update by BootReceiver.
 */
class SmsTrackingService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = true
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // A sticky restart after the toggle was turned OFF (or after sign-out) must not come back.
    if (!TrackingPrefs.isEnabled(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    return try {
      goForeground()
      START_STICKY
    } catch (_: Exception) {
      // Background start not allowed right now (e.g. ForegroundServiceStartNotAllowedException).
      // The next app open, SMS or reboot starts it again.
      running = false
      stopSelf()
      START_NOT_STICKY
    }
  }

  private fun goForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
      val channel = NotificationChannel(CHANNEL_ID, "Bank SMS tracking", NotificationManager.IMPORTANCE_LOW)
      channel.description = "Keeps UPI expense tracking running in the background"
      channel.setShowBadge(false)
      channel.setSound(null, null)
      channel.enableVibration(false)
      nm.createNotificationChannel(channel)
    }
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Tracking bank SMS")
      .setContentText("Saving UPI payments to Money in the background")
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch != null) {
      builder.setContentIntent(
        PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      )
    }
    val notification: Notification = builder.build()
    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    running = true
  }

  companion object {
    private const val CHANNEL_ID = "sms-tracking"
    private const val NOTIFICATION_ID = 7342

    /** True while this process has the service running (a dead process is, correctly, "not running"). */
    @Volatile
    var running: Boolean = false
      private set

    /** Best effort, never throws. Returns false when Android refused the start. */
    fun start(context: Context): Boolean {
      return try {
        ContextCompat.startForegroundService(context, Intent(context, SmsTrackingService::class.java))
        true
      } catch (_: Exception) {
        false
      }
    }

    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, SmsTrackingService::class.java))
      } catch (_: Exception) {
        // ignore
      }
      running = false
    }

    /** Starts the service only if tracking is ON and it is not already running. */
    fun ensureRunning(context: Context): Boolean {
      if (!TrackingPrefs.isEnabled(context)) return false
      if (running) return true
      return start(context)
    }
  }
}
