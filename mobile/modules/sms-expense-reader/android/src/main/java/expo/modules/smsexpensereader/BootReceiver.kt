package expo.modules.smsexpensereader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts the tracking service after a reboot or an app update, only if tracking is ON. specialUse
 * foreground services may be started from BOOT_COMPLETED on Android 15; anything Android refuses is
 * ignored (the next app open or incoming SMS starts it). Never throws.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      when (intent.action) {
        Intent.ACTION_BOOT_COMPLETED,
        Intent.ACTION_MY_PACKAGE_REPLACED,
        "android.intent.action.QUICKBOOT_POWERON",
        "com.htc.intent.action.QUICKBOOT_POWERON" -> SmsTrackingService.ensureRunning(context)
        else -> Unit
      }
    } catch (_: Exception) {
      // Never crash the receiver.
    }
  }
}
