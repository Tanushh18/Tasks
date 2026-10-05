const fs = require("fs");
const path = require("path");
const { withAppBuildGradle, withDangerousMod, withMainApplication } = require("@expo/config-plugins");

/**
 * GitHub-only build + OTA, with no expo-updates:
 *  1. MainApplication loads a downloaded JS bundle (files/ota/current.bundle) when one is valid, otherwise the
 *     bundle embedded in the APK.
 *  2. BuildConfig.OTA_BASE records when the APK was built (env OTA_VERSION), so a stale downloaded bundle from
 *     before this APK is never preferred over the embedded one.
 *  3. The release build is signed with the keystore in env ANDROID_KEYSTORE_FILE (+ _PASSWORD, ANDROID_KEY_ALIAS,
 *     ANDROID_KEY_PASSWORD) when present, and with the template debug keystore otherwise.
 */

const OTA_BUNDLE_KT = (pkg) => `package ${pkg}

import android.content.Context
import java.io.File

/**
 * Picks the JS bundle to start with. Layout under filesDir/ota:
 *   current.bundle   the downloaded Hermes bundle
 *   current.meta     "<runtimeVersion>\\n<otaVersion>"
 *   launching        written when we start on a downloaded bundle, deleted by JS once the app has booted
 *   bad              otaVersion of a bundle that never booted (JS skips it)
 * A bundle is used only if it matches this APK's runtime version, is newer than the APK's own bundle, and the
 * previous launch on it was confirmed. Anything else falls back to the bundle embedded in the APK.
 */
object OtaBundle {
  @JvmStatic
  fun bundlePath(context: Context): String? {
    return try {
      val dir = File(context.filesDir, "ota")
      val bundle = File(dir, "current.bundle")
      val meta = File(dir, "current.meta")
      if (!bundle.exists() || !meta.exists()) return null

      val lines = meta.readText().trim().lines()
      val runtime = lines[0].trim()
      val version = lines[1].trim().toLong()

      val launching = File(dir, "launching")
      if (launching.exists()) {
        File(dir, "bad").writeText(version.toString())
        discard(dir)
        return null
      }
      if (runtime != BuildConfig.VERSION_NAME || version <= BuildConfig.OTA_BASE) {
        discard(dir)
        return null
      }
      launching.writeText(version.toString())
      bundle.absolutePath
    } catch (e: Exception) {
      null
    }
  }

  private fun discard(dir: File) {
    File(dir, "current.bundle").delete()
    File(dir, "current.meta").delete()
    File(dir, "launching").delete()
  }
}
`;

function withOtaBundleFile(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = cfg.android && cfg.android.package;
      if (!pkg) throw new Error("withGithubOta: android.package is required in app.json");
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "java", ...pkg.split("."));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "OtaBundle.kt"), OTA_BUNDLE_KT(pkg));
      return cfg;
    },
  ]);
}

function withOtaMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("OtaBundle.bundlePath")) return cfg;
    const anchor = "context = applicationContext,";
    if (!src.includes(anchor)) {
      throw new Error("withGithubOta: could not find `" + anchor + "` in MainApplication.kt (template changed?)");
    }
    src = src.replace(anchor, anchor + "\n      jsBundleFilePath = OtaBundle.bundlePath(applicationContext),");
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withOtaGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes("OTA_BASE")) return cfg;

    const levelLine = /(buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL"[^\n]*\n)/;
    if (!levelLine.test(g)) throw new Error("withGithubOta: REACT_NATIVE_RELEASE_LEVEL buildConfigField not found");
    g = g.replace(
      levelLine,
      `$1        buildConfigField "long", "OTA_BASE", "\${System.getenv('OTA_VERSION') ?: '0'}L"\n`
    );

    const debugSigning = /(signingConfigs \{\n\s+debug \{[\s\S]*?\n\s+\}\n)/;
    if (!debugSigning.test(g)) throw new Error("withGithubOta: debug signingConfig block not found");
    g = g.replace(
      debugSigning,
      `$1        if (System.getenv('ANDROID_KEYSTORE_FILE')) {
            release {
                storeFile file(System.getenv('ANDROID_KEYSTORE_FILE'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
`
    );

    const releaseSigning = /(release \{\n(?:\s+\/\/[^\n]*\n)*\s+signingConfig )signingConfigs\.debug/;
    if (!releaseSigning.test(g)) throw new Error("withGithubOta: release signingConfig line not found");
    g = g.replace(releaseSigning, "$1System.getenv('ANDROID_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug");

    cfg.modResults.contents = g;
    return cfg;
  });
}

module.exports = function withGithubOta(config) {
  config = withOtaBundleFile(config);
  config = withOtaMainApplication(config);
  config = withOtaGradle(config);
  return config;
};
