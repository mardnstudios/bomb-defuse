import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createAdMobService } from "../scripts/admob-service.js";

const gameScript = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const policy = readFileSync(new URL("../privacy-policy.html", import.meta.url), "utf8");

const bannerEvents = { SizeChanged: "sizeChanged", Loaded: "bannerLoaded", FailedToLoad: "bannerFailed" };
const interstitialEvents = {
  Loaded: "interstitialLoaded", FailedToLoad: "interstitialFailedToLoad",
  Showed: "interstitialShowed", Dismissed: "interstitialDismissed", FailedToShow: "interstitialFailedToShow",
};
const rewardedEvents = {
  Loaded: "rewardedLoaded", FailedToLoad: "rewardedFailedToLoad", Showed: "rewardedShowed",
  Rewarded: "rewardedEarned", Dismissed: "rewardedDismissed", FailedToShow: "rewardedFailedToShow",
};
const bannerPosition = { BOTTOM_CENTER: "BOTTOM_CENTER" };
const bannerSize = { BANNER: "BANNER" };

function makeHarness({
  consentResponses = [], markerMode = "google-test-ads-only", viewportHeight = 800, contentHeight = 300,
  showBanner = null, showReward = null, prepareReward = null, now = () => 180000,
  native = true,
} = {}) {
  const calls = [];
  const requestOptions = { banner: [], interstitial: [], rewarded: [] };
  const logs = [];
  const listeners = new Map();
  const classes = new Map();
  const styleValues = new Map();
  const responseQueue = [...consentResponses];
  const windowRef = {
    innerHeight: viewportHeight,
    location: { href: "https://localhost/" },
  };
  const makeClassList = id => {
    if (!classes.has(id)) classes.set(id, new Set());
    const names = classes.get(id);
    return {
      add: name => names.add(name),
      remove: name => names.delete(name),
      contains: name => names.has(name),
    };
  };
  const documentRef = {
    hidden: false,
    documentElement: {
      clientHeight: viewportHeight,
      style: {
        setProperty: (name, value) => styleValues.set(name, value),
        removeProperty: name => styleValues.delete(name),
      },
    },
    getElementById: id => id.startsWith("screen-") ? {
      classList: makeClassList(id),
      querySelector: () => ({ scrollHeight: contentHeight, getBoundingClientRect: () => ({ height: contentHeight }) }),
    } : null,
  };
  const admob = {
    requestConsentInfo: async () => {
      calls.push("requestConsentInfo");
      const next = responseQueue.shift();
      if (next instanceof Error) throw next;
      return next || { status: "NOT_REQUIRED", canRequestAds: false, privacyOptionsRequirementStatus: "NOT_REQUIRED" };
    },
    showConsentForm: async () => { calls.push("showConsentForm"); return null; },
    showPrivacyOptionsForm: async () => { calls.push("showPrivacyOptionsForm"); },
    initialize: async () => { calls.push("initialize"); },
    addListener: async (name, callback) => { listeners.set(name, callback); calls.push(`listen:${name}`); return { remove: async () => {} }; },
    showBanner: async options => { calls.push("showBanner"); requestOptions.banner.push(options); if (showBanner) await showBanner(); },
    resumeBanner: async () => { calls.push("resumeBanner"); },
    hideBanner: async () => { calls.push("hideBanner"); },
    removeBanner: async () => { calls.push("removeBanner"); },
    prepareInterstitial: async options => { calls.push("prepareInterstitial"); requestOptions.interstitial.push(options); },
    showInterstitial: async () => {
      calls.push("showInterstitial");
      listeners.get(interstitialEvents.Showed)?.();
      listeners.get(interstitialEvents.Dismissed)?.();
    },
    prepareRewardVideoAd: async options => {
      calls.push("prepareRewardVideoAd");
      requestOptions.rewarded.push(options);
      if (prepareReward) await prepareReward();
    },
    showRewardVideoAd: async () => {
      calls.push("showRewardVideoAd");
      if (showReward) return showReward(listeners, rewardedEvents);
      return undefined;
    },
  };
  const service = createAdMobService({
    capacitor: { isNativePlatform: () => native },
    admob,
    bannerEvents,
    interstitialEvents,
    rewardedEvents,
    bannerPosition,
    bannerSize,
    consoleRef: { info: (...args) => logs.push(args) },
    windowRef,
    documentRef,
    fetchImpl: async () => ({ ok: true, json: async () => ({ mode: markerMode }) }),
    now,
  });
  return { service, calls, requestOptions, logs, listeners, classes, styleValues, admob, windowRef };
}

