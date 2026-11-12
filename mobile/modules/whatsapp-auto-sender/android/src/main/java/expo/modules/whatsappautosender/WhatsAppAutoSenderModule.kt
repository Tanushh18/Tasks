package expo.modules.whatsappautosender

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS side: mobile/src/leads/whatsappAuto.ts. */
class WhatsAppAutoSenderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("WhatsAppAutoSender")

    /** True once the person has switched the accessibility service on in Settings. */
    Function("isServiceEnabled") {
      if (WhatsAppAutoService.isRunning()) return@Function true
      val flat = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      val me = ComponentName(context, WhatsAppAutoService::class.java).flattenToString()
      flat.split(':').any { it.equals(me, ignoreCase = true) }
    }

    Function("openAccessibilitySettings") {
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** WhatsApp Business only (no fallback to normal WhatsApp), or "" when it is not installed. */
    Function("whatsappPackage") {
      listOf("com.whatsapp.w4b").firstOrNull { pkg ->
        try {
          context.packageManager.getPackageInfo(pkg, 0)
          true
        } catch (_: PackageManager.NameNotFoundException) {
          false
        }
      } ?: ""
    }

    /** Opens the chat and starts pressing Send. Poll jobState() for the outcome. */
    Function("startJob") { packageName: String, imageUri: String?, mime: String, text: String, digits: String?, chatName: String? ->
      WhatsAppAutoService.start(packageName, imageUri, mime, text, digits, chatName)
    }

    Function("jobState") {
      mapOf("state" to WhatsAppAutoService.state, "message" to WhatsAppAutoService.stateMessage)
    }

    Function("cancelJob") { WhatsAppAutoService.cancel() }

    /** Starts the background sender. `config` is JSON from JS: baseUrl, access/refresh tokens, origin, templates. */
    Function("startBackground") { config: String ->
      val j = org.json.JSONObject(config)
      expo.modules.whatsappautosender.Store.saveConfig(
        context,
        j.getString("baseUrl"),
        j.getString("accessToken"),
        j.optString("refreshToken"),
        j.optString("origin", "all"),
        j.getJSONArray("templates").toString(),
        j.optBoolean("testMode", false)
      )
      expo.modules.whatsappautosender.Store.setEnabled(context, true)
      expo.modules.whatsappautosender.AutoSendService.start(context)
    }

    Function("stopBackground") { expo.modules.whatsappautosender.AutoSendService.stop(context) }

    Function("backgroundState") {
      val c = context
      mapOf(
        "enabled" to expo.modules.whatsappautosender.Store.enabled(c),
        "running" to expo.modules.whatsappautosender.Store.running(c),
        "sentToday" to expo.modules.whatsappautosender.Store.sentToday(c),
        "sentTotal" to expo.modules.whatsappautosender.Store.sentTotal(c),
        "status" to expo.modules.whatsappautosender.Store.status(c)
      )
    }

    /** Opens the battery screen for We Three so Android doesn't stop the background sender. */
    Function("openBatterySettings") {
      val i = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, android.net.Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(i)
    }
  }
}
