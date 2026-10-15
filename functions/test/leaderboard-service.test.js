import assert from "node:assert/strict";
import test from "node:test";
import { LeaderboardError } from "../src/leaderboard-domain.js";
import { createLeaderboardService } from "../src/leaderboard-service.js";

function serviceFor(profile) {
  return createLeaderboardService({
    db: {
      collection: name => ({ doc: id => ({
        get: async () => ({ exists: name === "users" && id === "uid-on", data: () => profile }),
        collection: () => ({ doc: () => ({}) }),
      }) }),
      runTransaction: callback => callback({
        get: ref => ref.get(),
        set() {}, create() {}, update() {},
      }),
    },
    timestampFromMillis: value => value,
    serverTimestamp: () => 0,
    now: () => 1_800_000_000_000,
    newId: () => "00000000-0000-4000-8000-000000000001",
    randomInt: min => min,
  });
}

test("guest and opted-out accounts cannot start a leaderboard run", async () => {
  const service = serviceFor({ privacy: { publicLeaderboard: false }, consent: { publicLeaderboard: false } });
  await assert.rejects(service.beginRun(""), error => error instanceof LeaderboardError && error.code === "unauthenticated");
  await assert.rejects(service.beginRun("uid-on"), error => error instanceof LeaderboardError && error.code === "permission-denied");
});

test("ranked run creation requires both explicit opt-in flags and returns no answer", async () => {
  const service = serviceFor({
    account: { displayName: "Opted In" },
    privacy: { publicLeaderboard: true },
    consent: { publicLeaderboard: true },
  });
  const result = await service.beginRun("uid-on");
  assert.equal(typeof result.runId, "string");
  assert.equal("answerIndex" in result.challenge, false);
  assert.equal(result.powerUpsAllowed, false);
});
