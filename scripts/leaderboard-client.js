(function attachBombDefuseLeaderboardClient(root) {
  "use strict";

  const firebaseCompatVersion = "10.14.1";
  const config = root.__BOMB_DEFUSE_LEADERBOARD_CONFIG__ || { enabled: false };
  let sdkPromise = null;
  let functionsInstance = null;
  let appCheckReady = false;

  function clientError(code, message) {
    const error = new Error(message);
    error.code = `leaderboard/${code}`;
    return error;
  }

  function isNative() {
    try { return root.Capacitor?.isNativePlatform?.() === true; } catch { return false; }
  }

  function configured() {
    const firebaseProjectId = config.firebaseEmulator?.enabled === true
      ? config.firebaseEmulator.projectId
      : config.projectId;
    return config.enabled === true && typeof firebaseProjectId === "string" && Boolean(firebaseProjectId) &&
      typeof config.region === "string" && Boolean(config.region) &&
      (config.emulator?.enabled !== true || config.firebaseEmulator?.enabled === true);
  }

  function addScript(url) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find(script => script.src === url);
      if (existing?.dataset.loaded === "true") return resolve();
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(clientError("sdk-load-failed", "Leaderboard SDK could not load.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
      script.addEventListener("error", () => reject(clientError("sdk-load-failed", "Leaderboard SDK could not load.")), { once: true });
      document.head.appendChild(script);
    });
  }

  async function initialize() {
    if (!configured()) throw clientError("not-configured", "The global leaderboard backend is not configured.");
    const expectedProjectId = config.firebaseEmulator?.enabled === true
      ? config.firebaseEmulator.projectId
      : config.projectId;
    if (!root.firebase?.apps?.length || root.firebase.app().options.projectId !== expectedProjectId) {
      throw clientError("firebase-not-ready", "Firebase is unavailable for leaderboard requests.");
    }
    if (!config.emulator?.enabled && isNative()) {
      if (typeof root.BombDefuseAppCheck?.getToken !== "function") {
        throw clientError("app-check-not-configured", "Native App Check is not configured; no leaderboard request was made.");
      }
      await root.BombDefuseAppCheck.getToken();
      appCheckReady = true;
    } else if (!config.emulator?.enabled) {
      if (!config.appCheckSiteKey) {
        throw clientError("app-check-not-configured", "Web App Check is not configured; no leaderboard request was made.");
      }
      await addScript(`https://www.gstatic.com/firebasejs/${firebaseCompatVersion}/firebase-app-check-compat.js`);
      if (!root.firebase.appCheck) throw clientError("app-check-unavailable", "Web App Check could not initialize.");
      const appCheck = root.firebase.appCheck();
      if (!root.__BOMB_DEFUSE_APP_CHECK_INITIALIZED__) {
        appCheck.activate(new root.firebase.appCheck.ReCaptchaV3Provider(config.appCheckSiteKey), true);
        root.__BOMB_DEFUSE_APP_CHECK_INITIALIZED__ = true;
      }
      await appCheck.getToken(false);
      appCheckReady = true;
    }

    await addScript(`https://www.gstatic.com/firebasejs/${firebaseCompatVersion}/firebase-functions-compat.js`);
    if (!root.firebase.functions) throw clientError("functions-unavailable", "Firebase Functions could not initialize.");
    functionsInstance = root.firebase.app().functions(config.region);
    if (config.emulator?.enabled) {
      const host = isNative() ? (config.emulator.androidHost || "10.0.2.2") : config.emulator.host || "127.0.0.1";
      functionsInstance.useEmulator(host, Number(config.emulator.functionsPort) || 5001);
      appCheckReady = true;
    }
    return functionsInstance;
  }

  function getFunctions() {
    if (!configured()) return Promise.reject(clientError("not-configured", "The global leaderboard backend is not configured."));
    if (!config.emulator?.enabled && typeof navigator !== "undefined" && navigator.onLine === false) {
      return Promise.reject(clientError("offline", "The leaderboard is unavailable while offline."));
    }
    if (!sdkPromise) sdkPromise = initialize().catch(error => { sdkPromise = null; functionsInstance = null; throw error; });
    return sdkPromise;
  }

  async function call(name, data = {}) {
    const functions = await getFunctions();
    if (!appCheckReady && config.emulator?.enabled !== true) {
      throw clientError("app-check-not-configured", "App Check is required; no leaderboard request was made.");
    }
    return (await functions.httpsCallable(name)(data)).data;
  }

  root.BombDefuseLeaderboardClient = Object.freeze({
    isConfigured: configured,
    getBestScore: () => call("getBestScoreLeaderboard"),
    getBestStreak: () => call("getBestStreakLeaderboard"),
    getMyRank: () => call("getMyEndlessLeaderboardRank"),
    beginRun: () => call("beginEndlessLeaderboardRun"),
    submitRunAction: action => call("submitEndlessLeaderboardAction", action),
    finishRun: request => call("finishEndlessLeaderboardRun", request),
    withdraw: () => call("withdrawEndlessLeaderboard"),
  });
})(typeof window !== "undefined" ? window : globalThis);
