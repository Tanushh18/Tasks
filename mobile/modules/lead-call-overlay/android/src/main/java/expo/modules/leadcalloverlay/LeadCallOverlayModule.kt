package expo.modules.leadcalloverlay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/**
 * JS side: mobile/src/leads/callOverlay.ts. When the user calls a lead from the app, JS starts a
 * short-lived foreground service that waits for the call to end and then shows a stage card over
 * whatever app is open. Taps are sent back as events, or queued if JS isn't running.
 */
class LeadCallOverlayModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("LeadCallOverlay")

    Events(EVENT_OUTCOME, EVENT_LATER, EVENT_CALL_ENDED)

    OnCreate { instances.add(this@LeadCallOverlayModule) }
    OnDestroy { instances.remove(this@LeadCallOverlayModule) }

    Function("canDrawOverlays") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    }

    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("startCallWatch") { leadId: String, name: String, phone: String, statuses: List<String> ->
      val intent = Intent(context, LeadCallService::class.java).apply {
        action = LeadCallService.ACTION_START
        putExtra(LeadCallService.EXTRA_LEAD_ID, leadId)
        putExtra(LeadCallService.EXTRA_NAME, name)
        putExtra(LeadCallService.EXTRA_PHONE, phone)
        putStringArrayListExtra(LeadCallService.EXTRA_STATUSES, ArrayList(statuses))
      }
      ContextCompat.startForegroundService(context, intent)
    }

    Function("stopCallWatch") {
      context.stopService(Intent(context, LeadCallService::class.java))
    }

    Function("showTestOverlay") {
      val intent = Intent(context, LeadCallService::class.java).apply {
        action = LeadCallService.ACTION_TEST
        putExtra(LeadCallService.EXTRA_LEAD_ID, "")
        putExtra(LeadCallService.EXTRA_NAME, "Test lead")
        putExtra(LeadCallService.EXTRA_PHONE, "")
        putStringArrayListExtra(LeadCallService.EXTRA_STATUSES, arrayListOf("Interested", "Called — no answer", "Not interested"))
      }
      ContextCompat.startForegroundService(context, intent)
    }

    Function("takeQueuedOutcomes") {
      takeQueue(context)
    }
  }

  private fun takeQueue(context: Context): List<Map<String, Any>> {
    synchronized(Companion) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
      prefs.edit().remove(KEY_QUEUE).commit()
      val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
      return (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        mapOf("leadId" to o.optString("leadId"), "status" to o.optString("status"), "at" to o.optLong("at"))
      }
    }
  }

  companion object {
    const val EVENT_OUTCOME = "onOutcome"
    const val EVENT_LATER = "onLater"
    const val EVENT_CALL_ENDED = "onCallEnded"
    private const val PREFS = "lead_call_overlay"
    private const val KEY_QUEUE = "queued_outcomes"

    /** Every live React runtime (a dev build has more than one); events go to all of them. */
    private val instances = java.util.concurrent.CopyOnWriteArraySet<LeadCallOverlayModule>()

    /**
     * Stages picked on the overlay always go into a queue first; the event only says "check the queue".
     * JS drains it with takeQueuedOutcomes(), so nothing is applied twice or lost if JS isn't running.
     */
    fun deliverOutcome(context: Context, leadId: String, status: String) {
      synchronized(this) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = try { JSONArray(prefs.getString(KEY_QUEUE, "[]")) } catch (_: Exception) { JSONArray() }
        arr.put(JSONObject().put("leadId", leadId).put("status", status).put("at", System.currentTimeMillis()))
        prefs.edit().putString(KEY_QUEUE, arr.toString()).commit()
      }
      emit(EVENT_OUTCOME, leadId)
    }

    fun emit(event: String, leadId: String) {
      for (module in instances) {
        try {
          module.sendEvent(event, mapOf("leadId" to leadId))
        } catch (_: Exception) {
          // That runtime is gone: nothing to tell.
        }
      }
    }
  }
}
