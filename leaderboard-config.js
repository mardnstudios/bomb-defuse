// Public client configuration only. Leave disabled until the backend, App Check,
// Firestore rules, and score-verification protocol have been reviewed and deployed.
window.__BOMB_DEFUSE_LEADERBOARD_CONFIG__ = Object.freeze({
  enabled: false,
  projectId: "demo-bomb-defuse",
  region: "us-central1",
  appCheckSiteKey: "",
  firebaseEmulator: Object.freeze({
    enabled: false,
    projectId: "demo-bomb-defuse",
    host: "127.0.0.1",
    authPort: 9099,
    firestorePort: 8080,
  }),
  emulator: Object.freeze({
    enabled: false,
    host: "127.0.0.1",
    functionsPort: 5001,
  }),
});
