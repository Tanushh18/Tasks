# GitHub Actions APK Build & OTA Setup (GitHub Releases)

This guide sets up GitHub Actions to build APKs and GitHub Releases for OTA (Over-The-Air) updates.

## How it works

```
Push to main
      ↓
GitHub Actions builds APK + JS bundle
      ↓
APK → Firebase App Distribution (testers)
JS bundle → GitHub Release (OTA)
      ↓
App checks GitHub for new releases
      ↓
Downloads and installs update on next restart
```

## Setup Steps

### 1. Add GitHub Secrets

Go to Repo → Settings → Secrets and variables → Actions

**For APK Signing:**

Generate a keystore if you don't have one:
```bash
cd mobile/android/app
keytool -genkey -v -keystore debug.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias
```

Then add these secrets:

- **ANDROID_KEYSTORE_B64**: Base64-encoded keystore
  ```bash
  # macOS
  base64 -i debug.keystore | pbcopy
  
  # Linux
  base64 -w 0 debug.keystore | xclip -selection clipboard
  ```

- **ANDROID_KEYSTORE_PASSWORD**: Keystore password (from keytool)
- **ANDROID_KEY_ALIAS**: Key alias (use: `my-key-alias`)
- **ANDROID_KEY_PASSWORD**: Key password (same as keystore password)

**For Firebase Distribution (optional):**

- **FIREBASE_ANDROID_APP_ID**: From Firebase Console → Your Android App → App ID
- **FIREBASE_SERVICE_ACCOUNT**: Service account JSON with "Firebase App Distribution Admin" role

### 2. Verify React Native is properly set up

The `build:bundle` script is already added to `package.json`. It builds the JavaScript bundle for OTA:
```bash
npm run build:bundle
```

This outputs: `mobile/android/app/src/main/assets/index.android.bundle`

### 3. Test locally (optional)

```bash
cd mobile
npm ci
npm run build:bundle
```

### 4. Run the workflow

**Option A: Automatic (on every push to main)**
```bash
git push origin main
# GitHub Actions automatically runs the workflow
```

**Option B: Manual**
Go to Actions → "Build Android APK" → Run workflow

### 5. What happens

1. **APK is built** with Gradle and signing credentials
2. **JavaScript bundle is built** for OTA updates
3. **GitHub Release is created** with the bundle attached
4. **APK is sent to Firebase** for testers to download

## How OTA Updates Work

### For testers

1. Download and install APK from Firebase
2. App automatically checks GitHub Releases on startup
3. If new release found, downloads the JavaScript bundle
4. On next app restart, new code runs

### For you (developer)

**After initial APK:**

1. Make JavaScript changes (no native code)
2. Push to main
3. Wait for workflow to complete
4. GitHub Release is created automatically
5. Testers get update on next app restart (automatic)

**To force an update for testing:**
```bash
# Add to app code temporarily
import { clearStoredUpdate } from "./src/updates/githubReleaseUpdater";
await clearStoredUpdate();
```

## File Structure

```
mobile/
├── src/updates/
│   ├── useOtaUpdates.ts          ← Hook that checks for updates
│   └── githubReleaseUpdater.ts   ← GitHub API integration
├── android/app/src/main/assets/
│   └── index.android.bundle      ← Built by npm run build:bundle
└── package.json
    └── "build:bundle": "react-native bundle..."
```

## Troubleshooting

**Workflow fails: "react-native: command not found"**
- Already handled in workflow with `npm ci`
- If still fails, check Node version (should be 22)

**Bundle not uploaded to release**
- Ensure `npm run build:bundle` succeeds locally first
- Check that `android/app/src/main/assets/index.android.bundle` exists

**APK won't install**
- Verify keystore password is correct
- Test keystore: `keytool -list -v -keystore debug.keystore`
- Check package name in `android/app/build.gradle.kts` is `com.tanush.wethree`

**App doesn't download update**
- Ensure `useOtaUpdates()` is called in `App.tsx` (already is)
- Check GitHub repo is public (for unauthenticated API access)
- Check version comparison in `githubReleaseUpdater.ts` (semantic versioning)

**Need to debug update checking**
- Add to App.tsx temporarily:
  ```javascript
  import { getCustomBundlePath } from "./src/updates/githubReleaseUpdater";
  useEffect(() => {
    getCustomBundlePath().then(path => console.log("Custom bundle:", path));
  }, []);
  ```

## Limits

- **GitHub Releases storage**: Unlimited (free)
- **GitHub API**: 60 requests/hour unauthenticated (app checks every 30 min, so ~48/day = OK)
- **Release assets**: No size limit per file

## Next Steps

1. Add the 4 GitHub secrets
2. Push to main or manually run the workflow
3. Download APK from Firebase and test
4. Make a JS change and push again
5. Verify update is downloaded on next app restart
