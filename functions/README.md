# Endless leaderboard Functions codebase

This is a separate local Firebase Functions codebase. It leaves the root site's npm scripts and GitHub Pages deployment intact. The root `firebase.json` has no Hosting target and there is no production `.firebaserc` alias.

## Ranked-run verification

Ranked Endless is a separate mode gated by explicit public-leaderboard consent and a backend config that remains disabled by default. The server stores each run and correct answer privately, generates each challenge with cryptographic randomness, accepts one wire selection per bomb, and derives score, streak, and progression itself. Ranked play disables all powers and uses the fixed server scoring curve in `VERIFICATION_DESIGN.md`; normal local Endless remains unchanged and playable offline.

The emulator suite exercises exported callable functions and the same production verifier/service code. It does not inject an always-successful verifier. The Functions Emulator relaxes App Check enforcement only when `FUNCTIONS_EMULATOR=true`; deployed callables require App Check. Emulator testing does not verify production App Check providers.

## Local tests and emulators

From this directory:

```powershell
npm test
npm run test:emulator
```

The emulator suite uses only the `demo-bomb-defuse` project ID and starts Auth, Firestore, and Functions emulators. `npm run emulators` starts them interactively. Root website scripts are unchanged.

For manual browser/WebView ranked-run testing, use a disposable test build and temporarily enable both `firebaseEmulator.enabled` and `emulator.enabled` in the root `leaderboard-config.js`, keeping `enabled: true` and the project as `demo-bomb-defuse`. This also routes Auth and Firestore to emulators, not production. Configure an emulator user with both leaderboard opt-in fields true and a valid account display name. Restore every emulator/backend flag to false before creating any release build.

## Callable contract

- `getBestScoreLeaderboard` / `getBestStreakLeaderboard`: App Check required; authentication optional; only sanitized public top-50 rows.
- `getMyEndlessLeaderboardRank`: App Check and Auth required; checks both private opt-in fields.
- `beginEndlessLeaderboardRun`: Auth, App Check, and explicit opt-in required; returns a public challenge while storing the answer privately.
- `submitEndlessLeaderboardAction`: Auth, App Check, opt-in, active run, sequence, challenge ID, expiry, and exact wire index required. No score, streak, timestamp, transcript, or power field is accepted.
- `finishEndlessLeaderboardRun`: Auth, App Check, opt-in, run ownership, and sequence required; publishes only server-derived metrics.
- `withdrawEndlessLeaderboard`: authenticated, App Check protected; removes public entries and UID-private mapping.

Public docs are `endlessLeaderboardScores/{opaqueId}` and `endlessLeaderboardStreaks/{opaqueId}` and contain only `publicEntryId`, opted-in `displayName`, `metric`, and `updatedAt`. `leaderboardPrivateOwners/{uid}`, rate limits, and `leaderboardRuns/{uid}/runs/{runId}` remain private. Firestore client access to leaderboard collections is denied; public reads go through callable Functions.

Local rules have not been deployed and must be compared with the Firebase Console rules before any approved deployment. Cloud Functions deployment requires Blaze billing; this work does not enable billing or deploy anything.
