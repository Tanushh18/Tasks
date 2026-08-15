# Daily Tasks — Smart Tasks, Reminder & Finance App

A task/reminder manager and personal finance tracker with mobile-number + MPIN auth and MongoDB sync.
See `/Users/t/.claude/plans/merry-wandering-allen.md` for the full phased plan.

**Phase 1: done and verified.** Auth, tasks, reminders/local notifications, finance accounts &
transactions, settings — all working end-to-end against a real backend API.

**Phase 2: done, structurally verified — needs your Gemini key for a live test.** Gemini AI
integration with backend-controlled tool-calling (never raw DB access), a confirmation flow for
financial actions, a real chat UI, and real microphone voice input + spoken replies. See "AI &
Voice setup" below.

**Phase 3: done.** Finance charts (cash-flow trend, category/account breakdown), a calendar view for
tasks, global search, an offline queue with idempotent sync, a 38-test backend suite, and production
hardening (Dockerfile, trust-proxy config, test-env-aware rate limiting). Details below.

## Project structure

```
backend/   Node.js + Express + TypeScript + MongoDB (Mongoose) REST API
mobile/    Expo (React Native) + TypeScript app — Android & iOS
```

## Running the backend

```bash
cd backend
npm install
cp .env.example .env   # fill in JWT secrets; leave MONGO_URI empty for local dev
npm run dev
```

- If `MONGO_URI` is left empty, the backend automatically boots an **in-memory MongoDB**
  (`mongodb-memory-server`) — good for local development, but data does **not** persist across
  restarts.
- To use a real database (required in production), set `MONGO_URI` to a MongoDB Atlas connection
  string in `backend/.env`. Nothing else needs to change — the app code is identical either way.
- Health check: `GET http://localhost:4000/health`

Verified end-to-end during Phase 1: register → login → create task with reminder → create finance
account → cash-in/cash-out transactions → financial summary math → data isolation between two
different users → validation errors (weak MPIN, mismatched confirm, negative amounts, missing
auth) — all behaved correctly.

### Automated tests (Phase 3)

```bash
cd backend
npm test
```

38 tests across auth, tasks, finance, search, and assistant (`tests/*.test.ts`, Jest + Supertest,
against a fresh in-memory MongoDB per run). All passing. Writing these caught two real bugs no
amount of manual curl-testing had surfaced:

- **Compound sparse-index gotcha**: the idempotency-key unique index was defined with `sparse: true`
  on a *compound* key (`{userId, idempotencyKey}`). MongoDB's sparse rule for compound indexes only
  excludes a document if it's missing **all** indexed fields — since `userId` is always present,
  every task/transaction was still indexed with `idempotencyKey: null`, so the *second* task or
  transaction any user created would silently fail with a duplicate-key error. Fixed with a
  `partialFilterExpression: { idempotencyKey: { $exists: true } }` instead of `sparse`.
- The registration rate limiter (correctly) blocks after 10 requests/hour — which a fast test suite
  creating dozens of users blows straight through. Rate limiters are now `skip`ped under
  `NODE_ENV=test` (identical behavior in dev/production; nothing else changed).

## Running the mobile app

```bash
cd mobile
cp .env.example .env
# edit EXPO_PUBLIC_API_URL in .env to point at your backend:
#   iOS simulator      -> http://localhost:4000/api
#   Android emulator    -> http://10.0.2.2:4000/api
#   Physical device      -> http://<your-computer's-LAN-IP>:4000/api
npm install
npx expo start
```

Then press `i` (iOS simulator), `a` (Android emulator), or scan the QR code with Expo Go on a
physical device. The backend must be running and reachable at the URL you set above.

**Important:** since Phase 2 added real microphone voice input (`expo-speech-recognition`), **Expo
Go can no longer run this app** — that library needs native code Expo Go doesn't ship. Use
`npx expo run:android` or `npx expo run:ios` (or an EAS development build) instead of `expo start`
+ Expo Go from now on. Everything else in the app (typed chat, tasks, finance, TTS) still works the
same way, just from the dev-client build rather than Expo Go.

**What I verified in this environment:** the full TypeScript project typechecks with zero errors
after every phase, and Metro successfully bundles the entire app for both iOS and Android with no
import or build errors (re-checked after Phase 3's charts/calendar/search/offline additions too).

This machine also has a real Android emulator and SDK, so I've twice tried to go further than
bundle-checking and actually build + install the dev client on the emulator (`Pixel_7_API`) to
exercise voice input for real — both times it ran out of disk mid-build (`ENOSPC`) rather than
failing on anything in the code. Everything up to that point worked correctly: prebuild succeeded,
the Gradle distribution downloaded, and the native compile started — this was purely a disk-space
problem, not an app problem. The main culprit was `~/.gradle` (Gradle's download/build cache — not
part of this project, lives in your home directory) growing to 2.3GB across the two attempts; with
your OK I removed it after the second attempt, which took free space from ~3.5GB back up to ~6.8GB.
It'll rebuild itself (smaller and just what's needed) on the next `npx expo run:android`. I haven't
re-run the build since clearing it — if you'd like me to try again, say so and I will; otherwise
this is the natural next thing to run yourself when convenient.

## AI & Voice setup (Phase 2)

```bash
cd backend
# add to .env:
GEMINI_API_KEY=your-key-from-https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-3.6-flash   # already the default; only change if you want a different model
```

