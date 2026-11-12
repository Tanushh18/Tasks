package expo.modules.whatsappautosender

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After a reboot, starts the background sender again if it was on. */
class AutoSendBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
    if (Store.enabled(context)) {
      try {
        AutoSendService.start(context)
      } catch (_: Exception) {
        // Android may refuse a start from the background; the app restarts it when opened.
      }
    }
  }
}
