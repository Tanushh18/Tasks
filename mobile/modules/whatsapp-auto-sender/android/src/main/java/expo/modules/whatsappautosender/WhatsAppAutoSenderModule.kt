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

    /** WhatsApp Business when installed, otherwise WhatsApp, otherwise "". */
    Function("whatsappPackage") {
      listOf("com.whatsapp.w4b", "com.whatsapp").firstOrNull { pkg ->
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
  }
}
