import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";

// Google demo units only. No production ad units are configured in this build.
const TEST_AD_UNITS = Object.freeze({
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
});
const INTERSTITIAL_EVERY_TRANSITIONS = 3;
const INTERSTITIAL_MIN_INTERVAL_MS = 120000;
const BANNER_HEIGHT_PX = 50;
const BANNER_SAFE_SPACE_PX = 24;
const BANNER_SCREENS = ["menu", "pause", "result", "campaign-result"];

export function createAdMobService(dependencies = {}) {
  const capacitor = dependencies.capacitor || Capacitor;
  const admob = dependencies.admob || AdMob;
  const bannerEvents = dependencies.bannerEvents || BannerAdPluginEvents;
  const interstitialEvents = dependencies.interstitialEvents || InterstitialAdPluginEvents;
  const rewardedEvents = dependencies.rewardedEvents || RewardAdPluginEvents;
  const bannerPosition = dependencies.bannerPosition || BannerAdPosition;
  const bannerSize = dependencies.bannerSize || BannerAdSize;
  const consoleRef = dependencies.consoleRef || globalThis.console;
  const windowRef = dependencies.windowRef || globalThis.window;
  const documentRef = dependencies.documentRef || globalThis.document;
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const now = dependencies.now || Date.now;

  let consentInfo = null;
  let canRequestAds = false;
  let personalizedAdsPreference = false;
  let testBuildAllowed = false;
  let consentGeneration = 0;
  let adRequestPolicyGeneration = 0;
  let placementGeneration = 0;
  let sdkInitialized = false;
  let launchPromise = null;
  let privacyOptionsInProgress = false;
  let currentScreen = "menu";
  let currentMode = "NORMAL";
  let currentPlacement = "none";
  let foreground = !documentRef?.hidden;
  let placementQueue = Promise.resolve();
  let bannerCreated = false;
  let bannerShown = false;
  let bannerRequestPending = false;
  let bannerLoaded = false;
  let interstitialPrepared = false;
  let interstitialRequestPending = false;
  let interstitialLoaded = false;
  let interstitialShowing = false;
  let rewardedRequestPending = false;
  let rewardedLoaded = false;
  let rewardedFlowInProgress = false;
  let rewardedShowing = false;
  let rewardedEarned = false;
  let activeRewardedAttempt = null;
  let fullscreenAdInProgress = false;
  let eligibleCampaignCompletions = 0;
  let lastInterstitialAt = 0;
  let adListenersReady = false;

  // Coarse UMP/placement diagnostics are limited to Android test builds by the marker.
  function diagnostic(stage, info = consentInfo) {
    if (!testBuildAllowed || !consoleRef?.info) return;
    const statusValues = ["UNKNOWN", "REQUIRED", "NOT_REQUIRED", "OBTAINED"];
    const privacyValues = ["REQUIRED", "NOT_REQUIRED"];
    consoleRef.info("[AdMob debug]", {
      stage,
      status: statusValues.includes(info?.status) ? info.status : "UNKNOWN",
      canRequestAds: info?.canRequestAds === true,
      privacyOptionsRequirementStatus: privacyValues.includes(info?.privacyOptionsRequirementStatus)
        ? info.privacyOptionsRequirementStatus
        : "UNKNOWN",
      placement: currentPlacement,
      banner: { requestPending: bannerRequestPending, loaded: bannerLoaded, created: bannerCreated, shown: bannerShown },
      interstitial: {
        requestPending: interstitialRequestPending,
        loaded: interstitialLoaded,
        preparedForDisplay: interstitialPrepared,
        showing: interstitialShowing,
      },
      rewarded: { requestPending: rewardedRequestPending, loaded: rewardedLoaded, showing: rewardedShowing },
      fullscreenAdInProgress,
    });
  }

  function hasAdRequestEligibility() {
    return canRequestAds;
  }

  function adRequestOptions(options) {
    // OFF forces Google's non-personalized request treatment. ON removes only this override;
    // Google Mobile Ads and UMP still use their actual granular consent signals.
    return personalizedAdsPreference ? { ...options } : { ...options, npa: true };
  }

  function isNative() {
    try { return capacitor.isNativePlatform(); } catch { return false; }
  }

  async function isTestBuildAllowed() {
    if (!isNative()) return false;
    try {
      const response = await fetchImpl(new URL("./admob-test-build.json", windowRef.location.href), { cache: "no-store" });
      if (!response.ok) return false;
      const marker = await response.json();
      return marker?.mode === "google-test-ads-only";
    } catch {
      return false;
    }
  }

  function clearBannerInset() {
    if (!documentRef) return;
    BANNER_SCREENS.forEach(name => documentRef.getElementById(`screen-${name}`)?.classList.remove("admob-banner-visible"));
    documentRef.documentElement.style.removeProperty("--admob-banner-height");
  }

  function reserveBannerInset(screenName) {
    clearBannerInset();
    const screen = documentRef?.getElementById(`screen-${screenName}`);
    if (!screen) return;
    documentRef.documentElement.style.setProperty("--admob-banner-height", `${BANNER_HEIGHT_PX}px`);
    screen.classList.add("admob-banner-visible");
  }

  async function removeBannerAndClear() {
    bannerCreated = false;
    bannerShown = false;
    bannerLoaded = false;
    bannerRequestPending = false;
    clearBannerInset();
    if (!isNative()) return;
    try { await admob.hideBanner(); } catch { /* Continue to remove the native view. */ }
    try { await admob.removeBanner(); } catch { /* Ad UI remains unavailable if cleanup fails. */ }
  }

  async function hideBanner() {
    clearBannerInset();
    if (!isNative() || !bannerCreated || !bannerShown) return;
    try {
      await admob.hideBanner();
    } catch {
      // Ad UI is optional; never affect navigation or gameplay.
    }
    bannerShown = false;
  }

  function placementHasRoom(screenName) {
    if (screenName === "menu") return true;
    const screen = documentRef?.getElementById(`screen-${screenName}`);
    const content = screen?.querySelector?.(".menu-inner, .panel");
    const viewportHeight = Number(windowRef?.innerHeight || documentRef?.documentElement?.clientHeight || 0);
    if (!content || !viewportHeight) return viewportHeight >= 620;
    const contentHeight = Math.ceil(Number(content.scrollHeight || content.getBoundingClientRect?.().height || 0));
    return contentHeight > 0 && contentHeight + BANNER_HEIGHT_PX + BANNER_SAFE_SPACE_PX <= viewportHeight;
  }

  function desiredPlacement() {
    if (!isNative() || !testBuildAllowed || !sdkInitialized || !hasAdRequestEligibility() || !foreground || fullscreenAdInProgress) return "none";
    if (currentScreen === "menu") return "menu";
    if (currentScreen === "pause") return placementHasRoom("pause") ? "pause" : "none";
    if (currentScreen === "campaign-result" && currentMode === "CAMPAIGN") {
      return placementHasRoom("campaign-result") ? "campaign-result" : "none";
    }
    if (currentScreen === "result" && currentMode === "NORMAL") {
      return placementHasRoom("result") ? "result" : "none";
    }
    return "none";
  }

  async function renderPlacement(generation, consentVersion) {
    const placement = desiredPlacement();
    currentPlacement = placement;
    if (placement === "none") {
      await removeBannerAndClear();
      diagnostic("placement-cleared");
      return false;
    }
    if (bannerShown) {
      reserveBannerInset(placement);
      return true;
    }

    reserveBannerInset(placement);
    bannerRequestPending = !bannerCreated;
    if (bannerRequestPending) diagnostic("banner-request-started");
    try {
      if (bannerCreated) {
        await admob.resumeBanner();
      } else {
        await admob.showBanner(adRequestOptions({
          adId: TEST_AD_UNITS.banner,
          adSize: bannerSize.BANNER,
          position: bannerPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: true,
        }));
      }
      bannerRequestPending = false;
      const stillEligible = generation === placementGeneration && consentVersion === consentGeneration &&
        desiredPlacement() === placement;
      if (!stillEligible) {
        await removeBannerAndClear();
        diagnostic("stale-banner-result-discarded");
        return false;
      }
      bannerCreated = true;
      bannerShown = true;
      reserveBannerInset(placement);
      diagnostic("banner-placement-active");
      return true;
    } catch {
      bannerRequestPending = false;
      await removeBannerAndClear();
      diagnostic("banner-request-failed");
      return false;
    }
  }

  function schedulePlacement() {
    const generation = ++placementGeneration;
    const consentVersion = consentGeneration;
    const task = placementQueue.catch(() => false).then(() => renderPlacement(generation, consentVersion));
    placementQueue = task.catch(() => false);
    return task;
  }

  function scheduleBannerCleanup() {
    const task = placementQueue.catch(() => false).then(removeBannerAndClear);
    placementQueue = task.catch(() => false);
    return task;
  }

  async function installAdListeners() {
    if (adListenersReady) return;
    adListenersReady = true;
    try {
      await admob.addListener(bannerEvents.SizeChanged, size => {
        const height = Number(size?.height);
        if (height > 0 && hasAdRequestEligibility() && bannerShown && currentPlacement !== "none" &&
            placementHasRoom(currentScreen) && !fullscreenAdInProgress) {
          documentRef.documentElement.style.setProperty("--admob-banner-height", `${Math.ceil(height)}px`);
          documentRef.getElementById(`screen-${currentScreen}`)?.classList.add("admob-banner-visible");
        } else if (height === 0) {
          clearBannerInset();
        }
      });
      await admob.addListener(bannerEvents.Loaded, () => {
        if (!hasAdRequestEligibility() || currentPlacement === "none" || desiredPlacement() === "none") return;
        bannerLoaded = true;
        bannerRequestPending = false;
        diagnostic("banner-loaded");
      });
      await admob.addListener(bannerEvents.FailedToLoad, () => {
        ++placementGeneration;
        currentPlacement = "none";
        bannerRequestPending = false;
        bannerLoaded = false;
        bannerShown = false;
        bannerCreated = false;
        clearBannerInset();
        void scheduleBannerCleanup();
        diagnostic("banner-load-failed");
      });
      await admob.addListener(interstitialEvents.Loaded, () => {
        interstitialRequestPending = false;
        interstitialLoaded = true;
        diagnostic("interstitial-loaded");
      });
      await admob.addListener(interstitialEvents.FailedToLoad, () => {
        interstitialRequestPending = false;
        interstitialLoaded = false;
        interstitialPrepared = false;
        diagnostic("interstitial-load-failed");
      });
      await admob.addListener(interstitialEvents.Showed, () => {
        interstitialShowing = true;
        diagnostic("interstitial-showed");
      });
      await admob.addListener(interstitialEvents.Dismissed, () => {
        interstitialShowing = false;
        fullscreenAdInProgress = false;
        if (currentScreen !== "campaign-result") void schedulePlacement();
        interstitialLoaded = false;
        diagnostic("interstitial-dismissed");
      });
      await admob.addListener(interstitialEvents.FailedToShow, () => {
        interstitialShowing = false;
        fullscreenAdInProgress = false;
        if (currentScreen !== "campaign-result") void schedulePlacement();
        diagnostic("interstitial-show-failed");
      });
      await admob.addListener(rewardedEvents.Loaded, () => {
        rewardedRequestPending = false;
        rewardedLoaded = true;
        diagnostic("rewarded-loaded");
      });
      await admob.addListener(rewardedEvents.FailedToLoad, () => {
        rewardedRequestPending = false;
        rewardedLoaded = false;
        diagnostic("rewarded-load-failed");
      });
      await admob.addListener(rewardedEvents.Showed, () => {
        rewardedShowing = true;
        diagnostic("rewarded-showed");
      });
      await admob.addListener(rewardedEvents.Rewarded, reward => {
        if (rewardedFlowInProgress) {
          rewardedEarned = true;
          if (activeRewardedAttempt) {
            activeRewardedAttempt.rewardEventConfirmed = true;
            activeRewardedAttempt.eventReward = reward;
            finishRewardedAttemptIfReady(activeRewardedAttempt);
          }
        }
        diagnostic("rewarded-earned");
      });
      await admob.addListener(rewardedEvents.Dismissed, () => {
        rewardedShowing = false;
        if (activeRewardedAttempt) {
          activeRewardedAttempt.dismissed = true;
          finishRewardedAttemptIfReady(activeRewardedAttempt);
        }
        diagnostic("rewarded-dismissed");
      });
      await admob.addListener(rewardedEvents.FailedToShow, () => {
        rewardedShowing = false;
        if (activeRewardedAttempt) settleRewardedAttempt(activeRewardedAttempt, false);
        diagnostic("rewarded-show-failed");
      });
    } catch {
      // Optional ad events are for state accuracy; all requests remain consent-guarded.
    }
  }

  async function applyConsentInfo(info, stage = "consent-refresh") {
    const generation = ++consentGeneration;
    consentInfo = info && typeof info === "object" ? info : null;
    canRequestAds = typeof info?.canRequestAds === "boolean" && info.canRequestAds;
    if (!canRequestAds) {
      eligibleCampaignCompletions = 0;
      interstitialPrepared = false;
      interstitialLoaded = false;
      rewardedLoaded = false;
      await schedulePlacement();
      diagnostic(stage, consentInfo);
      return false;
    }

    try {
      await installAdListeners();
      if (!sdkInitialized) {
        await admob.initialize();
        sdkInitialized = true;
      }
      if (generation !== consentGeneration || !canRequestAds) {
        await schedulePlacement();
        return false;
      }
      await schedulePlacement();
      diagnostic(stage, consentInfo);
      return generation === consentGeneration && canRequestAds;
    } catch {
      canRequestAds = false;
      consentInfo = null;
      interstitialPrepared = false;
      await schedulePlacement();
      diagnostic(stage, null);
      return false;
    }
  }

  async function clearConsentEligibility(stage = "consent-unavailable") {
    ++consentGeneration;
    canRequestAds = false;
    consentInfo = null;
    eligibleCampaignCompletions = 0;
    interstitialPrepared = false;
    interstitialLoaded = false;
    rewardedLoaded = false;
    await schedulePlacement();
    diagnostic(stage, null);
    return false;
  }

  async function refreshConsentEligibility(stage = "privacy-options-closed") {
    try {
      const latest = await admob.requestConsentInfo();
      // UMP's canRequestAds value is authoritative; do not infer from a choice label.
      return await applyConsentInfo(latest, stage);
    } catch {
      return await clearConsentEligibility(stage);
    }
  }

  async function runInitialConsentFlow() {
    if (!isNative() || !testBuildAllowed) return false;
    try {
      let latest = await admob.requestConsentInfo();
      if (latest?.status === AdmobConsentStatus.REQUIRED && latest.isConsentFormAvailable === true) {
        latest = await admob.showConsentForm();
      }
      return await applyConsentInfo(latest, "startup");
    } catch {
      return await clearConsentEligibility("startup-unavailable");
    }
  }

  function initializeAtLaunch(personalizedAdsEnabled) {
    if (personalizedAdsEnabled !== undefined) personalizedAdsPreference = personalizedAdsEnabled === true;
    if (!isNative()) return Promise.resolve(false);
    if (!launchPromise) {
      launchPromise = isTestBuildAllowed().then(allowed => {
        testBuildAllowed = allowed;
        if (!allowed) return false;
        return runInitialConsentFlow();
      }).finally(() => { launchPromise = null; });
    }
    return launchPromise;
  }

  async function setPersonalizedAdsPreference(enabled) {
    const nextPreference = enabled === true;
    if (nextPreference === personalizedAdsPreference) return false;
    personalizedAdsPreference = nextPreference;
    ++adRequestPolicyGeneration;
    ++placementGeneration;
    interstitialPrepared = false;
    interstitialLoaded = false;
    await scheduleBannerCleanup();
    await schedulePlacement();
    return true;
  }

  async function showPrivacyOptions() {
    if (!isNative() || !testBuildAllowed || !consentInfo ||
        consentInfo.privacyOptionsRequirementStatus !== "REQUIRED" || privacyOptionsInProgress) {
      return { shown: false, canRequestAds };
    }
    privacyOptionsInProgress = true;
    try {
      await admob.showPrivacyOptionsForm();
      const eligible = await refreshConsentEligibility("privacy-options-closed");
      return { shown: true, canRequestAds: eligible };
    } catch {
      await clearConsentEligibility("privacy-options-error");
      return { shown: false, canRequestAds: false, refreshFailed: true };
    } finally {
      privacyOptionsInProgress = false;
    }
  }

  function onCampaignLevelCompleted(hasNextLevel) {
    if (!isNative() || !testBuildAllowed || !hasNextLevel || !sdkInitialized || !hasAdRequestEligibility()) return;
    // Count the completed level, but do not request an interstitial until the player taps NEXT LEVEL.
    eligibleCampaignCompletions += 1;
  }

  async function showInterstitialAtTransition() {
    if (!isNative() || !testBuildAllowed || !hasAdRequestEligibility() || !sdkInitialized ||
        currentScreen !== "campaign-result" || currentMode !== "CAMPAIGN" ||
        eligibleCampaignCompletions < INTERSTITIAL_EVERY_TRANSITIONS || fullscreenAdInProgress) return false;
    const currentTime = now();
    if (currentTime - lastInterstitialAt < INTERSTITIAL_MIN_INTERVAL_MS) return false;
    eligibleCampaignCompletions -= INTERSTITIAL_EVERY_TRANSITIONS;

    const generation = consentGeneration;
    const policyGeneration = adRequestPolicyGeneration;
    fullscreenAdInProgress = true;
    interstitialRequestPending = true;
    interstitialLoaded = false;
    interstitialPrepared = false;
    await hideBanner();
    try {
      await admob.prepareInterstitial(adRequestOptions({ adId: TEST_AD_UNITS.interstitial, isTesting: true }));
      interstitialRequestPending = false;
      interstitialLoaded = true;
      if (generation !== consentGeneration || policyGeneration !== adRequestPolicyGeneration ||
          !hasAdRequestEligibility() || currentScreen !== "campaign-result") return false;
      lastInterstitialAt = now();
      interstitialShowing = true;
      await admob.showInterstitial();
      interstitialLoaded = false;
      return true;
    } catch {
      interstitialRequestPending = false;
      interstitialPrepared = false;
      interstitialShowing = false;
      return false;
    } finally {
      if (!interstitialShowing) fullscreenAdInProgress = false;
      diagnostic("interstitial-transition-finished");
    }
  }

  function canOfferRevive() {
    return isNative() && testBuildAllowed && sdkInitialized && hasAdRequestEligibility() &&
      currentScreen === "result" && currentMode === "NORMAL" && foreground && !fullscreenAdInProgress;
  }

  function rewardItemIsValid(item) {
    return typeof item?.type === "string" && item.type.length > 0 && Number(item.amount) > 0;
  }

  function settleRewardedAttempt(attempt, earned) {
    if (attempt.settled) return;
    attempt.settled = true;
    if (activeRewardedAttempt === attempt) activeRewardedAttempt = null;
    attempt.resolve(earned);
  }

  function finishRewardedAttemptIfReady(attempt) {
    if (!attempt.dismissed) return;
    if (!attempt.rewardEventConfirmed) {
      settleRewardedAttempt(attempt, false);
      return;
    }
    if (!attempt.pluginReward) return;
    const sdkRewardConfirmed = attempt.rewardEventConfirmed && rewardItemIsValid(attempt.eventReward) &&
      rewardItemIsValid(attempt.pluginReward) && attempt.eventReward.type === attempt.pluginReward.type &&
      Number(attempt.eventReward.amount) === Number(attempt.pluginReward.amount);
    settleRewardedAttempt(attempt, sdkRewardConfirmed);
  }

  async function watchRewardedRevive() {
    if (!canOfferRevive() || rewardedFlowInProgress) return false;
    const generation = consentGeneration;
    const policyGeneration = adRequestPolicyGeneration;
    rewardedFlowInProgress = true;
    rewardedEarned = false;
    rewardedLoaded = false;
    rewardedRequestPending = true;
    fullscreenAdInProgress = true;
    await hideBanner();
    try {
      if (generation !== consentGeneration || policyGeneration !== adRequestPolicyGeneration ||
          !hasAdRequestEligibility() || currentScreen !== "result" || currentMode !== "NORMAL") return false;
      await admob.prepareRewardVideoAd(adRequestOptions({ adId: TEST_AD_UNITS.rewarded, isTesting: true }));
      rewardedRequestPending = false;
      rewardedLoaded = true;
      if (generation !== consentGeneration || policyGeneration !== adRequestPolicyGeneration ||
          !hasAdRequestEligibility() || currentScreen !== "result" || currentMode !== "NORMAL") {
        return false;
      }
      rewardedShowing = true;
      const attemptResult = new Promise(resolve => {
        activeRewardedAttempt = {
          resolve,
          rewardEventConfirmed: false,
          eventReward: null,
          pluginReward: null,
          dismissed: false,
          settled: false,
        };
      });
      const attempt = activeRewardedAttempt;
      void admob.showRewardVideoAd({ adId: TEST_AD_UNITS.rewarded })
        .then(reward => {
          attempt.pluginReward = reward;
          finishRewardedAttemptIfReady(attempt);
        })
        .catch(() => settleRewardedAttempt(attempt, false));
      const confirmedBySdk = await attemptResult;
      rewardedLoaded = false;
      return confirmedBySdk && generation === consentGeneration && policyGeneration === adRequestPolicyGeneration &&
        hasAdRequestEligibility();
    } catch {
      rewardedRequestPending = false;
      rewardedLoaded = false;
      return false;
    } finally {
      rewardedShowing = false;
      rewardedFlowInProgress = false;
      if (activeRewardedAttempt) settleRewardedAttempt(activeRewardedAttempt, false);
      fullscreenAdInProgress = false;
      rewardedEarned = false;
      await schedulePlacement();
    }
  }

  function setScreen(screenName, mode = currentMode) {
    currentScreen = screenName;
    currentMode = mode;
    return schedulePlacement();
  }

  function onVisibilityChanged(isVisible) {
    foreground = isVisible === true;
    return schedulePlacement();
  }

  return Object.freeze({
    initializeAtLaunch,
    setPersonalizedAdsPreference,
    onCampaignLevelCompleted,
    showInterstitialAtTransition,
    canOfferRevive,
    watchRewardedRevive,
    showPrivacyOptions,
    setScreen,
    onVisibilityChanged,
  });
}

if (typeof window !== "undefined") {
  const AdMobService = createAdMobService();
  Object.defineProperty(window, "BombDefuseAdMobService", {
    configurable: false,
    enumerable: false,
    value: AdMobService,
    writable: false,
  });
}
