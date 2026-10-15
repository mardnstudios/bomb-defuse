import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
  GCLOUD_PROJECT: "demo-bomb-defuse",
  GOOGLE_CLOUD_PROJECT: "demo-bomb-defuse",
  LEADERBOARD_EMULATOR_TESTS: "1",
};
const result = spawnSync(process.execPath, ["--test", "test/emulator.integration.test.js"], {
  cwd: functionsRoot,
  env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