No mobile-side config needed for AI — the mobile app only ever talks to your backend, never to
Gemini directly, per the "never expose the AI key in the mobile app" requirement.

- **Text chat**: works immediately in a dev-client build once the backend has a Gemini key. Without
  a key, `POST /api/assistant/message` returns a clean `503 AI_NOT_CONFIGURED` error (verified) —
  the app shows that as a chat message rather than crashing.
- **Voice input**: tap the mic on the Assistant tab, or "Voice Command" on Home. Requires the
  dev-client build (see above) and microphone/speech permission on first use.
- **Confirmation for money**: Settings → AI & Voice → "Confirm financial actions" (on by default).
  When on, the assistant proposes cash-in/cash-out transactions and waits for you to tap Confirm
  before saving anything — it never silently writes a financial transaction to your account.
- **Spoken replies**: Settings → AI & Voice → "Speak assistant replies" (on by default) reads
  responses aloud after you use voice input.

## Charts, calendar & search (Phase 3)

- **Finance → the bar-chart icon → Insights**: a 6-month cash-flow trend line, category-wise
  spending, and account-wise spending, all built with `react-native-svg` and plain Views (no chart
  library) following the `dataviz` skill's method. The 8-hue categorical palette used for
  category/account bars is the skill's validated default, re-checked with its own
  `validate_palette.js` against this app's actual light (`#FFFFFF`) and dark (`#191B23`) chart
  surfaces — both pass. Cash-in/cash-out use the app's existing semantic success/danger colors
  rather than the categorical ramp, since that mapping is already the fixed convention everywhere
  else in the app (badges, text). Category/account breakdowns cap at the top 6 + "Other" per the
  skill's series-count ladder, and every bar carries a direct text label (never color-alone
  identity) — required regardless, since 3 of the 8 hues fall under 3:1 contrast on the light
  surface.
- **Tasks → the calendar icon**: month view with a dot on any day that has tasks (red if overdue),
  tap a day to see/add/complete/delete its tasks.
- **Home → the search icon**: debounced global search across tasks, transactions, and account
  names, scoped to the signed-in user (verified in the backend test suite).

## Offline support (Phase 3)

Scope: **creating** a task or logging a transaction while offline. Editing/deleting offline and
full offline-first browsing are not covered — flagged here rather than silently left out.

- If saving a new task or transaction gets a genuine network failure (no response at all — not a
  validation error), it's queued locally (AsyncStorage) with a client-generated idempotency key
  instead of being lost, and you see "Saved offline — will sync automatically."
- The queue flushes automatically on app start (if online) and every time the device transitions
  from offline to online (`@react-native-community/netinfo`). Each retry reuses the same
  idempotency key, so a flaky connection can never create a duplicate — the backend recognizes the
  key and returns the original record instead of inserting again (covered by the backend test
  suite).
- The Home dashboard caches its last successful load and falls back to it (with a "You're offline —
  showing data from Xm ago" banner and a pending-sync count) if the network call fails. Other
  screens don't cache yet — a reasonable next cut if you want full offline browsing.

## Production deployment

- `backend/Dockerfile` — multi-stage build (`npm run build` → slim runtime image), `EXPOSE 4000`,
  runs as the non-root `node` user.
- Set `app.set("trust proxy", 1)` is already wired in for `NODE_ENV=production` — needed so the
  login/register rate limiters see the real client IP through a reverse proxy/load balancer instead
  of rate-limiting the proxy itself.
- Required env vars in production: `MONGO_URI` (a real Atlas string — the code throws at startup if
  this is missing when `NODE_ENV=production`), `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (also
  required, no dev fallback in production), `GEMINI_API_KEY` for the assistant, `CORS_ORIGIN` set to
  your actual app origin(s) instead of `*`.
- Health check for your load balancer / orchestrator: `GET /health`.

## Notes / things to know

- **No OTP anywhere**, per your instruction — registration is Mobile Number → Create MPIN →
  Confirm MPIN only.
- **Reminders are part of Task**, not a separate database resource (the spec described both). Every
  reminder belongs to a task; `GET /api/reminders/upcoming` is a read-only view derived from tasks.
- **Account balance = cash-in − cash-out** for that account (optionally within a date range) — a
  cash-flow balance, not a ledger balance seeded from an opening amount.
- Local notifications use `expo-notifications` and work in Expo Go. Push notifications (a different
  feature, not used in Phase 1) are restricted in Expo Go on Android — not relevant here since all
  reminders are scheduled locally on-device.
- Your installed Node.js is v20.18.0; several dependencies (React Native 0.86, Metro) request
  `>=20.19.4`. Everything installed and ran fine, but if you hit odd Metro/bundling issues later,
  upgrading Node (`nvm install --lts`) is the first thing to try.
- **Your git repository root is `/Users/t`** (your whole home folder), not this project — and it
  currently has unrelated pending file deletions from a different project (`Neo-Urban`). I didn't
  touch git at all during this build. Worth sorting out before you start committing this project.

## Environment variables

Never commit real secrets. See `backend/.env.example` and `mobile/.env.example`. You'll need to
supply, when ready: a MongoDB Atlas connection string, JWT secrets (`openssl rand -hex 32`), and
later a Gemini API key for Phase 2.
