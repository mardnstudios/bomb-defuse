import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LeaderboardError,
  hasExplicitPublicOptIn,
  isRunSubmissionDuplicate,
  publicEntryPayload,
  rankEntries,
  rateLimitDecision,
  requireAuthenticatedUid,
  sanitizePublicDisplayName,
} from "../src/leaderboard-domain.js";
import { createRankedChallenge, verifyRankedWireAction, verifiedRunMetrics, ENDLESS_TRANSCRIPT_PROTOCOL_ACTIVE } from "../src/verifier.js";

function expectCode(callback, code) {
  assert.throws(callback, error => error instanceof LeaderboardError && error.code === code);
}

test("submission authorization needs a non-empty authenticated UID and both exact opt-in flags", () => {
  expectCode(() => requireAuthenticatedUid(null), "unauthenticated");
  assert.equal(requireAuthenticatedUid("uid-test"), "uid-test");
  assert.equal(hasExplicitPublicOptIn({ privacy: { publicLeaderboard: true }, consent: { publicLeaderboard: true } }), true);
  assert.equal(hasExplicitPublicOptIn({ privacy: { publicLeaderboard: true }, consent: { publicLeaderboard: 1 } }), false);
  assert.equal(hasExplicitPublicOptIn({ privacy: { publicLeaderboard: true }, consent: {} }), false);
});

test("public display names are normalized and email, markup, controls, and invalid lengths are rejected", () => {
  assert.equal(sanitizePublicDisplayName("  Bomb  Defuser "), "Bomb Defuser");
  for (const invalid of ["a", "person@example.com", "<script>", "bad\nname", "x".repeat(21)]) {
    assert.equal(sanitizePublicDisplayName(invalid), null, invalid);
  }
});

test("rate limiting resets by time window and blocks further per-user attempts", () => {
  const start = 1_800_000_000_000;
  let state = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const decision = rateLimitDecision(state, start + attempt);
    assert.equal(decision.allowed, true);
    state = decision.state;
  }
  assert.equal(rateLimitDecision(state, start + 10).allowed, false);
  assert.equal(rateLimitDecision(state, start + 15 * 60 * 1000 + 1).allowed, true);
});

test("ranking uses descending metric and stable opaque-ID tie-breaks; public shape excludes private identifiers", () => {
  const ranked = rankEntries([
    { publicEntryId: "opaque-b", displayName: "B Name", metric: 50, uid: "private-b", email: "b@example.com" },
    { publicEntryId: "opaque-a", displayName: "A Name", metric: 50, uid: "private-a" },
    { publicEntryId: "opaque-c", displayName: "C Name", metric: 90 },
  ], "score");
  assert.deepEqual(ranked.map(entry => [entry.rank, entry.publicEntryId, entry.metric]), [
    [1, "opaque-c", 90], [2, "opaque-a", 50], [3, "opaque-b", 50],
  ]);
  assert.ok(ranked.every(entry => !("uid" in entry) && !("email" in entry)));
  const stored = publicEntryPayload({ publicEntryId: "opaque", displayName: "Public Name", metric: 12, updatedAt: 1 });
  assert.deepEqual(Object.keys(stored).sort(), ["displayName", "metric", "publicEntryId", "updatedAt"]);
});

test("ranked verifier derives challenge answer privately and metrics only from legal server state", () => {
  const randomInt = (min) => min;
  const challenge = createRankedChallenge({ bombNumber: 1, sequence: 0, nowMs: 1000, randomInt, newId: () => "challenge-test-1" });
  assert.equal(ENDLESS_TRANSCRIPT_PROTOCOL_ACTIVE, true);
  assert.equal("answerIndex" in challenge, true);
  const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const run = { runId, status: "active", sequence: 0, expiresAtMs: 100_000, score: 0, streak: 0, bestStreak: 0, bombsDefused: 0, currentChallenge: challenge };
  const correct = verifyRankedWireAction({ run, action: { runId, sequence: 0, challengeId: challenge.challengeId, wireIndex: challenge.answerIndex }, nowMs: 2000, randomInt, newId: () => "challenge-test-2" });
  assert.equal(correct.correct, true);
  assert.equal(correct.score, 105);
  assert.equal(correct.streak, 1);
  assert.equal(correct.bombsDefused, 1);
  assert.deepEqual(verifiedRunMetrics({ ...run, score: correct.score, bestStreak: correct.bestStreak, bombsDefused: correct.bombsDefused, status: "completed" }), { score: 105, streak: 1, bombsDefused: 1 });
});

test("ranked verifier rejects fabricated fields, wrong answers, replayed sequence, powers and expiry", () => {
  const randomInt = (_min, max) => max;
  const challenge = createRankedChallenge({ bombNumber: 1, sequence: 0, nowMs: 1000, randomInt, newId: () => "challenge-test-3" });
  const runId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const run = { runId, status: "active", sequence: 0, expiresAtMs: 100_000, score: 0, streak: 0, bestStreak: 0, bombsDefused: 0, currentChallenge: challenge };
  const base = { runId, sequence: 0, challengeId: challenge.challengeId, wireIndex: challenge.answerIndex };
  const deps = { randomInt, newId: () => "challenge-test-4" };
  expectCode(() => verifyRankedWireAction({ run, action: { ...base, score: 99999 }, nowMs: 2000, ...deps }), "invalid-argument");
  expectCode(() => verifyRankedWireAction({ run, action: { ...base, powerId: "timeFreeze" }, nowMs: 2000, ...deps }), "invalid-argument");
  expectCode(() => verifyRankedWireAction({ run, action: { ...base, sequence: 1 }, nowMs: 2000, ...deps }), "failed-precondition");
  expectCode(() => verifyRankedWireAction({ run, action: { ...base, wireIndex: challenge.wires.length }, nowMs: 2000, ...deps }), "invalid-argument");
  assert.equal(verifyRankedWireAction({ run, action: { ...base, wireIndex: challenge.answerIndex === 0 ? 1 : 0 }, nowMs: 2000, ...deps }).correct, false);
  assert.equal(verifyRankedWireAction({ run, action: { ...base, wireIndex: -1 }, nowMs: challenge.expiresAtMs, ...deps }).reason, "TIME_EXPIRED");
});

test("callables enforce App Check outside the emulator and expose no raw-score write route", () => {
  const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  assert.match(source, /enforceAppCheck: process\.env\.FUNCTIONS_EMULATOR !== "true"/);
  assert.match(source, /submitEndlessLeaderboardAction = callable\(request => service\.submitWireAction\(uidFromRequest\(request\), request\.data\)\)/);
  assert.match(source, /finishEndlessLeaderboardRun = callable\(request => service\.finishRun\(uidFromRequest\(request\), request\.data\)\)/);
  assert.doesNotMatch(source, /score:\s*request\.data\.score|streak:\s*request\.data\.streak/);
});
