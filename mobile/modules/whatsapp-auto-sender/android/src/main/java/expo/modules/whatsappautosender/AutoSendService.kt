package expo.modules.whatsappautosender

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.util.Log
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.Calendar
import java.util.Random
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Background sender. Runs as a foreground service, so it keeps working while other apps are open or the app is closed.
 * It follows the same rules as the in-app runner (leads/whatsappAutoPlan.ts): 12 or 13 a day, 10 AM to 7 PM, a random
 * 6 to 14 minutes between messages. Each send goes through WhatsAppAutoService (the accessibility job), then the lead is
 * marked as sent on the server. Login is refreshed here when the access token expires.
 */
class AutoSendService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val net = Executors.newSingleThreadExecutor()
  private val random = Random()
  private var busy = false

  private val client = OkHttpClient.Builder()
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .build()

  private val tick = object : Runnable {
    override fun run() {
      try {
        tickOnce()
      } catch (e: Throwable) {
        // Try again on the next tick. Logged so a freeze can be traced.
        Log.e(TAG, "tick failed", e)
      }
      if (Store.enabled(this@AutoSendService)) handler.postDelayed(this, TICK_MS)
      else stopSelf()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundSafely()
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    Store.setRunning(this, false)
    super.onDestroy()
  }

  private fun startForegroundSafely() {
    val channelId = "auto_send"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(channelId, "Auto send", NotificationManager.IMPORTANCE_LOW))
    }
    val notif = buildNotification(channelId, "WhatsApp auto send is on")
    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    ServiceCompat.startForeground(this, NOTIF_ID, notif, type)
    Store.setRunning(this, true)
  }

  private fun buildNotification(channelId: String, text: String): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val pi = PendingIntent.getActivity(this, 0, open ?: Intent(), PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, channelId)
      .setContentTitle("We Three")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_send)
      .setOngoing(true)
      .setContentIntent(pi)
      .build()
  }

  private fun updateNotification(text: String) {
    val nm = getSystemService(NotificationManager::class.java)
    nm.notify(NOTIF_ID, buildNotification("auto_send", text))
  }

  private fun tickOnce() {
    if (!Store.enabled(this)) return
    val now = System.currentTimeMillis()
    val today = dayKey(now)
    Store.rollDay(this, today)

    Log.d(TAG, "tick current=${Store.currentLead(this)?.optString("name")} state=${WhatsAppAutoService.state}")
    val cur = Store.currentLead(this)
    if (cur != null) {
      val st = WhatsAppAutoService.state
      if (st == "running") {
        // Watchdog: a send that never reports back is cancelled, so the schedule keeps moving.
        if (now - cur.optLong("startedAt", now) > STUCK_MS) {
          WhatsAppAutoService.cancel()
          finishLead(cur, false, "WhatsApp took too long", now)
        }
        return
      }
      finishLead(cur, st == "done", WhatsAppAutoService.stateMessage, now)
      return
    }
    val sent = Store.sentToday(this)
    val target = dailyTarget(today)
    val testMode = Store.testMode(this)
    updateNotification(if (testMode) "Test mode: sent $sent" else "Today $sent of $target sent")
    if (busy) return
    if (!testMode && sent >= target) {
      Store.setStatus(this, "Done for today ($sent/$target). Resumes at 10:00 AM.")
      return
    }
    val cal = Calendar.getInstance()
    val hour = cal.get(Calendar.HOUR_OF_DAY)
    if (!testMode && (hour < WINDOW_START_HOUR || hour >= WINDOW_END_HOUR)) {
      Store.setStatus(this, "Outside 10 AM to 7 PM. Waiting.")
      return
    }
    val due = Store.nextDueAt(this)
    if (due > now) {
      Store.setStatus(this, "Next message in ${(due - now) / 60000 + 1} min.")
      return
    }

    busy = true
    Store.setStatus(this, "Looking for the next lead...")
    net.execute {
      val result: Result<JSONObject?> = try {
        Result.success(findNextLead())
      } catch (e: Exception) {
        Result.failure(e)
      }
      handler.post {
        busy = false
        val lead = result.getOrNull()
        if (result.isFailure) {
          Store.setStatus(this, "Couldn't reach the server. Retrying. (${result.exceptionOrNull()?.message})")
          Store.setNextDue(this, System.currentTimeMillis() + RETRY_MS)
        } else if (lead == null) {
          Store.setStatus(this, "No unsent leads in this list.")
          Store.setNextDue(this, System.currentTimeMillis() + RETRY_MS * 10)
        } else {
          startLead(lead)
        }
      }
    }
  }

  private fun startLead(lead: JSONObject) {
    val image = pickImage()
    if (image == null) {
      Store.setStatus(this, "No image in the app folder. Choose an image in the app.")
      Store.setNextDue(this, System.currentTimeMillis() + RETRY_MS)
      return
    }
    val tpl = pickTemplate(Store.lastTemplateId(this))
    if (tpl == null) {
      Store.setStatus(this, "No messages saved.")
      Store.setNextDue(this, System.currentTimeMillis() + RETRY_MS)
      return
    }
    val digits = normalizePhone(lead.optString("phone"))!!
    val text = renderTemplate(tpl.getString("text"), lead.optString("name"))
    val ok = WhatsAppAutoService.start("com.whatsapp.w4b", image.first, image.second, text, digits, null)
    if (!ok) {
      Store.setStatus(this, "Accessibility service is off. Turn it on in Settings.")
      Store.setNextDue(this, System.currentTimeMillis() + RETRY_MS)
      return
    }
    Store.setCurrentLead(this, JSONObject()
      .put("startedAt", System.currentTimeMillis())
      .put("id", lead.optString("id"))
      .put("name", lead.optString("name"))
      .put("phone", lead.optString("phone"))
      .put("templateId", tpl.getString("id"))
      .put("templateName", tpl.getString("name")))
    Store.setStatus(this, "Sending to ${lead.optString("name").ifEmpty { lead.optString("phone") }}...")
  }

  /** Called when the accessibility job has finished for the lead we started. */
  private fun finishLead(cur: JSONObject, ok: Boolean, msg: String, now: Long) {
    Store.setCurrentLead(this, null)
    val id = cur.optString("id")
    val name = cur.optString("name").ifEmpty { cur.optString("phone") }
    if (ok) {
      Store.addSent(this, id, cur.optString("templateId"), now)
      Store.setNextDue(this, now + if (Store.testMode(this)) TEST_GAP_MS else randomGapMs())
      Store.setStatus(this, "Sent to $name.")
      net.execute { markSent(id, cur.optString("templateName")) }
    } else {
      Store.addSkipped(this, id)
      if (msg.contains("not on whatsapp", ignoreCase = true)) {
        Store.addDone(this, id)
        net.execute { markSent(id, NO_WHATSAPP_NOTE) }
      }
      Store.setNextDue(this, now + 60_000)
      Store.setStatus(this, "Not sent to $name: $msg")
    }
  }

  // ---- server ----

  private fun findNextLead(): JSONObject? {
    val origin = Store.origin(this)
    val originQuery = if (origin.isEmpty() || origin == "all") "" else "&origin=" + java.net.URLEncoder.encode(origin, "UTF-8")
    for (page in 1..MAX_PAGES) {
      val body = call("GET", "/leads?page=$page&limit=50&status=all$originQuery", null, false)
      val arr = JSONObject(body).optJSONArray("leads") ?: JSONArray()
      if (arr.length() == 0) return null
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        val id = o.optString("id")
        if (o.optBoolean("archived")) continue
        if (!o.isNull("whatsappSentAt") && o.optString("whatsappSentAt").isNotEmpty()) continue
        if (normalizePhone(o.optString("phone")) == null) continue
        if (Store.isDone(this, id) || Store.isSkipped(this, id)) continue
        return o
      }
    }
    return null
  }

  private fun markSent(id: String, templateName: String) {
    try {
      call("PATCH", "/leads/$id", JSONObject().put("whatsappSent", true).put("whatsappTemplateName", templateName), false)
    } catch (_: Exception) {
      // The id is already recorded on this phone, so it isn't messaged again today.
    }
  }

  private fun call(method: String, path: String, json: JSONObject?, retried: Boolean): String {
    val base = Store.baseUrl(this)
    val req = Request.Builder().url(base + path).header("Authorization", "Bearer " + Store.accessToken(this))
    val body = json?.toString()?.toRequestBody("application/json".toMediaType())
    when (method) {
      "GET" -> req.get()
      "PATCH" -> req.patch(body ?: "{}".toRequestBody("application/json".toMediaType()))
      else -> req.post(body ?: "{}".toRequestBody("application/json".toMediaType()))
    }
    client.newCall(req.build()).execute().use { resp ->
      if (resp.code == 401 && !retried) {
        refreshLogin()
        return call(method, path, json, true)
      }
      val text = resp.body?.string() ?: ""
      if (!resp.isSuccessful) throw IOException("HTTP ${resp.code}")
      return text
    }
  }

  private fun refreshLogin() {
    val rt = Store.refreshToken(this)
    if (rt.isEmpty()) throw IOException("Session expired. Open We Three and log in again.")
    val body = JSONObject().put("refreshToken", rt).toString().toRequestBody("application/json".toMediaType())
    val req = Request.Builder().url(Store.baseUrl(this) + "/auth/refresh").post(body).build()
    client.newCall(req).execute().use { resp ->
      if (!resp.isSuccessful) throw IOException("Session expired. Open We Three and log in again.")
      val j = JSONObject(resp.body?.string() ?: "{}")
      Store.saveTokens(this, j.optString("accessToken"), j.optString("refreshToken").ifEmpty { rt })
    }
  }

  // ---- pickers and text ----

  private fun pickTemplate(lastId: String): JSONObject? {
    val all = Store.templates(this)
    val choices = (0 until all.length()).map { all.getJSONObject(it) }.filter { it.optString("id") != lastId }
    val list = choices.ifEmpty { (0 until all.length()).map { all.getJSONObject(it) } }
    if (list.isEmpty()) return null
    return list[random.nextInt(list.size)]
  }

  private fun pickImage(): Pair<String, String>? {
    val dir = File(filesDir, "whatsapp-auto")
    val files = dir.listFiles { f -> f.name.matches(Regex("(?i).*\\.(jpe?g|png|webp)$")) }?.sortedBy { it.name } ?: return null
    if (files.isEmpty()) return null
    val f = files[random.nextInt(files.size)]
    val mime = when {
      f.name.endsWith(".png", true) -> "image/png"
      f.name.endsWith(".webp", true) -> "image/webp"
      else -> "image/jpeg"
    }
    return Pair(Uri.fromFile(f).toString(), mime)
  }

  private fun randomGapMs(): Long = MIN_GAP_MS + (random.nextDouble() * (MAX_GAP_MS - MIN_GAP_MS)).toLong()

  companion object {
    const val ACTION_STOP = "expo.modules.whatsappautosender.STOP"
    private const val NOTIF_ID = 4711
    private const val TICK_MS = 5_000L
    private const val TEST_GAP_MS = 15_000L
    private const val RETRY_MS = 60_000L
    private const val STUCK_MS = 150_000L
    private const val TAG = "WeThreeSend"
    private const val MAX_PAGES = 20
    private const val WINDOW_START_HOUR = 10
    private const val WINDOW_END_HOUR = 19
    private const val MIN_GAP_MS = 6 * 60 * 1000L
    private const val MAX_GAP_MS = 14 * 60 * 1000L
    const val NO_WHATSAPP_NOTE = "No WhatsApp (skipped)"

    fun start(ctx: Context) {
      // A fresh start drops any send left over from an earlier run, so the schedule can't wait on it.
      Store.setCurrentLead(ctx, null)
      WhatsAppAutoService.cancel()
      val i = Intent(ctx, AutoSendService::class.java)
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
    }

    fun stop(ctx: Context) {
      Store.setEnabled(ctx, false)
      Store.setCurrentLead(ctx, null)
      WhatsAppAutoService.cancel()
      ctx.stopService(Intent(ctx, AutoSendService::class.java))
    }

    fun dayKey(ms: Long): String {
      val c = Calendar.getInstance().apply { timeInMillis = ms }
      return String.format("%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    /** Same hash as dailyTarget() in whatsappAutoPlan.ts: 12 or 13, fixed per date. */
    fun dailyTarget(key: String): Int {
      var h = 0L
      for (ch in key) h = (h * 31 + ch.code) and 0xFFFFFFFFL
      return 12 + (h % 2).toInt()
    }

    fun normalizePhone(raw: String): String? {
      val d = raw.filter { it.isDigit() }
      return when {
        d.length == 10 -> "91$d"
        d.length == 11 && d.startsWith("0") -> "91" + d.substring(1)
        d.length in 12..14 -> d
        else -> null
      }
    }

    /** Same rules as renderAutoTemplate() in whatsappAutoTemplates.ts. */
    fun renderTemplate(text: String, name: String?): String {
      val first = (name ?: "").trim().split(Regex("\\s+")).firstOrNull() ?: ""
      return text
        .replace(Regex("\\{name\\}", RegexOption.IGNORE_CASE), first)
        .replace(Regex("[ \\t]+([,.!?])"), "$1")
        .replace(Regex("[ \\t]{2,}"), " ")
        .replace(Regex(" +\\n"), "\n")
        .trim()
    }
  }
}
