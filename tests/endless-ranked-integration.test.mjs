import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const game = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../scripts/leaderboard-client.js", import.meta.url), "utf8");
const config = readFileSync(new URL("../leaderboard-config.js", import.meta.url), "utf8");

test("ranked mode requires backend config, both opt-in flags, and a matching authenticated profile", () => {
  assert.match(game, /const explicitOptIn = profile\?\.privacy\?\.publicLeaderboard === true && profile\?\.consent\?\.publicLeaderboard === true/);
  assert.match(game, /FirebaseManager\.getCurrentUser\(\)\?\.uid === profile\?\.account\?\.userId/);
  assert.match(game, /rankedClient\?\.isConfigured\?\.\(\) === true && explicitOptIn && signedInOwnerMatches/);
  assert.match(config, /enabled: false/);
});

test("ranked game renders server challenges and submits only a selected wire action", () => {
  assert.match(game, /if \(gameMode === "RANKED"\) \{[\s\S]*?const ranked = run\.ranked\?\.challenge/);
  assert.match(game, /challenge: \{ type: "ranked", text: ranked\.instruction \}/);
  assert.match(game, /if \(gameMode === "RANKED"\) \{\s*void submitRankedWire\(index, wireEl, x, y\);\s*return;/);
  assert.match(game, /const action = \{\s*runId: activeRun\.ranked\.runId,\s*sequence: activeRun\.ranked\.sequence,\s*challengeId: activeRun\.ranked\.challenge\.challengeId,\s*wireIndex,/);
  assert.doesNotMatch(game, /action\.score\s*=|action\.streak\s*=|action\.elapsedMs\s*=/);
  assert.match(client, /submitRunAction: action => call\("submitEndlessLeaderboardAction", action\)/);
});

test("ranked timer uses server expiry action; powers are unavailable; offline failure is unranked", () => {
  assert.match(game, /if \(gameMode === "RANKED"\) \{\s*Timer\.start\(run\.bomb\.time, renderTimer, \(\) => \{ void submitRankedWire\(-1, null, 0, 0\); \}\);/);
  assert.match(game, /gameMode === "RANKED"\) return false/);
  assert.match(game, /btn\.hidden = ranked/);
  assert.match(game, /RANKED SERVICE UNAVAILABLE[\s\S]*THIS RUN IS UNRANKED/);
  assert.match(game, /UNRANKED RUN · LOCAL RESULT ONLY · NOT SUBMITTED GLOBALLY/);
});

test("normal Endless generation and gameplay still use existing client path", () => {
  assert.match(game, /run\.bomb = BombFactory\.create\(run\.bombNumber, run\)/);
  assert.match(game, /if \(gameMode === "RANKED"\)[\s\S]*?else if \(gameMode === "DAILY"\)[\s\S]*?BombFactory\.create/);
});
