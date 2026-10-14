import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
} from "@capacitor-community/admob";

// Google demo units only. Do not replace these with account ad units in this phase.
const TEST_AD_UNITS = Object.freeze({
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
});
const INTERSTITIAL_EVERY_TRANSITIONS = 3;
const INTERSTITIAL_MIN_INTERVAL_MS = 120000;

const AdMobService = (() => {
  let consentInfo = null;
  let canRequestAds = false;
  let testBuildAllowed = false;
  let sdkInitialized = false;
  let launchPromise = null;
  let currentScreen = "menu";
  let foreground = typeof document === "undefined" || !document.hidden;
  let bannerCreated = false;
  let bannerShown = false;
  let interstitialPrepared = false;
  let completedTransitions = 0;
  let lastInterstitialAt = 0;
  let bannerEventsReady = false;

  function isNative() {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
  }

  async function isTestBuildAllowed() {
    if (!isNative()) return false;
    try {
      const response = await fetch(new URL("./admob-test-build.json", window.location.href), { cache: "no-store" });
      if (!response.ok) return false;
      const marker = await response.json();
      return marker?.mode === "google-test-ads-only";
    } catch {
      return false;
    }
  }

  function clearBannerInset() {
    if (typeof document === "undefined") return;
    document.getElementById("screen-menu")?.classList.remove("admob-banner-visible");
    document.documentElement.style.removeProperty("--admob-banner-height");
  }

  async function hideBanner() {
    if (!isNative() || !bannerCreated || !bannerShown) {
      clearBannerInset();
      return;
    }
    try {
      await AdMob.hideBanner();
    } catch {
      // Ad UI is optional; never affect navigation or gameplay.
    }
    bannerShown = false;
    clearBannerInset();
  }

  async function showMenuBanner() {
    if (!isNative() || !sdkInitialized || !canRequestAds || !foreground || currentScreen !== "menu") {
      await hideBanner();
      return false;
    }
    if (bannerShown) return true;
    try {
      if (bannerCreated) {
        await AdMob.resumeBanner();
      } else {
        await AdMob.showBanner({
          adId: TEST_AD_UNITS.banner,
          adSize: BannerAdSize.BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: true,
        });
        bannerCreated = true;
      }
      bannerShown = true;
      const menu = document.getElementById("screen-menu");
      if (menu) {
        document.documentElement.style.setProperty("--admob-banner-height", "50px");
        menu.classList.add("admob-banner-visible");
      }
      return true;
    } catch {
      bannerCreated = false;
      bannerShown = false;
      clearBannerInset();
      return false;
    }
  }

  async function installBannerListeners() {
    if (bannerEventsReady) return;
    bannerEventsReady = true;
    try {
      await AdMob.addListener(BannerAdPluginEvents.SizeChanged, size => {
        const height = Number(size?.height);
        if (height > 0 && currentScreen === "menu" && foreground) {
          document.documentElement.style.setProperty("--admob-banner-height", `${Math.ceil(height)}px`);
          document.getElementById("screen-menu")?.classList.add("admob-banner-visible");
        } else if (height === 0) {
          clearBannerInset();
        }
      });
      await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
        bannerCreated = false;
        bannerShown = false;
        clearBannerInset();
      });
    } catch {
      // Event listeners are only for layout/failure polish; requests remain guarded below.
    }
  }

  async function updateConsentAndInitialize() {
    if (!isNative() || !testBuildAllowed) return false;
    canRequestAds = false;
    consentInfo = null;
    try {
      let latest = await AdMob.requestConsentInfo();
      if (latest.status === AdmobConsentStatus.UNKNOWN) return false;
      if (latest.status === AdmobConsentStatus.REQUIRED) {
        if (latest.isConsentFormAvailable !== true) return false;
        latest = await AdMob.showConsentForm();
      }
      if (latest.status === AdmobConsentStatus.UNKNOWN || latest.canRequestAds !== true) return false;
      consentInfo = latest;
      canRequestAds = true;
      await installBannerListeners();
      if (!sdkInitialized) {
        await AdMob.initialize();
        sdkInitialized = true;
      }
      await showMenuBanner();
      return true;
    } catch {
      consentInfo = null;
      canRequestAds = false;
      sdkInitialized = false;
      await hideBanner();
      return false;
    }
  }

  function initializeAtLaunch() {
    if (!isNative()) return Promise.resolve(false);
    if (!launchPromise) {
      launchPromise = isTestBuildAllowed().then(allowed => {
        testBuildAllowed = allowed;
        return allowed ? updateConsentAndInitialize() : false;
      }).finally(() => {
        launchPromise = null;
      });
    }
    return launchPromise;
  }

  async function showPrivacyOptions() {
    if (!isNative() || !testBuildAllowed || !consentInfo ||
        consentInfo.privacyOptionsRequirementStatus !== "REQUIRED") return false;
    try {
      await AdMob.showPrivacyOptionsForm();
      return await updateConsentAndInitialize();
    } catch {
      canRequestAds = false;
      await hideBanner();
      return false;
    }
  }

  function onCampaignLevelCompleted(hasNextLevel) {
    if (!isNative() || !testBuildAllowed || !hasNextLevel || !sdkInitialized || !canRequestAds) return;
    completedTransitions += 1;
    interstitialPrepared = false;
    if (completedTransitions % INTERSTITIAL_EVERY_TRANSITIONS !== 0) return;
    void AdMob.prepareInterstitial({ adId: TEST_AD_UNITS.interstitial, isTesting: true })
      .then(() => { interstitialPrepared = true; })
      .catch(() => { interstitialPrepared = false; });
  }

  async function showInterstitialAtTransition() {
    if (!isNative() || !testBuildAllowed || !canRequestAds || !sdkInitialized || !interstitialPrepared) return false;
    const now = Date.now();
    if (now - lastInterstitialAt < INTERSTITIAL_MIN_INTERVAL_MS) return false;
    interstitialPrepared = false;
    lastInterstitialAt = now;
    try {
      await AdMob.showInterstitial();
      return true;
    } catch {
      return false;
    }
  }

  function setScreen(screenName) {
    currentScreen = screenName;
    if (screenName === "menu" && foreground) void showMenuBanner();
    else void hideBanner();
  }

  function onVisibilityChanged(isVisible) {
    foreground = isVisible === true;
    if (foreground && currentScreen === "menu") void showMenuBanner();
    else if (!foreground) void hideBanner();
  }

  return Object.freeze({
    initializeAtLaunch,
    onCampaignLevelCompleted,
    showInterstitialAtTransition,
    showPrivacyOptions,
    setScreen,
    onVisibilityChanged,
  });
})();

Object.defineProperty(window, "BombDefuseAdMobService", {
  configurable: false,
  enumerable: false,
  value: AdMobService,
  writable: false,
});
