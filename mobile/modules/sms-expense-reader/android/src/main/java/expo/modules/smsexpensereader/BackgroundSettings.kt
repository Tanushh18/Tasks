package expo.modules.smsexpensereader

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/** Battery-optimisation and OEM "auto-start" helpers. Every launch is best effort and never throws. */
object BackgroundSettings {
  fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    return try {
      (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)
    } catch (_: Exception) {
      false
    }
  }

  /** Shows Android's "Allow app to always run in the background?" dialog. Returns true if a screen opened. */
  fun requestIgnoreBatteryOptimizations(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
    if (isIgnoringBatteryOptimizations(context)) return true
    if (launch(context, Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName)))) return true
    return launch(context, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
  }

  private class Target(val manufacturers: List<String>, val pkg: String, val cls: String)

  private val TARGETS = listOf(
    // Oppo / Realme (ColorOS / realme UI) "Auto startup"
    Target(listOf("oppo", "realme"), "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
    Target(listOf("oppo", "realme"), "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
    Target(listOf("oppo", "realme"), "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
    // Xiaomi / Redmi / Poco
    Target(listOf("xiaomi", "redmi", "poco"), "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
    // Vivo / iQOO
    Target(listOf("vivo", "iqoo"), "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
    Target(listOf("vivo", "iqoo"), "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
    Target(listOf("vivo", "iqoo"), "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
    // OnePlus
    Target(listOf("oneplus"), "com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"),
    // Samsung
    Target(listOf("samsung"), "com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"),
    Target(listOf("samsung"), "com.samsung.android.sm_cn", "com.samsung.android.sm.ui.battery.BatteryActivity"),
    // Huawei / Honor
    Target(listOf("huawei", "honor"), "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
    Target(listOf("huawei", "honor"), "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
  )

  /** Opens the phone maker's auto-start screen if there is one, else this app's details screen. */
  fun openAutoStartSettings(context: Context): Boolean {
    val maker = (Build.MANUFACTURER ?: "").lowercase()
    for (t in TARGETS) {
      if (!t.manufacturers.any { maker.contains(it) }) continue
      if (launch(context, Intent().setComponent(ComponentName(t.pkg, t.cls)))) return true
    }
    return launch(context, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)))
  }

  private fun launch(context: Context, intent: Intent): Boolean {
    return try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }
}