const allowed = privacyOptionsRequirementStatus => ({
  status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus,
});
const denied = () => ({ status: "OBTAINED", canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" });

test("initial UMP denial leaves the menu usable and makes no SDK or ad request", async () => {
  const harness = makeHarness({ consentResponses: [denied()] });
  assert.equal(await harness.service.initializeAtLaunch(true), false);
  assert.equal(harness.calls.includes("initialize"), false);
  assert.equal(harness.calls.includes("showBanner"), false);
  assert.equal(harness.calls.includes("prepareInterstitial"), false);
  assert.equal(harness.calls.includes("prepareRewardVideoAd"), false);
  assert.equal(harness.calls.includes("removeBanner"), true);
  assert.ok(gameScript.indexOf('showScreen("menu");') < gameScript.indexOf("initializeAtLaunch(ConsentManager.hasConsent(\"personalizedAds\"))"));
});

test("canRequestAds, not a choice label or status, controls ad eligibility", async () => {
  const harness = makeHarness({ consentResponses: [{ ...allowed("NOT_REQUIRED"), status: "REQUIRED" }] });
  assert.equal(await harness.service.initializeAtLaunch(), true);
  assert.equal(harness.calls.includes("initialize"), true);
  assert.equal(harness.calls.includes("showBanner"), true);
});

test("Personalized Ads OFF passes npa=true to banner, interstitial, and rewarded requests", async () => {
  const reward = { type: "revive", amount: 1 };
  const harness = makeHarness({
    consentResponses: [allowed("REQUIRED")],
    showReward: (listeners, events) => {
      listeners.get(events.Rewarded)?.(reward);
      return new Promise(resolve => setTimeout(() => {
        resolve(reward);
        setImmediate(() => listeners.get(events.Dismissed)?.());
      }, 0));
    },
  });
  assert.equal(await harness.service.initializeAtLaunch(), true);
  assert.equal(harness.requestOptions.banner[0].npa, true);

  await harness.service.setScreen("campaign-result", "CAMPAIGN");
  for (let i = 0; i < 3; i += 1) harness.service.onCampaignLevelCompleted(true);
  assert.equal(await harness.service.showInterstitialAtTransition(), true);
  assert.equal(harness.requestOptions.interstitial[0].npa, true);

  await harness.service.setScreen("result", "NORMAL");
  assert.equal(await harness.service.watchRewardedRevive(), true);
  assert.equal(harness.requestOptions.rewarded[0].npa, true);
});

test("Personalized Ads ON removes only the npa override and OFF reverses it across new requests", async () => {
  const reward = { type: "revive", amount: 1 };
  const harness = makeHarness({
    consentResponses: [allowed("REQUIRED")],
    showReward: (listeners, events) => {
      listeners.get(events.Rewarded)?.(reward);
      return new Promise(resolve => setTimeout(() => {
        resolve(reward);
        setImmediate(() => listeners.get(events.Dismissed)?.());
      }, 0));
    },
  });
  assert.equal(await harness.service.initializeAtLaunch(true), true);
  assert.equal(Object.hasOwn(harness.requestOptions.banner[0], "npa"), false);

  await harness.service.setScreen("campaign-result", "CAMPAIGN");
  for (let i = 0; i < 3; i += 1) harness.service.onCampaignLevelCompleted(true);
  assert.equal(await harness.service.showInterstitialAtTransition(), true);
  assert.equal(Object.hasOwn(harness.requestOptions.interstitial[0], "npa"), false);

  await harness.service.setScreen("result", "NORMAL");
  assert.equal(await harness.service.watchRewardedRevive(), true);
  assert.equal(Object.hasOwn(harness.requestOptions.rewarded[0], "npa"), false);

  await harness.service.setScreen("menu", "NORMAL");
  assert.equal(await harness.service.setPersonalizedAdsPreference(false), true);
  assert.equal(harness.requestOptions.banner.at(-1).npa, true);
});

test("profile normalization and consent UI fail closed and persist the effective preference", () => {
  assert.match(gameScript, /function isPersonalizedAdsPreferenceAllowed\(privacyValue, consentValue\)\s*\{\s*return privacyValue === true && consentValue === true;/);
  assert.match(gameScript, /personalizedAds: false/);
  assert.match(gameScript, /const personalizedAdsAllowed = isPersonalizedAdsPreferenceAllowed\(privIn\.personalizedAds, consIn\.personalizedAds\)/);
  assert.match(gameScript, /profile\.consent\[type\] = allowed;\s*profile\.privacy\[type\] = allowed;\s*SaveManager\.save\(profile\);/);
  assert.match(gameScript, /setPersonalizedAdsPreference\(ConsentManager\.hasConsent\("personalizedAds"\)\)/);
  assert.match(html, /OFF requests non-personalized ads where supported[\s\S]*ON allows personalization only when UMP permits it/);
  assert.match(policy, /When OFF, the Android test ad requests set the plugin’s non-personalized option/);
});

test("menu and pause may show a reserved banner; active campaign and endless gameplay remove it", async () => {
  const harness = makeHarness({ consentResponses: [allowed("REQUIRED")] });
  await harness.service.initializeAtLaunch();
  assert.equal(harness.classes.get("screen-menu").has("admob-banner-visible"), true);

  await harness.service.setScreen("game", "CAMPAIGN");
  assert.equal(harness.classes.get("screen-menu").has("admob-banner-visible"), false);
  assert.equal(harness.calls.includes("removeBanner"), true);
  for (let i = 0; i < 3; i += 1) harness.service.onCampaignLevelCompleted(true);
  assert.equal(await harness.service.showInterstitialAtTransition(), false);
  assert.equal(harness.calls.includes("prepareInterstitial"), false);
  const requestsBeforePause = harness.calls.filter(call => call === "showBanner").length;
  await harness.service.setScreen("pause", "NORMAL");
  assert.equal(harness.calls.filter(call => call === "showBanner").length, requestsBeforePause + 1);
  assert.equal(harness.classes.get("screen-pause").has("admob-banner-visible"), true);
  await harness.service.setScreen("game", "NORMAL");
  assert.equal(harness.classes.get("screen-pause").has("admob-banner-visible"), false);
  assert.match(styles, /\.screen\.admob-banner-visible/);
});

test("campaign and endless results use a banner only when reserved layout space fits", async () => {
  const roomy = makeHarness({ consentResponses: [allowed("REQUIRED")] });
  await roomy.service.initializeAtLaunch();
  await roomy.service.setScreen("campaign-result", "CAMPAIGN");
  assert.equal(roomy.classes.get("screen-campaign-result").has("admob-banner-visible"), true);
  await roomy.service.setScreen("result", "NORMAL");
  assert.equal(roomy.classes.get("screen-result").has("admob-banner-visible"), true);

  const short = makeHarness({ consentResponses: [allowed("REQUIRED")], viewportHeight: 568, contentHeight: 520 });
  await short.service.initializeAtLaunch();
  await short.service.setScreen("result", "NORMAL");
  assert.equal(short.classes.get("screen-result").has("admob-banner-visible"), false);
  assert.equal(short.calls.filter(call => call === "showBanner").length, 1);
});

test("campaign interstitial is not requested until Next Level and respects completion cadence and cooldown", async () => {
  let clock = 180000;
  const harness = makeHarness({ consentResponses: [allowed("REQUIRED")], now: () => clock });
  await harness.service.initializeAtLaunch();
  await harness.service.setScreen("campaign-result", "CAMPAIGN");
  for (let i = 0; i < 3; i += 1) harness.service.onCampaignLevelCompleted(true);
  assert.equal(harness.calls.includes("prepareInterstitial"), false);

  const first = harness.service.showInterstitialAtTransition();
  assert.equal(await harness.service.showInterstitialAtTransition(), false);
  assert.equal(await first, true);
  assert.equal(harness.calls.filter(call => call === "prepareInterstitial").length, 1);
  assert.equal(harness.calls.filter(call => call === "showInterstitial").length, 1);

  for (let i = 0; i < 3; i += 1) harness.service.onCampaignLevelCompleted(true);
  clock += 119999;
  assert.equal(await harness.service.showInterstitialAtTransition(), false);
  assert.equal(harness.calls.filter(call => call === "prepareInterstitial").length, 1);
  clock += 1;
  assert.equal(await harness.service.showInterstitialAtTransition(), true);
  assert.equal(harness.calls.filter(call => call === "prepareInterstitial").length, 2);
});

test("rewarded revive succeeds only after both the reward event and SDK result, then restores result placement", async () => {
  const reward = { type: "revive", amount: 1 };
  const harness = makeHarness({
    consentResponses: [allowed("REQUIRED")],
    showReward: (listeners, events) => {
      listeners.get(events.Rewarded)?.(reward);
      return new Promise(resolve => setTimeout(() => {
        resolve(reward);
        setImmediate(() => listeners.get(events.Dismissed)?.());
      }, 0));
    },
  });
  await harness.service.initializeAtLaunch();
  await harness.service.setScreen("result", "NORMAL");
  assert.equal(harness.service.canOfferRevive(), true);
  assert.equal(await harness.service.watchRewardedRevive(), true);
  assert.equal(harness.calls.includes("prepareRewardVideoAd"), true);
  assert.equal(harness.calls.includes("showRewardVideoAd"), true);
  assert.equal(harness.classes.get("screen-result").has("admob-banner-visible"), true);
});

test("rewarded dismissal without reward and load/show failures never award a revive", async () => {
  const skipped = makeHarness({
    consentResponses: [allowed("REQUIRED")],
    showReward: (listeners, events) => new Promise(resolve => setTimeout(() => {
      listeners.get(events.Dismissed)?.();
      resolve(undefined);
    }, 0)),
  });
  await skipped.service.initializeAtLaunch();
  await skipped.service.setScreen("result", "NORMAL");
  assert.equal(await skipped.service.watchRewardedRevive(), false);
  assert.equal(skipped.calls.includes("showRewardVideoAd"), true);

  const missingRewardEvent = makeHarness({
    consentResponses: [allowed("REQUIRED")],
    showReward: (listeners, events) => {
      setImmediate(() => listeners.get(events.Dismissed)?.());
      return Promise.resolve({ type: "revive", amount: 1 });
    },
  });
  await missingRewardEvent.service.initializeAtLaunch();
  await missingRewardEvent.service.setScreen("result", "NORMAL");
  assert.equal(await missingRewardEvent.service.watchRewardedRevive(), false);

  const failed = makeHarness({
    consentResponses: [allowed("REQUIRED")],
    prepareReward: async () => { throw new Error("offline"); },
  });
  await failed.service.initializeAtLaunch();
  await failed.service.setScreen("result", "NORMAL");
  assert.equal(await failed.service.watchRewardedRevive(), false);
  assert.equal(failed.calls.includes("showRewardVideoAd"), false);
});

test("denied UMP blocks all new placements and removes an existing banner", async () => {
  const harness = makeHarness({ consentResponses: [allowed("REQUIRED"), denied()] });
  await harness.service.initializeAtLaunch();
  harness.service.onCampaignLevelCompleted(true);
  harness.service.onCampaignLevelCompleted(true);
  harness.service.onCampaignLevelCompleted(true);
  const result = await harness.service.showPrivacyOptions();
  assert.deepEqual(result, { shown: true, canRequestAds: false });
  assert.equal(harness.calls.includes("prepareInterstitial"), false);
  assert.equal(harness.calls.includes("prepareRewardVideoAd"), false);
  assert.equal(harness.classes.get("screen-menu").has("admob-banner-visible"), false);
  assert.equal(await harness.service.showInterstitialAtTransition(), false);
  assert.equal(harness.service.canOfferRevive(), false);
  assert.equal(await harness.service.watchRewardedRevive(), false);
  assert.equal(harness.calls.includes("prepareRewardVideoAd"), false);
  const privacyLog = harness.logs.findLast(([label, details]) =>
    label === "[AdMob debug]" && details.stage === "privacy-options-closed");
  assert.equal(privacyLog[1].canRequestAds, false);
  assert.equal(privacyLog[1].banner.shown, false);
});

test("a later real UMP response can restore placement after an actual ineligible result", async () => {
  const harness = makeHarness({ consentResponses: [allowed("REQUIRED"), denied(), allowed("REQUIRED")] });
  await harness.service.initializeAtLaunch();
  const initialBannerRequests = harness.calls.filter(call => call === "showBanner").length;

  assert.deepEqual(await harness.service.showPrivacyOptions(), { shown: true, canRequestAds: false });
  assert.equal(harness.classes.get("screen-menu").has("admob-banner-visible"), false);
  assert.equal(harness.calls.filter(call => call === "showBanner").length, initialBannerRequests);

  assert.deepEqual(await harness.service.showPrivacyOptions(), { shown: true, canRequestAds: true });
  assert.equal(harness.classes.get("screen-menu").has("admob-banner-visible"), true);
  assert.equal(harness.calls.filter(call => call === "requestConsentInfo").length, 3);
  assert.equal(harness.calls.filter(call => call === "initialize").length, 1);
});

test("a stale banner completion after a placement change cannot restore its old screen", async () => {
  let finishBannerRequest;
  const harness = makeHarness({
    consentResponses: [allowed("REQUIRED")],
    showBanner: () => new Promise(resolve => { finishBannerRequest = resolve; }),
  });
  const launching = harness.service.initializeAtLaunch();
  while (!finishBannerRequest) await new Promise(resolve => setImmediate(resolve));
  const gameTransition = harness.service.setScreen("game", "NORMAL");
  finishBannerRequest();
  await Promise.all([launching, gameTransition]);
  assert.equal(harness.classes.get("screen-menu").has("admob-banner-visible"), false);
  assert.equal(harness.classes.get("screen-result")?.has("admob-banner-visible") || false, false);
  assert.equal(harness.calls.includes("removeBanner"), true);
});

test("banner load failure clears reserved space and does not trigger an automatic repeat request", async () => {
  const harness = makeHarness({ consentResponses: [allowed("REQUIRED")] });
  await harness.service.initializeAtLaunch();
  harness.listeners.get(bannerEvents.FailedToLoad)?.({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.classes.get("screen-menu").has("admob-banner-visible"), false);
  assert.equal(harness.calls.filter(call => call === "showBanner").length, 1);
  assert.equal(harness.calls.includes("removeBanner"), true);
});

test("privacy options are single-flight, refresh UMP once, and do not reopen the full consent form", async () => {
  let finishPrivacyForm;
  const harness = makeHarness({
    consentResponses: [allowed("REQUIRED"), allowed("REQUIRED")],
  });
  await harness.service.initializeAtLaunch();
  harness.admob.showPrivacyOptionsForm = async () => {
    harness.calls.push("showPrivacyOptionsForm");
    return new Promise(resolve => { finishPrivacyForm = resolve; });
  };
  const first = harness.service.showPrivacyOptions();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await harness.service.showPrivacyOptions()).shown, false);
  assert.equal(harness.calls.filter(call => call === "showPrivacyOptionsForm").length, 1);
  finishPrivacyForm();
  assert.deepEqual(await first, { shown: true, canRequestAds: true });
  assert.equal(harness.calls.filter(call => call === "showConsentForm").length, 0);
  assert.equal(harness.calls.filter(call => call === "requestConsentInfo").length, 2);
});

test("browser website compatibility never fetches the native marker or calls AdMob", async () => {
  const harness = makeHarness({ native: false, consentResponses: [allowed("REQUIRED")] });
  assert.equal(await harness.service.initializeAtLaunch(), false);
  await harness.service.setScreen("menu", "NORMAL");
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.service.canOfferRevive(), false);
  assert.equal(await harness.service.watchRewardedRevive(), false);
  assert.doesNotMatch(readFileSync(new URL("../index.html", import.meta.url), "utf8"), /native-admob-service\.js/);
});

test("diagnostics remain marker-gated and no temporary helper ships in release assets", async () => {
  const debugHarness = makeHarness({ consentResponses: [allowed("NOT_REQUIRED")] });
  await debugHarness.service.initializeAtLaunch();
  assert.ok(debugHarness.logs.some(([label, details]) => label === "[AdMob debug]" && details.stage === "startup"));
  const production = makeHarness({ markerMode: "production", consentResponses: [allowed("NOT_REQUIRED")] });
  assert.equal(await production.service.initializeAtLaunch(), false);
  assert.deepEqual(production.logs, []);
  assert.equal(existsSync(new URL("../android/app/src/debug/assets/public/admob-debug-test-helper.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../android/app/src/main/assets/public/admob-debug-test-helper.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../android/app/src/release/assets/public/admob-debug-test-helper.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/admob-debug-test-helper.js", import.meta.url)), false);
  const releaseBundle = readFileSync(new URL("../dist/native-admob-service.js", import.meta.url), "utf8");
  assert.doesNotMatch(releaseBundle, /SIMULATED_INELIGIBLE|simulateDebugIneligibleState|__bombDefuseSimulateAdIneligible|admob-debug-test-helper\.js/);
  assert.doesNotMatch(readFileSync(new URL("../scripts/admob-service.js", import.meta.url), "utf8"), /SIMULATED_INELIGIBLE|simulateDebugIneligibleState|__bombDefuseSimulateAdIneligible/);
  assert.equal(existsSync(new URL("../android/app/build/intermediates/assets/release/mergeReleaseAssets/public/admob-debug-test-helper.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../android/app/build/intermediates/assets/debug/mergeDebugAssets/public/admob-debug-test-helper.js", import.meta.url)), false);
  assert.match(html, /id="btn-revive-result"[^>]*style="display: none;"/);
  assert.match(html, /id="btn-menu-result"[^>]*>END RUN</);
  assert.match(policy, /test rewarded ad/);
  assert.match(policy, /No ad request is made unless UMP reports/);
});
