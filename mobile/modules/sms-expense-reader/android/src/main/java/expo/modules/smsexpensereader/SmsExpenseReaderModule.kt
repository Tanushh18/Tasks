package expo.modules.smsexpensereader

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * JS side: mobile/src/expenses/smsReader.ts. The runtime permission prompt is shown from JS
 * (PermissionsAndroid); this module reads the inbox on demand, forwards SMS that arrive while a JS
 * runtime is alive, and keeps a small queue of SMS that arrived while it was not. A queued SMS is
 * deleted as soon as JS reports it processed. Only messages from ALLOWED_SENDERS are ever read,
 * emitted or queued. Nothing is sent anywhere from here.
 */
class SmsExpenseReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("SmsExpenseReader")

    Events(EVENT_SMS_RECEIVED)

    OnCreate { instances.add(this@SmsExpenseReaderModule) }
    OnDestroy { instances.remove(this@SmsExpenseReaderModule) }

    Function("hasPermission") {
      ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
    }

    /** Allowed-sender inbox messages newer than sinceMs, oldest first, at most `limit` of them. */
    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      readInbox(context, sinceMs.toLong(), limit)
    }

    /** Starts the always-on foreground service and remembers "tracking is ON" for the boot receiver. */
    Function("startTracking") {
      TrackingPrefs.setEnabled(context, true)
      SmsTrackingService.ensureRunning(context)
    }

    /** Stops the service and clears the native "ON" flag (toggle OFF / sign-out). */
    Function("stopTracking") {
      TrackingPrefs.setEnabled(context, false)
      SmsTrackingService.stop(context)
      true
    }

    Function("isTrackingRunning") {
      SmsTrackingService.running
    }

    Function("isIgnoringBatteryOptimizations") {
      BackgroundSettings.isIgnoringBatteryOptimizations(context)
    }

    Function("requestIgnoreBatteryOptimizations") {
      BackgroundSettings.requestIgnoreBatteryOptimizations(context)
    }

    Function("openAutoStartSettings") {
      BackgroundSettings.openAutoStartSettings(context)
    }

    /** False when notifications are blocked (Android 13+ default until allowed), which hides the service's notice. */
    Function("areNotificationsEnabled") {
      NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** SMS that arrived while no JS runtime was alive. They stay queued until removeQueuedSms. */
    Function("peekQueuedSms") {
      peekQueue(context)
    }

    /** Deletes processed SMS (by the ids peekQueuedSms returned) from the native queue. */
    Function("removeQueuedSms") { ids: List<String> ->
      removeFromQueue(context, ids.toSet())
    }
  }

  private fun readInbox(context: Context, sinceMs: Long, limit: Int): List<Map<String, Any>> {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
      return emptyList()
    }
    val out = ArrayList<Map<String, Any>>()
    val cap = if (limit > 0) limit else DEFAULT_LIMIT
    // Narrow in the query first (other senders' messages are never even loaded), then re-check exactly.
    // The bank's signature in the body is a second way in (a saved contact name can replace the sender id).
    val likes = (ALLOWED_SENDERS.map { "UPPER(address) LIKE ?" } + "body LIKE ?").joinToString(" OR ")
    val args = arrayOf(sinceMs.toString()) + ALLOWED_SENDERS.map { "%$it%" } + "%Federal Bank%"
    context.contentResolver.query(
      Uri.parse("content://sms/inbox"),
      arrayOf("_id", "address", "body", "date"),
      "date > ? AND ($likes)",
      args,
      "date ASC"
    )?.use { cursor ->
      val idCol = cursor.getColumnIndex("_id")
      val addressCol = cursor.getColumnIndex("address")
      val bodyCol = cursor.getColumnIndex("body")
      val dateCol = cursor.getColumnIndex("date")
      while (cursor.moveToNext() && out.size < cap) {
        val address = if (addressCol >= 0) cursor.getString(addressCol) ?: "" else ""
        val text = if (bodyCol >= 0) cursor.getString(bodyCol) ?: "" else ""
        if (!isAcceptedMessage(address, text)) continue
        out.add(
          mapOf(
            "id" to (if (idCol >= 0) cursor.getString(idCol) ?: "" else ""),
            "address" to address,
            "body" to text,
            "date" to (if (dateCol >= 0) cursor.getLong(dateCol).toDouble() else 0.0)
          )
        )
      }
    }
    return out
  }

  private fun peekQueue(context: Context): List<Map<String, Any>> {
    synchronized(Companion) {
      val arr = loadQueue(context)
      return (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        mapOf(
          "id" to o.optString("qid"),
          "address" to o.optString("address"),
          "body" to o.optString("body"),
          "date" to o.optLong("date").toDouble()
        )
      }
    }
  }

  private fun removeFromQueue(context: Context, ids: Set<String>) {
    synchronized(Companion) {
      val arr = loadQueue(context)
      val kept = JSONArray()
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        if (!ids.contains(o.optString("qid"))) kept.put(o)
      }
      saveQueue(context, kept)
    }
  }

  companion object {
    const val EVENT_SMS_RECEIVED = "onSmsReceived"

    /**
     * Only these senders are ever read (matched case-insensitively against the dash-separated parts of
     * the SMS address, so "VM-FEDMOBILE", "AX-FEDMOBILE-S" and "FedMobile" all match). Add more here and in
     * mobile/src/expenses/senderAllowList.ts to support another bank.
     */
    val ALLOWED_SENDERS = listOf("FEDBNK", "FEDMOBILE")

    private val FEDERAL_SIGNATURE = Regex("-\\s*Federal Bank\\s*\\.?\\s*$", RegexOption.IGNORE_CASE)

    /** The bank's own signature at the end of the body ("... -Federal Bank"). JS additionally requires the parser to match. */
    fun hasFederalSignature(body: String?): Boolean = !body.isNullOrBlank() && FEDERAL_SIGNATURE.containsMatchIn(body.trim())

    fun isAcceptedMessage(address: String?, body: String?): Boolean = isAllowedSender(address) || hasFederalSignature(body)

    fun isAllowedSender(address: String?): Boolean {
      if (address.isNullOrBlank()) return false
      val parts = address.uppercase().split("-").map { it.trim() }
      return parts.any { ALLOWED_SENDERS.contains(it) }
    }

    private const val DEFAULT_LIMIT = 500
    private const val PREFS = "sms_expense_reader"
    private const val KEY_QUEUE = "queued_sms"
    private const val MAX_QUEUED = 200

    /** Every live React runtime (a dev build has more than one); events go to all of them. */
    private val instances = java.util.concurrent.CopyOnWriteArraySet<SmsExpenseReaderModule>()

    private fun loadQueue(context: Context): JSONArray {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      return try { JSONArray(prefs.getString(KEY_QUEUE, "[]")) } catch (_: Exception) { JSONArray() }
    }

    private fun saveQueue(context: Context, arr: JSONArray) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (arr.length() == 0) prefs.edit().remove(KEY_QUEUE).commit()
      else prefs.edit().putString(KEY_QUEUE, arr.toString()).commit()
    }

    /** Tells every live JS runtime about a new SMS. Returns true if at least one runtime got it. */
    fun emitReceived(address: String, body: String, date: Long): Boolean {
      var delivered = false
      for (module in instances) {
        try {
          module.sendEvent(EVENT_SMS_RECEIVED, mapOf("address" to address, "body" to body, "date" to date.toDouble()))
          delivered = true
        } catch (_: Exception) {
          // That runtime is gone: nothing to tell.
        }
      }
      return delivered
    }

    /** Keeps an SMS only until JS has processed it (removeQueuedSms). */
    fun enqueue(context: Context, address: String, body: String, date: Long) {
      synchronized(this) {
        val arr = loadQueue(context)
        arr.put(JSONObject().put("qid", UUID.randomUUID().toString()).put("address", address).put("body", body).put("date", date))
        // Keep only the newest MAX_QUEUED; the inbox scan covers anything older.
        val trimmed = JSONArray()
        for (i in maxOf(0, arr.length() - MAX_QUEUED) until arr.length()) trimmed.put(arr.get(i))
        saveQueue(context, trimmed)
      }
    }
  }
}
