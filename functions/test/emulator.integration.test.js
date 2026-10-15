import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (process.env.LEADERBOARD_EMULATOR_TESTS === "1") {
  const projectId = "demo-bomb-defuse";
  const app = initializeApp({ projectId }, `leaderboard-emulator-${randomUUID()}`);
  const db = getFirestore(app);
  const origin = "http://127.0.0.1";

  async function callFunction(name, data = {}, idToken = null) {
    const response = await fetch(`${origin}:5001/${projectId}/us-central1/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(idToken ? { authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify({ data }),
    });
    return { status: response.status, body: await response.json() };
  }

  async function createUser() {
    const email = `${randomUUID()}@example.test`;
    const response = await fetch(`${origin}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Local-Only-Password-1", returnSecureToken: true }),
    });
    if (!response.ok) throw new Error(`Auth emulator sign-up failed: ${await response.text()}`);
    const result = await response.json();
    return { uid: result.localId, email, idToken: result.idToken };
  }

  async function setProfile(user, optedIn = true) {
    await db.collection("users").doc(user.uid).set({
      account: { displayName: "Emulator Player", email: user.email, userId: user.uid, mode: "registered" },
      privacy: { publicLeaderboard: optedIn }, consent: { publicLeaderboard: optedIn },
    });
  }

  async function activeChallenge(uid, runId) {
    const snapshot = await db.collection("leaderboardRuns").doc(uid).collection("runs").doc(runId).get();
    assert.equal(snapshot.exists, true);
    return snapshot.data(); // Admin-only test visibility; callable never returns answerIndex.
  }

  try {
    const player = await createUser();
    const other = await createUser();
    await setProfile(player);
    await setProfile(other);

    await test("callable run flow validates real challenges and derives accepted score/streak", async () => {
      const started = await callFunction("beginEndlessLeaderboardRun", {}, player.idToken);
      assert.equal(started.status, 200);
      const { runId } = started.body.result;
      let challenge = started.body.result.challenge;
      assert.equal("answerIndex" in challenge, false);
      assert.equal(started.body.result.powerUpsAllowed, false);
      let response;
      for (let expectedBomb = 1; expectedBomb <= 3; expectedBomb += 1) {
        const stored = await activeChallenge(player.uid, runId);
        assert.equal(stored.currentChallenge.bombNumber, expectedBomb);
        assert.equal(challenge.bombNumber, expectedBomb);
        response = await callFunction("submitEndlessLeaderboardAction", {
          runId, sequence: challenge.sequence, challengeId: challenge.challengeId,
          wireIndex: stored.currentChallenge.answerIndex,
        }, player.idToken);
        assert.equal(response.status, 200);
        assert.equal(response.body.result.correct, true);
        challenge = response.body.result.challenge;
        if (expectedBomb < 3) assert.ok(challenge);
      }
      assert.equal(response.body.result.score, 360);
      assert.equal(response.body.result.streak, 3);
      assert.equal(response.body.result.bombsDefused, 3);
      const finished = await callFunction("finishEndlessLeaderboardRun", { runId, sequence: 3 }, player.idToken);
      assert.deepEqual({ score: finished.body.result.score, streak: finished.body.result.streak, bombsDefused: finished.body.result.bombsDefused }, { score: 360, streak: 3, bombsDefused: 3 });
      const duplicateFinish = await callFunction("finishEndlessLeaderboardRun", { runId, sequence: 3 }, player.idToken);
      assert.equal(duplicateFinish.body.result.duplicate, true);

      const owner = (await db.collection("leaderboardPrivateOwners").doc(player.uid).get()).data();
      const publicScore = (await db.collection("endlessLeaderboardScores").doc(owner.score.publicEntryId).get()).data();
      const publicStreak = (await db.collection("endlessLeaderboardStreaks").doc(owner.streak.publicEntryId).get()).data();
      assert.deepEqual(Object.keys(publicScore).sort(), ["displayName", "metric", "publicEntryId", "updatedAt"]);
      assert.equal(publicScore.metric, 360);
      assert.equal(publicStreak.metric, 3);
      assert.equal(JSON.stringify(publicScore).includes(player.uid), false);
      assert.equal(JSON.stringify(publicScore).includes(player.email), false);
    });

    await test("actual leaderboard browser client completes a server-issued emulator run", async () => {
      const source = await readFile(new URL("../../scripts/leaderboard-client.js", import.meta.url), "utf8");
      const functionsInstance = {
        useEmulator() {},
        httpsCallable: name => async data => {
          const response = await callFunction(name, data, player.idToken);
          if (response.status !== 200) throw Object.assign(new Error("Callable rejected."), { code: response.body.error?.status });
          return { data: response.body.result };
        },
      };
      const window = {
        __BOMB_DEFUSE_LEADERBOARD_CONFIG__: {
          enabled: true, projectId, region: "us-central1",
          firebaseEmulator: { enabled: true, projectId },
          emulator: { enabled: true, host: "127.0.0.1", functionsPort: 5001 },
        },
        firebase: {
          apps: [{}],
          app: () => ({ options: { projectId }, functions: () => functionsInstance }),
          functions: () => functionsInstance,
        },
        Capacitor: { isNativePlatform: () => false },
      };
      const document = {
        scripts: [],
        createElement: () => ({ dataset: {}, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } }),
        head: { appendChild(script) { document.scripts.push(script); script.dataset.loaded = "true"; script.listeners.load(); } },
      };
      vm.runInNewContext(source, { window, document, navigator: { onLine: true }, Array, Promise, Error, Boolean, Number, String });
      const client = window.BombDefuseLeaderboardClient;
      const started = await client.beginRun();
      const privateState = await activeChallenge(player.uid, started.runId);
      const accepted = await client.submitRunAction({
        runId: started.runId, sequence: started.sequence, challengeId: started.challenge.challengeId,
        wireIndex: privateState.currentChallenge.answerIndex,
      });
      assert.equal(accepted.correct, true);
      assert.equal(accepted.score, 105);
      const finished = await client.finishRun({ runId: started.runId, sequence: accepted.sequence });
      assert.equal(finished.score, 105);
      assert.equal(finished.streak, 1);
    });

    await test("stale, repeated, tampered, fabricated-metric, and power actions are rejected safely", async () => {
      const start = (await callFunction("beginEndlessLeaderboardRun", {}, player.idToken)).body.result;
      const stored = await activeChallenge(player.uid, start.runId);
      const action = { runId: start.runId, sequence: 0, challengeId: start.challenge.challengeId, wireIndex: stored.currentChallenge.answerIndex };
      const accepted = await callFunction("submitEndlessLeaderboardAction", action, player.idToken);
      assert.equal(accepted.status, 200);
      const retry = await callFunction("submitEndlessLeaderboardAction", action, player.idToken);
      assert.deepEqual(retry.body.result, accepted.body.result);
      const differentReplay = await callFunction("submitEndlessLeaderboardAction", { ...action, wireIndex: (action.wireIndex + 1) % stored.currentChallenge.wires.length }, player.idToken);
      assert.notEqual(differentReplay.status, 200);
      const fabricated = await callFunction("submitEndlessLeaderboardAction", { ...action, score: 99999999 }, player.idToken);
      assert.notEqual(fabricated.status, 200);
      const power = await callFunction("submitEndlessLeaderboardAction", { ...action, powerId: "timeFreeze" }, player.idToken);
      assert.notEqual(power.status, 200);
      const claimedTime = await callFunction("submitEndlessLeaderboardAction", { ...action, clientTimestamp: Date.now() }, player.idToken);
      assert.notEqual(claimedTime.status, 200);
      const stale = await callFunction("submitEndlessLeaderboardAction", { ...action, sequence: 99 }, player.idToken);
      assert.notEqual(stale.status, 200);
      const metrics = await callFunction("finishEndlessLeaderboardRun", { runId: start.runId, sequence: 999, score: 99, streak: 99, elapsedMs: 1 }, player.idToken);
      assert.notEqual(metrics.status, 200);
    });

    await test("wrong solutions terminate with no score; another account cannot use the run", async () => {
      const start = (await callFunction("beginEndlessLeaderboardRun", {}, player.idToken)).body.result;
      const stored = await activeChallenge(player.uid, start.runId);
      const crossUser = await callFunction("submitEndlessLeaderboardAction", {
        runId: start.runId, sequence: 0, challengeId: start.challenge.challengeId, wireIndex: stored.currentChallenge.answerIndex,
      }, other.idToken);
      assert.notEqual(crossUser.status, 200);
      const wrongIndex = (stored.currentChallenge.answerIndex + 1) % stored.currentChallenge.wires.length;
      const wrong = await callFunction("submitEndlessLeaderboardAction", {
        runId: start.runId, sequence: 0, challengeId: start.challenge.challengeId, wireIndex: wrongIndex,
      }, player.idToken);
      assert.equal(wrong.body.result.correct, false);
      const final = await callFunction("finishEndlessLeaderboardRun", { runId: start.runId, sequence: 0 }, player.idToken);
      assert.equal(final.body.result.score, 0);
      assert.equal(final.body.result.bombsDefused, 0);
    });

    await test("expiry uses server time, rejects client timestamps, and concurrency is idempotent", async () => {
      const start = (await callFunction("beginEndlessLeaderboardRun", {}, player.idToken)).body.result;
      const ref = db.collection("leaderboardRuns").doc(player.uid).collection("runs").doc(start.runId);
      const stored = (await ref.get()).data();
      await ref.update({ "currentChallenge.expiresAtMs": Date.now() - 1 });
      const expired = await callFunction("submitEndlessLeaderboardAction", {
        runId: start.runId, sequence: 0, challengeId: start.challenge.challengeId, wireIndex: -1,
      }, player.idToken);
      assert.equal(expired.body.result.reason, "TIME_EXPIRED");
      assert.equal(expired.body.result.correct, false);
      await callFunction("finishEndlessLeaderboardRun", { runId: start.runId, sequence: 0 }, player.idToken);

      const concurrentStart = (await callFunction("beginEndlessLeaderboardRun", {}, other.idToken)).body.result;
      const concurrentState = await activeChallenge(other.uid, concurrentStart.runId);
      const concurrentAction = {
        runId: concurrentStart.runId, sequence: 0, challengeId: concurrentStart.challenge.challengeId,
        wireIndex: concurrentState.currentChallenge.answerIndex,
      };
      const [first, second] = await Promise.all([
        callFunction("submitEndlessLeaderboardAction", concurrentAction, other.idToken),
        callFunction("submitEndlessLeaderboardAction", concurrentAction, other.idToken),
      ]);
      assert.equal(first.body.result.score, second.body.result.score);
      assert.equal((await activeChallenge(other.uid, concurrentStart.runId)).bombsDefused, 1);
      assert.ok(stored.currentChallenge.expiresAtMs > 0);
    });

    await test("unauthorized, opted-out and direct Firestore leaderboard access remain blocked", async () => {
      const guest = await callFunction("beginEndlessLeaderboardRun");
      assert.notEqual(guest.status, 200);
      await db.collection("users").doc(other.uid).update({ "privacy.publicLeaderboard": false, "consent.publicLeaderboard": false });
      const optedOut = await callFunction("beginEndlessLeaderboardRun", {}, other.idToken);
      assert.notEqual(optedOut.status, 200);
      const base = `${origin}:8080/v1/projects/${projectId}/databases/(default)/documents`;
      const read = await fetch(`${base}/endlessLeaderboardScores/${randomUUID()}`);
      assert.equal(read.status, 403);
      const write = await fetch(`${base}/endlessLeaderboardScores/client-write`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: { metric: { integerValue: "12" } } }),
      });
      assert.equal(write.status, 403);
      const mappingRead = await fetch(`${base}/leaderboardPrivateOwners/${player.uid}`);
      assert.equal(mappingRead.status, 403);
      const overLimit = await callFunction("beginEndlessLeaderboardRun", {}, player.idToken);
      assert.notEqual(overLimit.status, 200);
      const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../index.js", import.meta.url), "utf8"));
      assert.match(source, /enforceAppCheck: process\.env\.FUNCTIONS_EMULATOR !== "true"/);
    });
  } finally {
    await deleteApp(app);
  }
} else {
  test("Firebase Emulator integration suite runs only through npm run test:emulator", { skip: true }, () => {});
}
