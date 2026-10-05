package expo.modules.smsexpensereader

import android.content.Context

/**
 * The "tracking is ON" flag, kept natively because BootReceiver / SmsReceivedReceiver cannot read JS
 * storage. Written by the module's startTracking()/stopTracking() (called from JS when the admin toggles
 * the switch, and cleared on sign-out).
 */
object TrackingPrefs {
  private const val PREFS = "sms_expense_reader"
  private const val KEY_ENABLED = "tracking_enabled"

  fun isEnabled(context: Context): Boolean =
    try { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false) } catch (_: Exception) { false }

  fun setEnabled(context: Context, enabled: Boolean) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).commit()
    } catch (_: Exception) {
      // ignore
    }
  }
}
