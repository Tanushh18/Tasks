# Expo accounts, APK builds and OTA updates

## Current setup (main account)

| What | Value |
| --- | --- |
| GitHub secret used by BOTH workflows | `EXPO_TOKEN_TANUSHCK84` |
| Used by | `.github/workflows/eas-build.yml` (APK + Firebase + OTA) and `.github/workflows/eas-update.yml` (OTA only) |
| Which Expo account | `tanush18` (project `we-three-t23`, project id `e767730c-591b-4400-8666-8aab6bbde252`, saved in `mobile/app.json`) |

APKs are now built **on the GitHub Actions runner** (`eas build --local`), not on Expo's servers, so the Expo
free-plan build limit no longer applies. The Expo account is still used for signing credentials, the project
link and OTA updates (`eas update`), which have their own, much larger limits. GitHub Actions minutes are the
new limit (private repos: about 2,000 free minutes a month; an Android build takes roughly 15-20 minutes).

## Secret to add when the main account runs out

Add ONE new GitHub secret (Repo -> Settings -> Secrets and variables -> Actions -> New repository secret):

- **Name: `EXPO_TOKEN_NEXT`**
- **Value:** an access token from the next Expo account (expo.dev -> that account -> Settings -> Access tokens).

If a third and fourth account are needed later, use `EXPO_TOKEN_NEXT_2`, `EXPO_TOKEN_NEXT_3`, and so on.

**Status: not wired in.** No workflow reads `EXPO_TOKEN_NEXT` yet. Adding the secret changes nothing until
the workflows are switched over (see below).

## What switching accounts involves (when the time comes)

1. Add the secret above (already planned, nothing else is needed from the repo yet).
2. Point both workflows at it: in `eas-build.yml` and `eas-update.yml` change
   `token: ${{ secrets.EXPO_TOKEN_TANUSHCK84 }}` to `token: ${{ secrets.EXPO_TOKEN_NEXT }}`.
3. Run **EAS Build** once. The build step reads the new token's account with `eas whoami`, clears the old
   project id and creates/links the project under the new account.
4. **Everyone installs the new APK once.** An installed APK only receives OTA updates from the Expo
   project it was built under, so APKs from the old account will not get OTA updates published by the new
   account. After that single install, OTA keeps working from the new account.
5. Save the new account's `owner` and `extra.eas.projectId` (and `updates.url`) in `mobile/app.json` so the
   OTA workflow publishes to the same project the APK was built under.

## Notes

- Free plan limits are per Expo account. OTA publishing (`eas update`) is far cheaper than a build, so one
  account normally lasts much longer for OTA than for builds.
- Never paste tokens into chat, commits or docs. Secrets live only in GitHub Actions secrets.
- The SMS expense reader and other native code only arrive with a new APK. JavaScript-only changes reach
  phones through OTA.
