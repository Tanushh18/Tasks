package expo.modules.whatsappautosender

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Settings and counters for the background sender, kept in this app's private preferences. The login tokens are stored
 * here too, because the service has to refresh the login while the app is closed.
 */
object Store {
  private const val PREFS = "auto_send_bg"

  private fun p(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun enabled(ctx: Context) = p(ctx).getBoolean("enabled", false)
  fun setEnabled(ctx: Context, v: Boolean) = p(ctx).edit().putBoolean("enabled", v).apply()
  fun setRunning(ctx: Context, v: Boolean) = p(ctx).edit().putBoolean("running", v).apply()
  fun running(ctx: Context) = p(ctx).getBoolean("running", false)

  fun baseUrl(ctx: Context) = p(ctx).getString("baseUrl", "") ?: ""
  fun accessToken(ctx: Context) = p(ctx).getString("accessToken", "") ?: ""
  fun refreshToken(ctx: Context) = p(ctx).getString("refreshToken", "") ?: ""
  fun origin(ctx: Context) = p(ctx).getString("origin", "all") ?: "all"
  fun templates(ctx: Context): JSONArray = JSONArray(p(ctx).getString("templates", "[]") ?: "[]")

  fun saveTokens(ctx: Context, access: String, refresh: String) {
    p(ctx).edit().putString("accessToken", access).putString("refreshToken", refresh).apply()
  }

  /** Called from JS when the toggle goes on: everything the service needs to run without the app. */
  fun testMode(ctx: Context) = p(ctx).getBoolean("testMode", false)

  fun saveConfig(ctx: Context, baseUrl: String, access: String, refresh: String, origin: String, templatesJson: String, testMode: Boolean) {
    p(ctx).edit()
      .putBoolean("testMode", testMode)
      .putString("baseUrl", baseUrl)
      .putString("accessToken", access)
      .putString("refreshToken", refresh)
      .putString("origin", origin)
      .putString("templates", templatesJson)
      .apply()
  }

  fun rollDay(ctx: Context, today: String) {
    if (p(ctx).getString("day", "") != today) {
      p(ctx).edit().putString("day", today).putInt("sentToday", 0).apply()
    }
  }

  fun sentToday(ctx: Context) = p(ctx).getInt("sentToday", 0)
  fun sentTotal(ctx: Context) = p(ctx).getInt("sentTotal", 0)
  fun nextDueAt(ctx: Context) = p(ctx).getLong("nextDueAt", 0L)
  fun setNextDue(ctx: Context, ms: Long) = p(ctx).edit().putLong("nextDueAt", ms).apply()
  fun lastTemplateId(ctx: Context) = p(ctx).getString("lastTemplateId", "") ?: ""
  fun status(ctx: Context) = p(ctx).getString("status", "") ?: ""
  fun setStatus(ctx: Context, s: String) = p(ctx).edit().putString("status", s).apply()

  fun addSent(ctx: Context, leadId: String, templateId: String, now: Long) {
    val sentToday = sentToday(ctx) + 1
    val total = sentTotal(ctx) + 1
    p(ctx).edit()
      .putInt("sentToday", sentToday)
      .putInt("sentTotal", total)
      .putString("lastTemplateId", templateId)
      .apply()
    addToSet(ctx, "done", leadId)
  }

  fun addSkipped(ctx: Context, leadId: String) = addToSet(ctx, "skipped", leadId)
  fun addDone(ctx: Context, leadId: String) = addToSet(ctx, "done", leadId)
  fun isSkipped(ctx: Context, leadId: String) = inSet(ctx, "skipped", leadId)
  fun isDone(ctx: Context, leadId: String) = inSet(ctx, "done", leadId)

  private fun inSet(ctx: Context, key: String, id: String): Boolean {
    val arr = JSONArray(p(ctx).getString(key, "[]") ?: "[]")
    for (i in 0 until arr.length()) if (arr.optString(i) == id) return true
    return false
  }

  private fun addToSet(ctx: Context, key: String, id: String) {
    val arr = JSONArray(p(ctx).getString(key, "[]") ?: "[]")
    val out = JSONArray()
    for (i in 0 until arr.length()) if (arr.optString(i) != id) out.put(arr.optString(i))
    out.put(id)
    // Keep the newest 1000 ids so the list stays small.
    val start = maxOf(0, out.length() - 1000)
    val trimmed = JSONArray()
    for (i in start until out.length()) trimmed.put(out.optString(i))
    p(ctx).edit().putString(key, trimmed.toString()).apply()
  }

  fun currentLead(ctx: Context): JSONObject? {
    val raw = p(ctx).getString("currentLead", "") ?: ""
    return if (raw.isEmpty()) null else JSONObject(raw)
  }

  fun setCurrentLead(ctx: Context, lead: JSONObject?) {
    p(ctx).edit().putString("currentLead", lead?.toString() ?: "").apply()
  }
}
