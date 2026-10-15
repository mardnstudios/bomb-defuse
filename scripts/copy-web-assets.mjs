import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const runtimeFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "leaderboard-config.js",
  "manifest.json",
  "favicon.svg",
  "service-worker.js",
  "scripts/leaderboard-preview.js",
  "scripts/leaderboard-client.js",
  "icons/icon-192.svg",
  "icons/icon-512.svg",
];
const generatedFiles = new Set([
  ...runtimeFiles,
  "capacitor-build-config.js",
  "native-crashlytics-bridge.js",
  "native-admob-service.js",
]);

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath, relativePath));
    else files.push(relativePath.replaceAll(path.sep, "/"));
  }

  return files;
}

await mkdir(distRoot, { recursive: true });
const existingFiles = await listFiles(distRoot);
const unexpectedFiles = existingFiles.filter(file => !generatedFiles.has(file));
if (unexpectedFiles.length > 0) {
  throw new Error(`Refusing to overwrite non-generated dist content: ${unexpectedFiles.join(", ")}`);
}

for (const relativePath of runtimeFiles) {
  const source = path.join(projectRoot, ...relativePath.split("/"));
  const destination = path.join(distRoot, ...relativePath.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

const buildConfig = [
  "window.__BOMB_DEFUSE_BUILD_CONFIG__ = Object.freeze({",
  '  sentryEnvironment: "production",',
  "  allowDevelopmentTestHelper: false,",
  "});",
  "",
].join("\n");
await writeFile(path.join(distRoot, "capacitor-build-config.js"), buildConfig, "utf8");
await build({
  entryPoints: [path.join(projectRoot, "scripts/native-crashlytics-bridge.js")],
  outfile: path.join(distRoot, "native-crashlytics-bridge.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  logLevel: "silent",
});
await build({
  entryPoints: [path.join(projectRoot, "scripts/admob-service.js")],
  outfile: path.join(distRoot, "native-admob-service.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  logLevel: "silent",
});

const distIndexPath = path.join(distRoot, "index.html");
const distIndex = await readFile(distIndexPath, "utf8");
const appScriptTag = '<script src="script.js"></script>';
const occurrences = distIndex.split(appScriptTag).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected one ${appScriptTag} insertion point, found ${occurrences}`);
}
const updatedIndex = distIndex.replace(
  appScriptTag,
  '<script src="./capacitor-build-config.js"></script>\n<script src="./native-crashlytics-bridge.js"></script>\n<script src="./native-admob-service.js"></script>\n<script src="scripts/leaderboard-preview.js"></script>\n<script src="script.js"></script>',
);
await writeFile(distIndexPath, updatedIndex, "utf8");

console.info(`Copied ${runtimeFiles.length} allowlisted runtime files and the native consent bridge into dist/.`);
