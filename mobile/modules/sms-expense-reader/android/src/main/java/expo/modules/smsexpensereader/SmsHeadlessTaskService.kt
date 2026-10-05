package expo.modules.smsexpensereader

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS task "UpiSmsSync" (registered in mobile/index.ts) with no UI, so a new bank SMS is
 * saved to Money even when the app is closed. The task drains the native queue and syncs; it is
 * idempotent, so a repeat run (or the later inbox scan) never duplicates anything.
 */
class SmsHeadlessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    return HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), TIMEOUT_MS, true)
  }

  companion object {
    const val TASK_KEY = "UpiSmsSync"
    private const val TIMEOUT_MS = 45_000L

    /** Best effort: some phones refuse background service starts; the queue is then drained on next app open. */
    fun start(context: Context) {
      try {
        context.startService(Intent(context, SmsHeadlessTaskService::class.java))
        acquireWakeLockNow(context)
      } catch (_: Exception) {
        // Background start not allowed right now. The SMS stays queued natively; make sure the
        // foreground tracking service is up (it keeps the process alive); the queue is drained
        // the next time the app opens.
        try {
          SmsTrackingService.ensureRunning(context)
        } catch (_: Exception) {
          // ignore
        }
      }
    }
  }
}
