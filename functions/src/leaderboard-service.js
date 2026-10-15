import {
  LeaderboardError,
  LEADERBOARD_LIMIT,
  hasExplicitPublicOptIn,
  publicEntryPayload,
  rateLimitDecision,
  rankEntries,
  sanitizePublicDisplayName,
} from "./leaderboard-domain.js";
import { createRankedChallenge, publicRankedChallenge, validateRankedWireActionShape, verifyRankedWireAction, verifiedRunMetrics } from "./verifier.js";

const METRICS = Object.freeze({
  score: Object.freeze({ collection: "endlessLeaderboardScores", field: "score" }),
  streak: Object.freeze({ collection: "endlessLeaderboardStreaks", field: "streak" }),
});
const MAX_CHALLENGE_AGE_MS = 2 * 60 * 60 * 1000;
const RUN_TTL_MS = MAX_CHALLENGE_AGE_MS;

function metricDefinition(metric) {
  const definition = METRICS[metric];
  if (!definition) throw new LeaderboardError("invalid-argument", "Unknown leaderboard metric.");
  return definition;
}

function profileAllowsPublication(profile) {
  return hasExplicitPublicOptIn(profile) && Boolean(sanitizePublicDisplayName(profile?.account?.displayName));
}

export function createLeaderboardService({ db, timestampFromMillis, serverTimestamp, now = Date.now, newId, randomInt }) {
  if (!db || !timestampFromMillis || !serverTimestamp || typeof newId !== "function" || typeof randomInt !== "function") {
    throw new TypeError("Leaderboard service dependencies are required.");
  }

  function profileRef(uid) { return db.collection("users").doc(uid); }
  function ownerRef(uid) { return db.collection("leaderboardPrivateOwners").doc(uid); }
  function rateLimitRef(uid) { return db.collection("leaderboardRateLimits").doc(uid); }
  function runCollection(uid) { return db.collection("leaderboardRuns").doc(uid).collection("runs"); }
  function submissionsCollection(uid) { return db.collection("leaderboardSubmissions").doc(uid).collection("runs"); }

  async function getTop(metric) {
    const definition = metricDefinition(metric);
    const snapshot = await db.collection(definition.collection)
      .orderBy("metric", "desc")
      .orderBy("publicEntryId", "asc")
      .limit(LEADERBOARD_LIMIT)
      .get();
    const entries = snapshot.docs.map(doc => ({ ...doc.data(), publicEntryId: doc.id }));
    return { entries: rankEntries(entries, metric), limit: LEADERBOARD_LIMIT };
  }

  async function rankFor(metric, mapping) {
    const definition = metricDefinition(metric);
    const ref = mapping?.[metric];
    if (!ref || typeof ref.publicEntryId !== "string" || !Number.isSafeInteger(ref.metric)) return null;
    const entry = await db.collection(definition.collection).doc(ref.publicEntryId).get();
    if (!entry.exists || entry.get("publicEntryId") !== ref.publicEntryId || entry.get("metric") !== ref.metric) return null;
    const collection = db.collection(definition.collection);
    const [greater, tiedBefore] = await Promise.all([
      collection.where("metric", ">", ref.metric).count().get(),
      collection.where("metric", "==", ref.metric).where("publicEntryId", "<", ref.publicEntryId).count().get(),
    ]);
    return { rank: greater.data().count + tiedBefore.data().count + 1, metric: ref.metric };
  }

  async function getMyRank(uid) {
    if (typeof uid !== "string" || !uid) throw new LeaderboardError("unauthenticated", "Sign in to view your rank.");
    const userSnapshot = await profileRef(uid).get();
    const profile = userSnapshot.exists ? userSnapshot.data() : null;
    if (!hasExplicitPublicOptIn(profile)) return { bestScore: null, bestStreak: null, optedIn: false };
    const ownerSnapshot = await ownerRef(uid).get();
    const mapping = ownerSnapshot.exists ? ownerSnapshot.data() : {};
    const [bestScore, bestStreak] = await Promise.all([rankFor("score", mapping), rankFor("streak", mapping)]);
    return { bestScore, bestStreak, optedIn: true };
  }

  async function beginRun(uid) {
    if (typeof uid !== "string" || !uid) throw new LeaderboardError("unauthenticated", "Sign in before starting a leaderboard-eligible run.");
    const userSnapshot = await profileRef(uid).get();
    if (!userSnapshot.exists || !profileAllowsPublication(userSnapshot.data())) {
      throw new LeaderboardError("permission-denied", "Public leaderboard opt-in is required.");
    }
    const nowMs = now();
    const runId = newId();
    const firstChallenge = createRankedChallenge({ bombNumber: 1, sequence: 0, nowMs, randomInt, newId });
    const runRef = runCollection(uid).doc(runId);
    const rateRef = rateLimitRef(uid);
    const runState = {
      runId, uid, protocolVersion: 2, status: "active", sequence: 0,
      startedAtMs: nowMs, expiresAtMs: nowMs + RUN_TTL_MS,
      score: 0, streak: 0, bestStreak: 0, bombsDefused: 0,
      currentChallenge: firstChallenge, createdAt: serverTimestamp(),
    };
    await db.runTransaction(async transaction => {
      const [profileSnapshot, rateSnapshot] = await Promise.all([transaction.get(profileRef(uid)), transaction.get(rateRef)]);
      if (!profileSnapshot.exists || !profileAllowsPublication(profileSnapshot.data())) {
        throw new LeaderboardError("permission-denied", "Public leaderboard opt-in is required.");
      }
      const limit = rateLimitDecision(rateSnapshot.exists ? rateSnapshot.data().starts : null, now(), 5, 15 * 60 * 1000);
      if (!limit.allowed) throw new LeaderboardError("resource-exhausted", "Ranked run start limit reached. Try again later.");
      transaction.set(rateRef, { starts: limit.state }, { merge: true });
      transaction.create(runRef, runState);
    });
    return { runId, sequence: 0, expiresAtMs: runState.expiresAtMs, challenge: publicRankedChallenge(firstChallenge), powerUpsAllowed: false };
  }

  async function submitWireAction(uid, action) {
    if (typeof uid !== "string" || !uid) throw new LeaderboardError("unauthenticated", "Sign in to continue this ranked run.");
    validateRankedWireActionShape(action);
    const runRef = runCollection(uid).doc(action.runId);
    const rateRef = rateLimitRef(uid);
    return db.runTransaction(async transaction => {
      const [profileSnapshot, runSnapshot, rateSnapshot] = await Promise.all([
        transaction.get(profileRef(uid)), transaction.get(runRef), transaction.get(rateRef),
      ]);
      if (!profileSnapshot.exists || !profileAllowsPublication(profileSnapshot.data())) {
        throw new LeaderboardError("permission-denied", "Public leaderboard opt-in is required.");
      }
      if (!runSnapshot.exists) throw new LeaderboardError("not-found", "This ranked run was not found.");
      const stored = runSnapshot.data();
      if (stored.uid !== uid || stored.runId !== action.runId || stored.protocolVersion !== 2) {
        throw new LeaderboardError("permission-denied", "This ranked run does not belong to this account.");
      }
      if (stored.lastAction?.challengeId === action.challengeId) {
        if (stored.lastAction.sequence !== action.sequence || stored.lastAction.wireIndex !== action.wireIndex) {
          throw new LeaderboardError("already-exists", "A different or stale action already consumed this challenge.");
        }
        return stored.lastAction.result;
      }
      if (stored.status !== "active") throw new LeaderboardError("failed-precondition", "This ranked run is already finished.");
      const actionLimit = rateLimitDecision(rateSnapshot.exists ? rateSnapshot.data().actions : null, now(), 120, 15 * 60 * 1000);
      if (!actionLimit.allowed) throw new LeaderboardError("resource-exhausted", "Ranked action limit reached.");
      const result = verifyRankedWireAction({ run: stored, action, nowMs: now(), randomInt, newId });
      const next = { ...stored, score: result.score, streak: result.streak, bestStreak: result.bestStreak, bombsDefused: result.bombsDefused };
      if (result.terminal) {
        next.status = result.correct ? "completed" : "failed";
        next.finishedAtMs = now();
        next.currentChallenge = null;
      } else {
        next.sequence = result.nextSequence;
        next.currentChallenge = result.nextChallenge;
      }
      next.lastAction = { challengeId: action.challengeId, sequence: action.sequence, wireIndex: action.wireIndex, result: {
        accepted: true, correct: result.correct, terminal: result.terminal,
        reason: result.reason || null, points: result.points || 0,
        score: result.score, streak: result.streak, bestStreak: result.bestStreak,
        bombsDefused: result.bombsDefused, sequence: next.sequence,
        challenge: publicRankedChallenge(next.currentChallenge),
      } };
      transaction.set(rateRef, { actions: actionLimit.state }, { merge: true });
      transaction.set(runRef, next);
      return next.lastAction.result;
    });
  }

  async function finishRun(uid, request) {
    if (typeof uid !== "string" || !uid) throw new LeaderboardError("unauthenticated", "Sign in to submit this ranked run.");
    if (!request || Object.keys(request).sort().join(",") !== "runId,sequence" ||
        typeof request.runId !== "string" || !/^[0-9a-f-]{36}$/i.test(request.runId) ||
        !Number.isSafeInteger(request.sequence) || request.sequence < 0) {
      throw new LeaderboardError("invalid-argument", "The ranked run completion request is invalid.");
    }
    const runRef = runCollection(uid).doc(request.runId);
    const submissionRef = submissionsCollection(uid).doc(request.runId);
    const ownerDocument = ownerRef(uid);
    const newPublicIds = { score: newId(), streak: newId() };
    return db.runTransaction(async transaction => {
      const [profileSnapshot, runSnapshot, submittedSnapshot, ownerSnapshot] = await Promise.all([
        transaction.get(profileRef(uid)), transaction.get(runRef), transaction.get(submissionRef), transaction.get(ownerDocument),
      ]);
      if (!profileSnapshot.exists || !profileAllowsPublication(profileSnapshot.data())) {
        throw new LeaderboardError("permission-denied", "Public leaderboard opt-in is required.");
      }
      if (!runSnapshot.exists || runSnapshot.data().uid !== uid || runSnapshot.data().runId !== request.runId) {
        throw new LeaderboardError("not-found", "This ranked run was not found.");
      }
      const stored = runSnapshot.data();
      if (request.sequence !== stored.sequence) throw new LeaderboardError("failed-precondition", "The ranked run sequence is stale.");
      if (submittedSnapshot.exists) {
        const prior = submittedSnapshot.data();
        if (prior.sequence !== request.sequence) throw new LeaderboardError("failed-precondition", "The ranked run sequence is stale.");
        return { finalized: true, duplicate: true, status: prior.status, score: prior.score, streak: prior.streak, bombsDefused: prior.bombsDefused };
      }
      if (stored.status === "active") {
        stored.status = now() >= stored.expiresAtMs ? "expired" : "abandoned";
        stored.finishedAtMs = now();
        stored.currentChallenge = null;
      }
      if (!new Set(["completed", "failed", "abandoned", "expired"]).has(stored.status)) {
        throw new LeaderboardError("failed-precondition", "The ranked run cannot be finalized.");
      }
      const metrics = verifiedRunMetrics(stored);
      const safeName = sanitizePublicDisplayName(profileSnapshot.data().account.displayName);
      const owner = ownerSnapshot.exists ? ownerSnapshot.data() : {};
      const changed = {};
      for (const [metric, value] of [["score", metrics.score], ["streak", metrics.streak]]) {
        if (value <= 0) continue;
        const definition = metricDefinition(metric);
        const prior = Number.isSafeInteger(owner[metric]?.metric) ? owner[metric].metric : 0;
        if (value <= prior) continue;
        const publicEntryId = owner[metric]?.publicEntryId || newPublicIds[metric];
        transaction.set(db.collection(definition.collection).doc(publicEntryId), publicEntryPayload({
          publicEntryId, displayName: safeName, metric: value, updatedAt: timestampFromMillis(now()),
        }));
        changed[metric] = { publicEntryId, metric: value };
      }
      if (Object.keys(changed).length) transaction.set(ownerDocument, changed, { merge: true });
      const result = { finalized: true, duplicate: false, status: stored.status, sequence: stored.sequence, score: metrics.score, streak: metrics.streak, bombsDefused: metrics.bombsDefused };
      transaction.set(runRef, stored);
      transaction.create(submissionRef, { ...result, submittedAt: serverTimestamp() });
      return result;
    });
  }

  async function withdraw(uid) {
    if (typeof uid !== "string" || !uid) throw new LeaderboardError("unauthenticated", "Sign in to withdraw your leaderboard entries.");
    const ownerDocument = ownerRef(uid);
    const ownerSnapshot = await ownerDocument.get();
    const owner = ownerSnapshot.exists ? ownerSnapshot.data() : {};
    const batch = db.batch();
    for (const metric of Object.keys(METRICS)) {
      const publicEntryId = owner[metric]?.publicEntryId;
      if (typeof publicEntryId === "string") batch.delete(db.collection(METRICS[metric].collection).doc(publicEntryId));
    }
    batch.delete(ownerDocument);
    await batch.commit();
    for (const collection of [runCollection(uid), submissionsCollection(uid)]) {
      let snapshot;
      do {
        snapshot = await collection.limit(400).get();
        if (snapshot.empty) break;
        const cleanup = db.batch();
        snapshot.docs.forEach(doc => cleanup.delete(doc.ref));
        await cleanup.commit();
      } while (snapshot.size === 400);
    }
    const legacyRuns = db.collection("leaderboardRunChallenges").doc(uid).collection("runs");
    const legacySnapshot = await legacyRuns.limit(400).get();
    if (!legacySnapshot.empty) {
      const legacyBatch = db.batch();
      legacySnapshot.docs.forEach(doc => legacyBatch.delete(doc.ref));
      await legacyBatch.commit();
    }
    return { withdrawn: true };
  }

  return Object.freeze({ getTop, getMyRank, beginRun, submitWireAction, finishRun, withdraw });
}
