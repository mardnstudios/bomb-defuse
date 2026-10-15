import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const helperSource = readFileSync(new URL("../scripts/leaderboard-preview.js", import.meta.url), "utf8");
const gameSource = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const copier = readFileSync(new URL("../scripts/copy-web-assets.mjs", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const leaderboardConfig = readFileSync(new URL("../leaderboard-config.js", import.meta.url), "utf8");

function loadPreviewApi() {
  const window = {};
  vm.runInNewContext(helperSource, { window, Object, Array, Number, String, RegExp });
  return window.BombDefuseLeaderboardPreview;
}

test("score and streak tabs render deterministic top-50 synthetic preview entries", () => {
  const api = loadPreviewApi();
  for (const metric of ["score", "streak"]) {
    const rows = api.createMockRows(metric);
    assert.equal(rows.length, 50);
    assert.deepEqual(rows.map(row => row.rank), Array.from({ length: 50 }, (_, index) => index + 1));
    assert.ok(rows.every(row => row.publicEntryId.startsWith(`preview-${metric}-`)));
    assert.ok(rows.every(row => row.displayName.startsWith("SIM SIGNAL ")));
    assert.ok(rows.every((row, index) => index === 0 || rows[index - 1].metric > row.metric));
    assert.deepEqual(Object.keys(rows[0]).sort(), ["displayName", "metric", "publicEntryId", "rank"]);
  }
  assert.equal(api.createMockRows("email").length, 0);
});

test("local preview rank updates with a better score or streak and is absent for no record", () => {
  const api = loadPreviewApi();
  const scoreRank = api.getLocalPreviewRank("score", 30000);
  const improvedScoreRank = api.getLocalPreviewRank("score", 90000);
  const streakRank = api.getLocalPreviewRank("streak", 10);
  const improvedStreakRank = api.getLocalPreviewRank("streak", 60);
  assert.ok(improvedScoreRank < scoreRank);
  assert.ok(improvedStreakRank < streakRank);
  assert.equal(api.getLocalPreviewRank("score", 0), null);
  assert.equal(api.getLocalPreviewRank("streak", 1.5), null);
});

test("submission intent is blocked for guests, non-opted-in users, and invalid data", () => {
  const api = loadPreviewApi();
  const valid = {
    authenticated: true, optedIn: true, displayName: "Demo Defuser", bestScore: 1200, bestStreak: 9,
  };
  assert.deepEqual({ ...api.prepareSubmissionIntent(valid) }, {
    publicName: "Demo Defuser", bestScore: 1200, bestStreak: 9,
  });
  assert.equal(api.prepareSubmissionIntent({ ...valid, authenticated: false }), null);
  assert.equal(api.prepareSubmissionIntent({ ...valid, optedIn: false }), null);
  assert.equal(api.prepareSubmissionIntent({ ...valid, displayName: "person@example.com" }), null);
  assert.equal(api.prepareSubmissionIntent({ ...valid, displayName: "<script>" }), null);
  assert.equal(api.prepareSubmissionIntent({ ...valid, bestScore: -1 }), null);
  assert.equal(api.prepareSubmissionIntent({ ...valid, bestStreak: 1.25 }), null);
  assert.deepEqual(Object.keys(api.prepareSubmissionIntent(valid)).sort(), ["bestScore", "bestStreak", "publicName"]);
});

test("UI is preview-only, guests may view, and explicit opt-in fails closed in saved profiles", () => {
  assert.match(html, /id="btn-open-leaderboard"/);
  assert.match(html, /id="leaderboard-tab-score"[\s\S]*BEST SCORE/);
  assert.match(html, /id="leaderboard-tab-streak"[\s\S]*BEST STREAK/);
  assert.match(html, /LOCAL PREVIEW · NOT GLOBAL/);
  assert.match(html, /normal private cloud-save sync remains unchanged/);
  assert.match(html, /id="leaderboard-empty"/);
  assert.match(gameSource, /const backendConfigured = leaderboardClient\?\.isConfigured\?\.\(\) === true;/);
  assert.match(gameSource, /navigator\.onLine !== false/);
  assert.match(gameSource, /SIGN IN TO OPT IN/);
  assert.match(gameSource, /function isPublicLeaderboardOptInAllowed\(privacyValue, consentValue\)\s*\{\s*return privacyValue === true && consentValue === true;/);
  assert.match(gameSource, /publicLeaderboard: false/);
  assert.match(gameSource, /const publicLeaderboardAllowed = isPublicLeaderboardOptInAllowed\(privIn\.publicLeaderboard, consIn\.publicLeaderboard\)/);
  assert.match(gameSource, /base\.consent = l\.consent;\s*base\.privacy = l\.privacy;/);
  assert.match(gameSource, /isPublicLeaderboardOptInAllowed\(localSave\.privacy\.publicLeaderboard, localSave\.consent\.publicLeaderboard\)[\s\S]*&& isPublicLeaderboardOptInAllowed\(chosenSave\.privacy\.publicLeaderboard, chosenSave\.consent\.publicLeaderboard\)/);
  assert.match(gameSource, /const sameRegisteredAccount = profile\.account\?\.mode === "registered" && profile\.account\?\.userId === user\.uid;[\s\S]*profile\.consent\.publicLeaderboard = false;/);
  assert.match(gameSource, /profile\.account\.mode = "guest";\s*profile\.account\.provider = "guest";\s*profile\.privacy\.publicLeaderboard = false;\s*profile\.consent\.publicLeaderboard = false;/);
  assert.match(gameSource, /profile\.bestScore = Math\.max\(profile\.bestScore, run\.score\);[\s\S]*profile\.bestStreak = Math\.max\(profile\.bestStreak, run\.bestStreak\);/);
  assert.match(gameSource, /Number\(profile\?\.bestScore \|\| personalBests\.bestScore \|\| 0\)/);
  assert.match(gameSource, /Number\(profile\?\.bestStreak \|\| personalBests\.bestStreak \|\| 0\)/);
  assert.match(gameSource, /navigator\.onLine !== false[\s\S]*LOCAL SAMPLE PREVIEW/);
  assert.match(gameSource, /btn-leaderboard-retry[\s\S]*REFRESHING LOCAL PREVIEW/);
  assert.match(gameSource, /NO PUBLIC LEADERBOARD ENTRY IS SENT/);
  assert.match(leaderboardConfig, /enabled: false/);
  assert.match(leaderboardConfig, /firebaseEmulator: Object\.freeze\(\{\s*enabled: false/);
  assert.match(gameSource, /const FIREBASE_RUNTIME_CONFIG = USE_LEADERBOARD_FIREBASE_EMULATORS/);
  assert.match(gameSource, /auth\.useEmulator\(/);
  assert.match(gameSource, /db\.useEmulator\(/);
  assert.match(copier, /scripts\/leaderboard-preview\.js/);
  assert.match(copier, /scripts\/leaderboard-client\.js/);
  assert.match(serviceWorker, /\.\/scripts\/leaderboard-preview\.js/);
  assert.match(html, /leaderboard-config\.js[\s\S]*leaderboard-client\.js[\s\S]*script\.js/);
  assert.match(gameSource, /leaderboardClient\.getBestScore\(\)/);
  assert.match(gameSource, /leaderboardClient\.getBestStreak\(\)/);
});
