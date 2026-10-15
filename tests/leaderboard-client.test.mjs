import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../scripts/leaderboard-client.js", import.meta.url), "utf8");

function createClient({ enabled = false, emulator = false, scriptError = false, online = true, onScriptLoad = null } = {}) {
  const scripts = [];
  const window = {
    __BOMB_DEFUSE_LEADERBOARD_CONFIG__: {
      enabled,
      projectId: "demo-bomb-defuse",
      region: "us-central1",
      firebaseEmulator: { enabled: emulator, projectId: "demo-bomb-defuse" },
      emulator: { enabled: emulator, host: "127.0.0.1", functionsPort: 5001 },
    },
    firebase: { apps: [{}], app: () => ({ options: { projectId: "demo-bomb-defuse" }, functions: () => window.functionsInstance }) },
    Capacitor: { isNativePlatform: () => false },
  };
  const document = {
    scripts,
    createElement: () => ({ dataset: {}, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } }),
    head: { appendChild(script) {
      scripts.push(script.src);
      if (scriptError) script.listeners.error();
      else { onScriptLoad?.(window, script); script.listeners.load(); }
    } },
  };
  vm.runInNewContext(source, { window, document, navigator: { onLine: online }, Array, Promise, Error, Boolean, Number, String });
  return { client: window.BombDefuseLeaderboardClient, scripts };
}

test("default-disabled backend makes no SDK load or network attempt", async () => {
  const { client, scripts } = createClient();
  assert.equal(client.isConfigured(), false);
  await assert.rejects(client.getBestScore(), error => error.code === "leaderboard/not-configured");
  assert.deepEqual(scripts, []);
});

test("configured emulator transport handles SDK load failure without pretending rankings loaded", async () => {
  const { client, scripts } = createClient({ enabled: true, emulator: true, scriptError: true });
  assert.equal(client.isConfigured(), true);
  await assert.rejects(client.getBestStreak(), error => error.code === "leaderboard/sdk-load-failed");
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /firebase-functions-compat\.js$/);
});

test("offline configured website avoids SDK loading and returns a retryable offline error", async () => {
  const { client, scripts } = createClient({ enabled: true, online: false });
  await assert.rejects(client.getBestScore(), error => error.code === "leaderboard/offline");
  assert.deepEqual(scripts, []);
});

test("configured emulator calls the expected callable without changing public app configuration", async () => {
  const calls = [];
  const { client, scripts } = createClient({
    enabled: true,
    emulator: true,
    onScriptLoad: window => {
      window.firebase.functions = () => ({});
      window.functionsInstance = {
        useEmulator: (host, port) => calls.push(["emulator", host, port]),
        httpsCallable: name => async data => { calls.push([name, data]); return { data: { entries: [] } }; },
      };
    },
  });
  assert.deepEqual(await client.getBestScore(), { entries: [] });
  assert.equal(JSON.stringify(calls), JSON.stringify([
    ["emulator", "127.0.0.1", 5001],
    ["getBestScoreLeaderboard", {}],
  ]));
  assert.equal(scripts.length, 1);
});

test("ranked client exposes server challenge actions without client metrics or elapsed time", () => {
  assert.match(source, /beginRun: \(\) => call\("beginEndlessLeaderboardRun"\)/);
  assert.match(source, /submitRunAction: action => call\("submitEndlessLeaderboardAction", action\)/);
  assert.match(source, /finishRun: request => call\("finishEndlessLeaderboardRun", request\)/);
  assert.doesNotMatch(source, /score:\s*run\.score|streak:\s*run\.streak|elapsedMs|clientTimestamp/);
});
