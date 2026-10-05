# GitHub Actions APK Build & OTA Setup (No Expo)

This guide replaces Expo with GitHub Actions for building APKs and CodePush for OTA updates.

## 1. **Add GitHub Secrets**

Go to Repo → Settings → Secrets and variables → Actions:

### For APK Signing
- **ANDROID_KEYSTORE_B64**: Base64-encoded keystore file
  ```bash
  base64 -i debug.keystore | pbcopy  # macOS
  base64 -w 0 debug.keystore | xclip -selection clipboard  # Linux
  ```
  If you don't have a keystore yet:
  ```bash
  cd mobile/android/app
  keytool -genkey -v -keystore debug.keystore \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -alias my-key-alias
  ```

- **ANDROID_KEYSTORE_PASSWORD**: Keystore password
- **ANDROID_KEY_ALIAS**: Key alias (default: `my-key-alias`)
- **ANDROID_KEY_PASSWORD**: Key password (same as keystore password usually)

### For Firebase Distribution (optional)
- **FIREBASE_ANDROID_APP_ID**: From Firebase Console → Project Settings → Android App
- **FIREBASE_SERVICE_ACCOUNT**: Full JSON of a Firebase service account with "Firebase App Distribution Admin" role

### For CodePush OTA
- **APPCENTER_ACCESS_TOKEN**: Create at [appcenter.ms](https://appcenter.ms) → Account settings → API tokens

## 2. **Install CodePush in your app**

```bash
cd mobile
npm install react-native-code-push
npx appcenter-cli login
```

## 3. **Register app with CodePush**

```bash
appcenter apps create \
  -d We-Three-Android \
  -o tanush18 \
  -p Android
```

Get your deployment key:
```bash
appcenter codepush deployment list \
  -a tanush18/We-Three-Android
```

## 4. **Update app.json** (remove Expo updates, add CodePush)

Replace your `app.json` updates section:
```json
{
  "react-native-code-push": {
    "CodePushDeploymentKey": "YOUR_CODEPUSH_KEY_HERE"
  }
}
```

## 5. **Update App.tsx** to use CodePush

Replace `expo-updates` usage with CodePush:

```javascript
import codePush from "react-native-code-push";

let App = () => {
  // Your app code
};

App = codePush({
  checkFrequency: codePush.CheckFrequency.ON_APP_START,
  installMode: codePush.InstallMode.ON_NEXT_RESTART,
  mandatoryInstallMode: codePush.InstallMode.IMMEDIATE,
})(App);

export default App;
```

## 6. **Update package.json scripts**

Add to scripts section:
```json
"build:codepush": "react-native bundle --platform android --dev false --entry-file index.js --bundle-output ./android/app/src/main/assets/index.android.bundle --assets-dest ./android/app/src/main/res"
```

## 7. **Configure build.gradle.kts** (Android)

If you don't have `android/build.gradle.kts`, create it:

```kotlin
plugins {
    id("com.android.application") version "8.1.0" apply false
    id("com.android.library") version "8.1.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.0" apply false
}
```

Update `android/app/build.gradle.kts`:
```kotlin
plugins {
    id("com.android.application")
    id("kotlin-android")
}

android {
    compileSdk = 34
    
    defaultConfig {
        applicationId = "com.tanush.wethree"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }
    
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("MYAPP_UPLOAD_STORE_FILE") ?: "debug.keystore")
            storePassword = System.getenv("MYAPP_UPLOAD_STORE_PASSWORD") ?: ""
            keyAlias = System.getenv("MYAPP_UPLOAD_KEY_ALIAS") ?: "android"
            keyPassword = System.getenv("MYAPP_UPLOAD_KEY_PASSWORD") ?: ""
        }
    }
    
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    implementation("com.microsoft.appcenter:appcenter-crashes:5.0.0")
    implementation("com.microsoft.appcenter:appcenter-analytics:5.0.0")
    // Add React Native and CodePush dependencies
}
```

## 8. **Run the workflows**

### Manual APK Build
Go to Actions → "Build Android APK" → Run workflow

### Manual OTA Deploy
Go to Actions → "Deploy OTA Update (CodePush)" → Run workflow

### Automatic builds
On every push to `main` that touches `mobile/**`, the APK workflow runs automatically.

## Troubleshooting

**APK build fails with "react-native: command not found"**
- Add `npm ci` to install dependencies in workflow (already in the workflow)

**CodePush says "No deployment found"**
- Ensure you created the app and deployment:
  ```bash
  appcenter apps list
  appcenter codepush deployment list -a tanush18/We-Three-Android
  ```

**APK won't install**
- Check that package name matches in `build.gradle.kts` and signing config
- Verify keystore is valid: `keytool -list -v -keystore debug.keystore`

**OTA update not showing on app**
- Check app is calling `codePush.sync()` 
- Ensure `CodePushDeploymentKey` is set in app.json
- Force update with: `appcenter codepush deployment clear -a tanush18/We-Three-Android -d Production`
