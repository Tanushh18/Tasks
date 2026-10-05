# Build the APK and ship updates from GitHub

No Expo account, EAS or third-party service. Two manual workflows (Actions tab → pick one → Run workflow).
Nothing runs on push.

| Workflow | Use it when | Result |
| --- | --- | --- |
| **Build APK** (`build-apk.yml`) | First install, or any native change: new native module, permission, plugin, new images/assets | Signed APK at <https://github.com/Tanushh18/Tasks/releases/download/apk-latest/app-release.apk>, also an Actions artifact. Optionally sent to Firebase testers. |
| **Publish OTA** (`publish-ota.yml`) | JavaScript-only change | Hermes bundle uploaded to the `ota-<version>` release. Installed apps download it and run it the launch after. |

Run the workflows on `main` (workflows only appear in the Actions tab once they are on the default branch).

## One-time setup

1. **Signing keystore (recommended).** Add four repository secrets (Settings → Secrets and variables → Actions):
   `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   ```bash
   keytool -genkeypair -v -keystore release.keystore -alias wethree -keyalg RSA -keysize 2048 -validity 10000
   base64 -w 0 release.keystore   # paste as ANDROID_KEYSTORE_B64
   ```
   Keep `release.keystore` somewhere safe: every future APK must be signed with the same key to install over the
   previous one. Without the secrets the build still works, signed with the Expo template's debug key (and says so
   in a warning), but switching to a real key later means uninstalling the app once.
2. **Firebase (optional).** `FIREBASE_ANDROID_APP_ID` and `FIREBASE_SERVICE_ACCOUNT` are already set. Tick
   "Also send the APK to Firebase" when running Build APK to use them.
3. **Repository must stay public.** The app downloads OTA bundles from the release URL without a token.

The first APK built here is signed with a different key than the EAS-built one, so Android will not install it over
the old app: uninstall the old app once.

## How OTA works

- `app.json` `version` is the **runtime version**. A bundle only runs on an APK with the same version.
- Publish OTA builds a bundle (`expo export:embed` + `hermesc`, the same as Gradle does for the APK) and uploads it with
  `ota-manifest.json` (`version` = build time, `runtimeVersion`, `size`) to the release `ota-<runtime version>`.
- On launch and on returning to the foreground (at most every 30 minutes) the app reads the manifest and, if it is for
  its runtime version and newer than what it runs, downloads the bundle to `files/ota/`.
- On the next cold start `OtaBundle.kt` (added by `mobile/plugins/withGithubOta.js`) hands that file to React Native
  instead of the bundle inside the APK. The download is never applied mid-use.
- A new APK ignores OTA bundles older than itself, so an old bundle never overrides a newer install.

**Safety net:** when a downloaded bundle is used, the app drops a `launching` marker that JS deletes once the app has
rendered. If the next launch still finds it (the bundle crashed on start), the bundle is discarded, the app starts from
the APK's own bundle and that OTA version is skipped. Publish a fixed OTA to recover.

## When to bump the version

Any change OTA cannot carry — native code, permissions, `app.json` plugins, new image/font files — needs
**Build APK** and a bumped `version` in `mobile/app.json`. Phones then keep their old APK until the new one is
installed, and never receive a bundle that needs native code they do not have.

## Limits

GitHub Releases and Actions on a public repo are free; release assets can be up to 2 GB. Downloads come from
`github.com/<repo>/releases/download/...`, which has no API rate limit.

## Not covered

- iOS. Only Android is wired up.
- The OTA path has been exercised up to bundling (Metro + Hermes), the plugin patching and the unit tests, but the
  first real run of **Build APK** and the first on-phone OTA are what prove the full chain end to end.
