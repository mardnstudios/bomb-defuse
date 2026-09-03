/* Bomb Defuse — core loop plus permanent economy, Daily Challenge, and Achievements system.
 * Independent managers keep state modular, deterministic, and easily verifiable. */

const GameConfig = {
  wireColors: ["red", "blue", "green", "yellow", "purple", "orange"],
  stages: [
    { from: 1, wires: [3, 4], time: 10, rules: ["color"] }, { from: 3, wires: [4, 4], time: 9.5, rules: ["color", "position"] },
    { from: 6, wires: [4, 5], time: 9, rules: ["color", "position", "length"] }, { from: 10, wires: [5, 5], time: 8.5, rules: ["position", "length", "relation"] },
    { from: 15, wires: [5, 6], time: 8, rules: ["length", "relation", "combination"] }, { from: 21, wires: [5, 6], time: 7.5, rules: ["relation", "combination", "memory"] },
  ],
  score: { color: 100, position: 125, length: 150, relation: 200, combination: 250, memory: 300, master: 400 },
  speedBonusPerSecond: 10, comboBonusCap: 80,
  daily: {
    epochDate: "2026-08-01",
    bombCount: 7,
    baseReward: 100,
    maxReward: 200,
    timeBonusCap: 50,
    scoreBonusCap: 50,
    perfectBonus: 50,
    stages: [
      { bombNumber: 1, wires: [4, 5], time: 8.0, ruleType: "color", title: "COLOR TEST" },
      { bombNumber: 2, wires: [5, 5], time: 7.5, ruleType: "position", title: "POSITION TEST" },
      { bombNumber: 3, wires: [5, 6], time: 7.0, ruleType: "length", title: "LENGTH TEST" },
      { bombNumber: 4, wires: [6, 6], time: 6.5, ruleType: "relation", title: "RELATION TEST" },
      { bombNumber: 5, wires: [6, 7], time: 6.0, ruleType: "combination", title: "COMBINATION TEST" },
      { bombNumber: 6, wires: [7, 7], time: 5.5, ruleType: "memory", title: "MEMORY TEST" },
      { bombNumber: 7, wires: [7, 8], time: 5.0, ruleType: "master", title: "MASTER TEST" },
    ],
  },
};

const WIRE_COLOR_MAP = {
  red: "#ff4757",
  blue: "#3a86ff",
  green: "#2ed573",
  yellow: "#ffa502",
  purple: "#9b59b6",
  orange: "#ff7f50"
};

const UpgradeDefinitions = {
  timeBuffer: { name: "TIME BUFFER", icon: "◷", description: "Adds a little breathing room to every fuse.", effect: level => `+${(level * .25).toFixed(2)}s starting time`, prices: [100, 250, 500, 900, 1500] },
  coinBoost: { name: "COIN BOOST", icon: "◆", description: "Increases coins earned from every defuse.", effect: level => `+${level * 5}% coin rewards`, prices: [100, 250, 500, 900, 1500] },
  speedBonus: { name: "SPEED BONUS", icon: "↯", description: "Slightly improves score for fast decisions.", effect: level => `+${level * 5}% speed score`, prices: [125, 300, 600, 1000, 1600] },
  streakBonus: { name: "STREAK BONUS", icon: "🔥", description: "Adds coins at streak reward milestones.", effect: level => `+${level} bonus coin at milestones`, prices: [150, 350, 700, 1100, 1750] },
  emergencyShield: { name: "EMERGENCY SHIELD", icon: "⬡", description: "A one-time chance to survive a wrong cut each run.", effect: level => `${level * 4}% shield chance`, prices: [200, 450, 850, 1350, 2000] },
};

const PowerDefinitions = {
  scanner: { name: "SCANNER", icon: "🔍", description: "Temporarily highlights 1 incorrect wire for 1.5 seconds.", effect: "Highlights 1 wrong wire (1.5s)", price: 25 },
  timeFreeze: { name: "TIME FREEZE", icon: "❄", description: "Freezes the fuse timer countdown for 3 seconds.", effect: "Freezes countdown for 3s", price: 35 },
  secondChance: { name: "SECOND CHANCE", icon: "🛡", description: "Absorbs 1 wrong wire cut on the active bomb.", effect: "Protects against 1 wrong cut", price: 50 },
};

const AchievementDefinitions = {
  // GAMEPLAY
  first_blood: { id: "first_blood", name: "FIRST BLOOD", description: "Defuse your first bomb.", icon: "✂", category: "GAMEPLAY", target: 1, reward: 25, hidden: false, progressType: "count" },
  professional: { id: "professional", name: "PROFESSIONAL", description: "Defuse 25 bombs.", icon: "💣", category: "GAMEPLAY", target: 25, reward: 50, hidden: false, progressType: "count" },
  bomb_squad: { id: "bomb_squad", name: "BOMB SQUAD", description: "Defuse 100 bombs.", icon: "🎖", category: "GAMEPLAY", target: 100, reward: 100, hidden: false, progressType: "count" },
  machine: { id: "machine", name: "MACHINE", description: "Defuse 250 bombs.", icon: "⚙", category: "GAMEPLAY", target: 250, reward: 200, hidden: false, progressType: "count" },

  // SPEED
  quick_hands: { id: "quick_hands", name: "QUICK HANDS", description: "Defuse a bomb with at least 5.0 seconds remaining.", icon: "⚡", category: "SPEED", target: 1, reward: 30, hidden: false, progressType: "count" },
  lightning: { id: "lightning", name: "LIGHTNING", description: "Defuse 10 bombs with at least 5.0 seconds remaining.", icon: "↯", category: "SPEED", target: 10, reward: 75, hidden: false, progressType: "count" },
  too_close: { id: "too_close", name: "TOO CLOSE", description: "Defuse a bomb with less than 0.5 seconds remaining.", icon: "⏱", category: "SPEED", target: 1, reward: 50, hidden: false, progressType: "count" },
  speed_demon: { id: "speed_demon", name: "SPEED DEMON", description: "Defuse 25 bombs quickly (>= 4.0s remaining).", icon: "🔥", category: "SPEED", target: 25, reward: 150, hidden: false, progressType: "count" },

  // STREAK
  on_fire: { id: "on_fire", name: "ON FIRE", description: "Reach a 10 bomb streak.", icon: "🔥", category: "STREAK", target: 10, reward: 50, hidden: false, progressType: "streak" },
  unstoppable: { id: "unstoppable", name: "UNSTOPPABLE", description: "Reach a 25 bomb streak.", icon: "💥", category: "STREAK", target: 25, reward: 100, hidden: false, progressType: "streak" },
  legend: { id: "legend", name: "LEGEND", description: "Reach a 50 bomb streak.", icon: "👑", category: "STREAK", target: 50, reward: 250, hidden: false, progressType: "streak" },
  perfect_run: { id: "perfect_run", name: "PERFECT RUN", description: "Defuse 10 bombs in a row without using a power or shield.", icon: "🛡", category: "STREAK", target: 10, reward: 150, hidden: false, progressType: "count" },

  // MASTERY
  rule_master: { id: "rule_master", name: "RULE MASTER", description: "Successfully solve all 6 rule categories.", icon: "🧠", category: "MASTERY", target: 6, reward: 100, hidden: false, progressType: "unique" },
  logic_machine: { id: "logic_machine", name: "LOGIC MACHINE", description: "Successfully solve 25 non-color rules.", icon: "🧩", category: "MASTERY", target: 25, reward: 100, hidden: false, progressType: "count" },
  master_defuser: { id: "master_defuser", name: "MASTER DEFUSER", description: "Successfully defuse 10 difficult-rule bombs.", icon: "🏆", category: "MASTERY", target: 10, reward: 150, hidden: false, progressType: "count" },

  // ECONOMY
  saver: { id: "saver", name: "SAVER", description: "Accumulate 500 coins.", icon: "💰", category: "ECONOMY", target: 500, reward: 50, hidden: false, progressType: "coins" },
  big_spender: { id: "big_spender", name: "BIG SPENDER", description: "Spend 1,000 lifetime coins.", icon: "💎", category: "ECONOMY", target: 1000, reward: 100, hidden: false, progressType: "count" },
  investor: { id: "investor", name: "INVESTOR", description: "Purchase 10 upgrades.", icon: "📈", category: "ECONOMY", target: 10, reward: 100, hidden: false, progressType: "count" },

  // POWERS
  emergency: { id: "emergency", name: "EMERGENCY!", description: "Successfully survive using Second Chance.", icon: "🛡", category: "POWERS", target: 1, reward: 50, hidden: false, progressType: "count" },
  tactician: { id: "tactician", name: "TACTICIAN", description: "Use each active power at least once.", icon: "🎯", category: "POWERS", target: 3, reward: 100, hidden: false, progressType: "unique" },

  // HIDDEN SECRETS
  last_millisecond: { id: "last_millisecond", name: "LAST MILLISECOND", description: "Defuse a bomb with less than 0.1 seconds remaining.", icon: "⏳", category: "SPEED", target: 1, reward: 100, hidden: true, progressType: "count" },
  no_help: { id: "no_help", name: "NO HELP", description: "Complete 25 bombs without activating any power.", icon: "🚫", category: "MASTERY", target: 25, reward: 150, hidden: true, progressType: "count" },
  master_of_daily: { id: "master_of_daily", name: "MASTER OF THE DAILY", description: "Complete a Daily Challenge with all 7 bombs defused.", icon: "🌟", category: "DAILY", target: 1, reward: 150, hidden: true, progressType: "count" },
};

const screens = Object.fromEntries([
  "menu", "game", "pause", "result", "daily-result", "achievements", "shop", "reset", "tutorial", "stats", "daily-goals", "login-reward",
  "login", "register", "forgot-password", "profile", "avatar-picker", "account-settings", "delete-account", "logout-confirm", "sync-conflict"
].map(name => [name, document.getElementById(`screen-${name}`)]));

const el = {
  menuBestScore: byId("menu-best-score"), menuBestStreak: byId("menu-best-streak"), menuCoins: byId("menu-coins"), shopCoins: byId("shop-coins"), hudCoins: byId("hud-coins"),
  hudScore: byId("hud-score"), hudBest: byId("hud-best"), hudBombLabel: byId("hud-bomb-label"), hudStreak: byId("hud-streak"),
  timerValue: byId("timer-value"), timerBarFill: byId("timer-bar-fill"), timerWrap: document.querySelector(".timer-wrap"), instruction: byId("instruction"), bomb: byId("bomb"), bombScreenText: byId("bomb-screen-text"), wiresContainer: byId("wires-container"),
  particleLayer: byId("particle-layer"), feedbackLayer: byId("feedback-layer"), flashOverlay: byId("flash-overlay"),
  resultTitle: byId("result-title"), resultMessage: byId("result-message"), resultScore: byId("result-score"), resultBest: byId("result-best"), resultBombs: byId("result-bombs"), resultStreak: byId("result-streak"), resultCoinsEarned: byId("result-coins-earned"), resultCurrentCoins: byId("result-current-coins"),
  resultComparisonBox: byId("result-comparison-box"), resultComparisonText: byId("result-comparison-text"),
  btnShareResult: byId("btn-share-result"), btnResultShop: byId("btn-result-shop"),
  upgradeList: byId("upgrade-list"), powerList: byId("power-list"), progressToast: byId("progress-toast"),
  btnSoundMenu: byId("btn-sound-menu"), btnSoundPause: byId("btn-sound-pause"), powerBar: byId("power-bar"),
  // Daily challenge elements
  dailyCard: byId("daily-card"), dailyDayLabel: byId("daily-day-label"), dailyStatusIndicator: byId("daily-status-indicator"), dailyStatusText: byId("daily-status-text"), dailyThemeText: byId("daily-theme-text"), btnDailyPlay: byId("btn-daily-play"),
  dailyHudBanner: byId("daily-hud-banner"), dailyHudDay: byId("daily-hud-day"), dailyProgressTracker: byId("daily-progress-tracker"), dailyHudStep: byId("daily-hud-step"),
  dailyResultTitle: byId("daily-result-title"), dailyResultIcon: byId("daily-result-icon"), dailyResultMessage: byId("daily-result-message"), dailyResultScore: byId("daily-result-score"), dailyResultBest: byId("daily-result-best"), dailyResultBombs: byId("daily-result-bombs"), dailyResultTimeBonus: byId("daily-result-time-bonus"), dailyResultReward: byId("daily-result-reward"), dailyRewardBreakdown: byId("daily-reward-breakdown"),
  btnDailyPlayNormal: byId("btn-daily-play-normal"), btnDailyShare: byId("btn-daily-share"), btnDailyMenu: byId("btn-daily-menu"),
  // Achievement elements
  menuAchievementsBadge: byId("menu-achievements-badge"),
  btnAchievements: byId("btn-achievements"),
  btnBackAchievements: byId("btn-back-achievements"),
  achTotalCount: byId("ach-total-count"),
  achSummaryFill: byId("ach-summary-fill"),
  achFilterPills: byId("ach-filter-pills"),
  achievementList: byId("achievement-list"),
  achievementToast: byId("achievement-toast"),
  achToastIcon: byId("ach-toast-icon"),
  achToastName: byId("ach-toast-name"),
  achToastDesc: byId("ach-toast-desc"),
  achToastReward: byId("ach-toast-reward"),
  // Tutorial elements
  btnTutorialNext: byId("btn-tutorial-next"),
  btnTutorialSkip: byId("btn-tutorial-skip"),
  tutorialDots: byId("tutorial-dots"),
  btnInstall: byId("btn-install"),
  // Phase 8: Stats elements
  btnStats: byId("btn-stats"),
  btnBackStats: byId("btn-back-stats"),
  statBombsDefused: byId("stat-bombs-defused"),
  statBombsFailed: byId("stat-bombs-failed"),
  statSuccessRate: byId("stat-success-rate"),
  statTotalScore: byId("stat-total-score"),
  statBestStreak: byId("stat-best-streak"),
  statFastestDefuse: byId("stat-fastest-defuse"),
  statRulesMastered: byId("stat-rules-mastered"),
  statDailiesWon: byId("stat-dailies-won"),
  statCoinsEarned: byId("stat-coins-earned"),
  statCoinsSpent: byId("stat-coins-spent"),
  statPowersUsed: byId("stat-powers-used"),
  statUpgradesBought: byId("stat-upgrades-bought"),
  statPlayTime: byId("stat-play-time"),
  // Phase 8: Daily Goals elements
  btnDailyGoals: byId("btn-daily-goals"),
  btnBackDailyGoals: byId("btn-back-daily-goals"),
  menuGoalsBadge: byId("menu-goals-badge"),
  dailyGoalsList: byId("daily-goals-list"),
  // Phase 8: Login Reward elements
  loginDaysGrid: byId("login-days-grid"),
  btnClaimLoginReward: byId("btn-claim-login-reward"),
  btnCloseLoginReward: byId("btn-close-login-reward"),
  // Phase 8 & 10: Player Account & Profile elements
  menuTopBar: document.querySelector(".menu-top-bar"),
  btnMenuAvatar: byId("btn-menu-avatar"),
  menuAccountPopup: byId("menu-account-popup"),
  popupAvatarIcon: byId("popup-avatar-icon"),
  popupDisplayName: byId("popup-display-name"),
  popupEmail: byId("popup-email"),
  popupStatus: byId("popup-status"),
  popupStatusDot: byId("popup-status-dot"),
  popupStatusText: byId("popup-status-text"),
  popupAuthActions: byId("popup-auth-actions"),
  popupGuestActions: byId("popup-guest-actions"),
  btnPopupSettings: byId("btn-popup-settings"),
  btnPopupLogout: byId("btn-popup-logout"),
  btnPopupSignin: byId("btn-popup-signin"),
  menuAvatarIcon: byId("menu-avatar-icon"),
  guestNoticeBanner: byId("guest-notice-banner"),
  // Auth screen elements
  authProvidersContainer: byId("auth-providers-container"),
  btnAuthGoogle: byId("btn-auth-google"),
  btnAuthFacebook: byId("btn-auth-facebook"),
  btnAuthEmail: byId("btn-auth-email"),
  formLoginEmail: byId("form-login-email"),
  loginEmail: byId("login-email"),
  loginPassword: byId("login-password"),
  loginErrorMsg: byId("login-error-msg"),
  btnDoLoginEmail: byId("btn-do-login-email"),
  btnCancelEmailLogin: byId("btn-cancel-email-login"),
  btnLoginGuest: byId("btn-login-guest"),
  btnGotoRegister: byId("btn-goto-register"),
  btnGotoForgot: byId("btn-goto-forgot"),
  btnBackLogin: byId("btn-back-login"),
  formRegister: byId("form-register"),
  registerDisplayName: byId("register-display-name"),
  registerEmail: byId("register-email"),
  registerPassword: byId("register-password"),
  registerConfirmPassword: byId("register-confirm-password"),
  registerErrorMsg: byId("register-error-msg"),
  btnDoRegister: byId("btn-do-register"),
  btnBackToLogin: byId("btn-back-to-login"),
  btnBackRegister: byId("btn-back-register"),
  formForgot: byId("form-forgot"),
  forgotEmail: byId("forgot-email"),
  forgotErrorMsg: byId("forgot-error-msg"),
  btnDoForgot: byId("btn-do-forgot"),
  btnBackForgot: byId("btn-back-forgot"),
  // Profile screen elements
  profileAvatarLarge: byId("profile-avatar-large"),
  btnChangeAvatar: byId("btn-change-avatar"),
  profileDisplayNameVal: byId("profile-display-name-val"),
  btnEditDisplayName: byId("btn-edit-display-name"),
  profileProviderPill: byId("profile-provider-pill"),
  profileCreatedAtVal: byId("profile-created-at-val"),
  profileNetworkVal: byId("profile-network-val"),
  profileStorageVal: byId("profile-storage-val"),
  profileStatDefused: byId("profile-stat-defused"),
  profileStatScore: byId("profile-stat-score"),
  profileStatStreak: byId("profile-stat-streak"),
  profileStatDailies: byId("profile-stat-dailies"),
  btnProfileCreateAccount: byId("btn-profile-create-account"),
  btnProfileSettings: byId("btn-profile-settings"),
  btnBackProfile: byId("btn-back-profile"),
  // Avatar picker elements
  avatarGrid: byId("avatar-grid"),
  btnSaveAvatar: byId("btn-save-avatar"),
  btnCancelAvatar: byId("btn-cancel-avatar"),
  // Account settings elements
  settingsDisplayNameVal: byId("settings-display-name-val"),
  btnSettingsChangeName: byId("btn-settings-change-name"),
  settingsAvatarVal: byId("settings-avatar-val"),
  btnSettingsChangeAvatar: byId("btn-settings-change-avatar"),
  settingsProviderVal: byId("settings-provider-val"),
  settingsCloudBadge: byId("settings-cloud-badge"),
  settingsStatusVal: byId("settings-status-val"),
  btnToggleAnalytics: byId("btn-toggle-analytics"),
  btnToggleAds: byId("btn-toggle-ads"),
  btnSettingsToggleSound: byId("btn-settings-toggle-sound"),
  btnSettingsToggleMotion: byId("btn-settings-toggle-motion"),
  btnExportData: byId("btn-export-data"),
  btnLogout: byId("btn-logout"),
  btnDeleteAccount: byId("btn-delete-account"),
  btnBackSettings: byId("btn-back-settings"),
  // Delete account modal elements
  inputDeleteConfirm: byId("input-delete-confirm"),
  btnConfirmDeleteAccount: byId("btn-confirm-delete-account"),
  btnCancelDeleteAccount: byId("btn-cancel-delete-account"),
  // Logout confirm modal elements
  btnConfirmLogout: byId("btn-confirm-logout"),
  btnCancelLogout: byId("btn-cancel-logout"),
  // Sync conflict modal elements
  conflictLocalScore: byId("conflict-local-score"),
  conflictLocalBombs: byId("conflict-local-bombs"),
  conflictLocalCoins: byId("conflict-local-coins"),
  conflictCloudScore: byId("conflict-cloud-score"),
  conflictCloudBombs: byId("conflict-cloud-bombs"),
  conflictCloudCoins: byId("conflict-cloud-coins"),
  btnChooseLocalSave: byId("btn-choose-local-save"),
  btnChooseCloudSave: byId("btn-choose-cloud-save"),
};

function byId(id) { return document.getElementById(id); }
function nonNegativeInt(value) {
  const number = Number(value);
  return (Number.isFinite(number) && number >= 0) ? Math.min(Math.floor(number), Number.MAX_SAFE_INTEGER) : 0;
}

const HapticsManager = {
  vibrate(pattern) {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator && profile?.soundEnabled) {
        navigator.vibrate(pattern);
      }
    } catch {}
  },
  cutSuccess() { this.vibrate(25); },
  cutFailure() { this.vibrate([60, 40, 80]); },
  dailyReward() { this.vibrate([30, 30, 50]); },
  goalClaim() { this.vibrate([40, 30, 40]); },
  milestone() { this.vibrate([35, 25, 45]); },
  newRecord() { this.vibrate([50, 40, 60, 40, 90]); },
  achievementUnlock() { this.vibrate([40, 30, 70]); },
  profileSaved() { this.vibrate(20); },
  logout() { this.vibrate(35); },
};

function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let s = typeof seed === "string" ? hashString(seed) : (Number(seed) >>> 0 || 1);
  function next() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function nextInt(min, max) {
    return Math.floor(next() * (max - min + 1)) + min;
  }
  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(next() * arr.length)];
  }
  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  return { next, nextInt, pick, shuffle };
}

/* =========================================================
   LOCAL & CLOUD SAVE MANAGERS
========================================================= */
const LocalSaveManager = (() => {
  const key = "bombDefuseFirstPlayable_v1";
  let storageAvailable = true;
  let memoryFallback = null;

  function testStorage() {
    try {
      const probe = "__bd_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  storageAvailable = testStorage();

  function save(data) {
    if (!storageAvailable) {
      memoryFallback = JSON.parse(JSON.stringify(data));
      return true;
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn("[Save] Local storage write failed:", err);
      memoryFallback = JSON.parse(JSON.stringify(data));
      return false;
    }
  }

  function load() {
    if (!storageAvailable) {
      return memoryFallback;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function reset() {
    if (storageAvailable) {
      try { localStorage.removeItem(key); } catch {}
    }
    memoryFallback = null;
  }

  return { save, load, reset, isAvailable: () => storageAvailable };
})();

const CloudSaveManager = (() => {
  let isConnected = typeof navigator !== "undefined" ? navigator.onLine : true;
  let _hasCloudSave = false;
  let activeConflictResolution = null;

  function initialize() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => { isConnected = true; updateNetworkBadge(); });
      window.addEventListener("offline", () => { isConnected = false; updateNetworkBadge(); });
    }
  }

  function hasCloudSave() {
    return _hasCloudSave || Boolean(AuthManager?.isAuthenticated?.());
  }

  function setHasCloudSave(val) {
    _hasCloudSave = Boolean(val);
  }

  function createSnapshot(data) {
    return JSON.parse(JSON.stringify(data || profile));
  }

  function detectConflict(localData, cloudData) {
    if (!localData || !cloudData) return { hasConflict: false };
    const localScore = localData.bestScore || localData.stats?.bestScore || 0;
    const cloudScore = cloudData.bestScore || cloudData.stats?.bestScore || 0;
    const localBombs = localData.stats?.totalBombsDefused || 0;
    const cloudBombs = cloudData.stats?.totalBombsDefused || 0;
    const localCoins = localData.coins || 0;
    const cloudCoins = cloudData.coins || 0;

    const variance = (localScore !== cloudScore) || (localBombs !== cloudBombs) || (Math.abs(localCoins - cloudCoins) > 10);
    return {
      hasConflict: variance,
      localStats: { score: localScore, bombs: localBombs, coins: localCoins },
      cloudStats: { score: cloudScore, bombs: cloudBombs, coins: cloudCoins },
    };
  }

  function showConflictModal(localData, cloudData, onResolved) {
    activeConflictResolution = { localData, cloudData, onResolved };
    const conflict = detectConflict(localData, cloudData);

    if (el.conflictLocalScore) el.conflictLocalScore.textContent = conflict.localStats.score.toLocaleString();
    if (el.conflictLocalBombs) el.conflictLocalBombs.textContent = conflict.localStats.bombs.toLocaleString();
    if (el.conflictLocalCoins) el.conflictLocalCoins.textContent = conflict.localStats.coins.toLocaleString();

    if (el.conflictCloudScore) el.conflictCloudScore.textContent = conflict.cloudStats.score.toLocaleString();
    if (el.conflictCloudBombs) el.conflictCloudBombs.textContent = conflict.cloudStats.bombs.toLocaleString();
    if (el.conflictCloudCoins) el.conflictCloudCoins.textContent = conflict.cloudStats.coins.toLocaleString();

    showScreen("sync-conflict");
  }

  function mergeSaves(local, cloud) {
    const base = SaveManager.defaults();
    const l = SaveManager.normalize(local);
    const c = SaveManager.normalize(cloud);

    base.version = 3;
    base.tutorialCompleted = l.tutorialCompleted || c.tutorialCompleted;
    base.coins = Math.max(l.coins, c.coins);
    base.bestScore = Math.max(l.bestScore, c.bestScore);
    base.bestStreak = Math.max(l.bestStreak, c.bestStreak);
    base.bestDailyScore = Math.max(l.bestDailyScore, c.bestDailyScore);
    base.soundEnabled = l.soundEnabled !== undefined ? l.soundEnabled : (c.soundEnabled !== undefined ? c.soundEnabled : true);

    // Upgrades: max levels
    Object.keys(base.upgrades).forEach(id => {
      base.upgrades[id] = Math.max(l.upgrades[id] || 0, c.upgrades[id] || 0);
    });

    // Powers: max inventory
    Object.keys(base.powers).forEach(id => {
      base.powers[id] = Math.max(l.powers[id] || 0, c.powers[id] || 0);
    });

    // Stats: merge maximums and sums
    const ls = l.stats;
    const cs = c.stats;
    base.stats.totalBombsDefused = Math.max(ls.totalBombsDefused, cs.totalBombsDefused);
    base.stats.totalBombsFailed = Math.max(ls.totalBombsFailed, cs.totalBombsFailed);
    base.stats.totalAttempts = Math.max(ls.totalAttempts, cs.totalAttempts, base.stats.totalBombsDefused + base.stats.totalBombsFailed);
    base.stats.totalScore = Math.max(ls.totalScore, cs.totalScore);
    base.stats.bestScore = Math.max(base.bestScore, ls.bestScore, cs.bestScore);
    base.stats.bestStreak = Math.max(base.bestStreak, ls.bestStreak, cs.bestStreak);
    base.stats.totalCoinsEarned = Math.max(base.coins, ls.totalCoinsEarned, cs.totalCoinsEarned);
    base.stats.totalCoinsSpent = Math.max(ls.totalCoinsSpent, cs.totalCoinsSpent);
    base.stats.totalPowersUsed = Math.max(ls.totalPowersUsed, cs.totalPowersUsed);
    base.stats.totalUpgradesPurchased = Math.max(ls.totalUpgradesPurchased, cs.totalUpgradesPurchased);
    base.stats.totalDailyChallengesCompleted = Math.max(ls.totalDailyChallengesCompleted, cs.totalDailyChallengesCompleted);
    base.stats.perfectDailyChallenges = Math.max(ls.perfectDailyChallenges, cs.perfectDailyChallenges);
    base.stats.totalPlayTimeSeconds = Math.max(ls.totalPlayTimeSeconds, cs.totalPlayTimeSeconds);
    const lFast = (ls.fastestDefuseSeconds && ls.fastestDefuseSeconds > 0) ? ls.fastestDefuseSeconds : 999;
    const cFast = (cs.fastestDefuseSeconds && cs.fastestDefuseSeconds > 0) ? cs.fastestDefuseSeconds : 999;
    base.stats.fastestDefuseSeconds = Math.min(lFast, cFast);
    base.stats.rulesMastered = Array.from(new Set([...(ls.rulesMastered || []), ...(cs.rulesMastered || [])]));

    // Personal Bests
    const lpb = l.personalBests || {};
    const cpb = c.personalBests || {};
    base.personalBests.bestScore = Math.max(base.bestScore, lpb.bestScore || 0, cpb.bestScore || 0);
    base.personalBests.bestStreak = Math.max(base.bestStreak, lpb.bestStreak || 0, cpb.bestStreak || 0);
    base.personalBests.mostBombsRun = Math.max(lpb.mostBombsRun || 0, cpb.mostBombsRun || 0);
    const lpbFast = (lpb.fastestDefuse && lpb.fastestDefuse > 0) ? lpb.fastestDefuse : 0;
    const cpbFast = (cpb.fastestDefuse && cpb.fastestDefuse > 0) ? cpb.fastestDefuse : 0;
    base.personalBests.fastestDefuse = (lpbFast > 0 && cpbFast > 0) ? Math.min(lpbFast, cpbFast) : (lpbFast || cpbFast || 0);
    base.personalBests.bestDailyScore = Math.max(base.bestDailyScore, lpb.bestDailyScore || 0, cpb.bestDailyScore || 0);
    base.personalBests.mostCoinsRun = Math.max(lpb.mostCoinsRun || 0, cpb.mostCoinsRun || 0);

    // Daily Challenge
    const ld = l.daily || {};
    const cd = c.daily || {};
    if (ld.date && cd.date && ld.date === cd.date) {
      base.daily.date = ld.date;
      base.daily.bombsCompleted = Math.max(ld.bombsCompleted || 0, cd.bombsCompleted || 0);
      base.daily.score = Math.max(ld.score || 0, cd.score || 0);
      base.daily.rewardClaimed = Boolean(ld.rewardClaimed || cd.rewardClaimed);
      base.daily.status = (ld.status === "COMPLETED" || cd.status === "COMPLETED") ? "COMPLETED" : (base.daily.bombsCompleted > 0 ? "IN_PROGRESS" : (ld.status || cd.status || "NONE"));
    } else if (cd.date && (!ld.date || cd.date >= ld.date)) {
      base.daily = Object.assign({}, cd);
    } else {
      base.daily = Object.assign({}, ld);
    }

    // Daily Goals
    const ldg = l.dailyGoals || {};
    const cdg = c.dailyGoals || {};
    if (ldg.date && cdg.date && ldg.date === cdg.date && Array.isArray(ldg.goals) && Array.isArray(cdg.goals)) {
      base.dailyGoals.date = ldg.date;
      base.dailyGoals.goals = ldg.goals.map(lg => {
        const cg = cdg.goals.find(g => g.id === lg.id) || {};
        return {
          id: lg.id,
          text: lg.text || cg.text || "",
          target: lg.target || cg.target || 1,
          progress: Math.max(lg.progress || 0, cg.progress || 0),
          reward: lg.reward || cg.reward || 50,
          type: lg.type || cg.type || "defuse",
          claimed: Boolean(lg.claimed || cg.claimed),
        };
      });
    } else if (cdg.date && (!ldg.date || cdg.date >= ldg.date)) {
      base.dailyGoals = Object.assign({}, cdg);
    } else {
      base.dailyGoals = Object.assign({}, ldg);
    }

    // Login Reward
    const llr = l.loginReward || {};
    const clr = c.loginReward || {};
    base.loginReward.streakDay = Math.max(llr.streakDay || 0, clr.streakDay || 0);
    base.loginReward.lastClaimDate = (llr.lastClaimDate >= clr.lastClaimDate) ? (llr.lastClaimDate || clr.lastClaimDate || "") : (clr.lastClaimDate || llr.lastClaimDate || "");

    // Achievements: union of unlocked
    const allUnlocked = Array.from(new Set([...(l.achievements?.unlocked || []), ...(c.achievements?.unlocked || [])]));
    base.achievements.unlocked = allUnlocked;
    base.achievements.unlockedDates = Object.assign({}, c.achievements?.unlockedDates || {}, l.achievements?.unlockedDates || {});
    base.achievements.progress = {};
    Object.keys(AchievementDefinitions).forEach(id => {
      base.achievements.progress[id] = Math.max(l.achievements?.progress?.[id] || 0, c.achievements?.progress?.[id] || 0);
    });

    // Achievement Stats
    const las = l.achievements?.stats || {};
    const cas = c.achievements?.stats || {};
    const as = base.achievements.stats;
    as.totalBombsDefused = Math.max(las.totalBombsDefused || 0, cas.totalBombsDefused || 0, base.stats.totalBombsDefused);
    as.fastDefuses = Math.max(las.fastDefuses || 0, cas.fastDefuses || 0);
    as.closeCalls = Math.max(las.closeCalls || 0, cas.closeCalls || 0);
    as.lastMillisecondCalls = Math.max(las.lastMillisecondCalls || 0, cas.lastMillisecondCalls || 0);
    as.speedDemonCount = Math.max(las.speedDemonCount || 0, cas.speedDemonCount || 0);
    as.streakBest = Math.max(base.bestStreak, las.streakBest || 0, cas.streakBest || 0);
    as.noPowerStreak = Math.max(las.noPowerStreak || 0, cas.noPowerStreak || 0);
    as.noPowerTotal = Math.max(las.noPowerTotal || 0, cas.noPowerTotal || 0);
    as.coinsSpent = Math.max(las.coinsSpent || 0, cas.coinsSpent || 0, base.stats.totalCoinsSpent);
    as.upgradesPurchased = Math.max(las.upgradesPurchased || 0, cas.upgradesPurchased || 0, base.stats.totalUpgradesPurchased);
    as.powersUsedCount = Math.max(las.powersUsedCount || 0, cas.powersUsedCount || 0, base.stats.totalPowersUsed);
    as.secondChanceSurvivals = Math.max(las.secondChanceSurvivals || 0, cas.secondChanceSurvivals || 0);
    as.ruleTypesSolved = Array.from(new Set([...(las.ruleTypesSolved || []), ...(cas.ruleTypesSolved || []), ...base.stats.rulesMastered]));
    as.nonColorRulesSolved = Math.max(las.nonColorRulesSolved || 0, cas.nonColorRulesSolved || 0);
    as.difficultRulesSolved = Math.max(las.difficultRulesSolved || 0, cas.difficultRulesSolved || 0);
    as.powersUsedTypes = Array.from(new Set([...(las.powersUsedTypes || []), ...(cas.powersUsedTypes || [])]));
    as.dailyChallengesCompleted = Math.max(las.dailyChallengesCompleted || 0, cas.dailyChallengesCompleted || 0, base.stats.totalDailyChallengesCompleted);
    as.highestCoinBalance = Math.max(base.coins, las.highestCoinBalance || 0, cas.highestCoinBalance || 0);
    base.stats.achievementsUnlocked = Math.max(ls.achievementsUnlocked, cs.achievementsUnlocked, allUnlocked.length);

    // Account: preserve authenticated cloud account identity
    base.account = c.account.mode === "registered" ? c.account : l.account;

    // Consent: preserve user preferences
    base.consent = l.consent;
    base.privacy = l.privacy;

    return base;
  }

  function resolveConflict(choice) {
    if (!activeConflictResolution) return;
    const { localData, cloudData, onResolved } = activeConflictResolution;
    let chosenSave;
    if (choice === "cloud") {
      chosenSave = SaveManager.normalize(cloudData);
    } else if (choice === "merge") {
      chosenSave = mergeSaves(localData, cloudData);
    } else {
      chosenSave = SaveManager.normalize(localData);
    }

    profile = chosenSave;
    SaveManager.save(profile, true);
    activeConflictResolution = null;
    refreshPersistentUI();
    updateMenuAccountBadge();
    if (typeof onResolved === "function") {
      onResolved(chosenSave);
    }
  }

  async function uploadSave(saveData) {
    if (!AuthManager?.isAuthenticated?.()) {
      return { status: "GUEST_LOCAL_ONLY", message: "Guest progress is saved on this device." };
    }
    if (!isConnected) {
      return { status: "OFFLINE", message: "Offline. Local save will synchronize when online." };
    }
    const user = typeof FirebaseManager !== "undefined" ? FirebaseManager.getCurrentUser() : null;
    if (!user || !user.uid) {
      return { status: "NO_AUTH_USER", message: "No authenticated account session." };
    }
    const db = typeof FirebaseManager !== "undefined" && typeof FirebaseManager.getDb === "function" ? FirebaseManager.getDb() : (typeof window !== "undefined" && window.firebase && typeof window.firebase.firestore === "function" ? window.firebase.firestore() : null);
    if (!db) {
      return { status: "UNAVAILABLE", message: "Firestore database service is unavailable." };
    }
    try {
      const payload = createSnapshot(saveData || profile);
      if (payload.account) {
        delete payload.account.password;
        delete payload.account.token;
      }
      payload.updatedAt = new Date().toISOString();
      await db.collection("users").doc(user.uid).set(payload, { merge: true });
      _hasCloudSave = true;
      return { status: "SUCCESS", message: "Cloud save synchronized." };
    } catch (err) {
      console.warn("[CloudSaveManager] uploadSave error:", err);
      return { status: "ERROR", message: err.message || "Failed to upload cloud save." };
    }
  }

  async function downloadSave() {
    if (!AuthManager?.isAuthenticated?.()) {
      return { status: "GUEST_LOCAL_ONLY" };
    }
    const user = typeof FirebaseManager !== "undefined" ? FirebaseManager.getCurrentUser() : null;
    if (!user || !user.uid) {
      return { status: "NO_AUTH_USER" };
    }
    const db = typeof FirebaseManager !== "undefined" && typeof FirebaseManager.getDb === "function" ? FirebaseManager.getDb() : (typeof window !== "undefined" && window.firebase && typeof window.firebase.firestore === "function" ? window.firebase.firestore() : null);
    if (!db) {
      return { status: "UNAVAILABLE" };
    }
    try {
      const doc = await db.collection("users").doc(user.uid).get();
      if (doc && doc.exists) {
        const cloudData = doc.data();
        _hasCloudSave = true;
        return { status: "SUCCESS", data: cloudData };
      }
      return { status: "NO_CLOUD_SAVE" };
    } catch (err) {
      console.warn("[CloudSaveManager] downloadSave error:", err);
      return { status: "ERROR", message: err.message };
    }
  }

  async function sync() {
    if (!AuthManager?.isAuthenticated?.() || !isConnected) {
      return { status: "LOCAL_SOURCE_OF_TRUTH" };
    }
    try {
      const res = await downloadSave();
      if (res.status === "SUCCESS" && res.data) {
        const cloudData = res.data;
        _hasCloudSave = true;
        profile = mergeSaves(profile, cloudData);
        LocalSaveManager.save(profile);
        await uploadSave(profile);
        refreshPersistentUI();
        updateMenuAccountBadge();
        DailyGoalsManager.updateBadge();
        AchievementUI.updateBadge();
        return { status: "MERGED" };
      } else if (res.status === "NO_CLOUD_SAVE") {
        await uploadSave(profile);
        _hasCloudSave = true;
        return { status: "FIRST_UPLOAD_SUCCESS" };
      }
      return { status: "LOCAL_SOURCE_OF_TRUTH" };
    } catch (e) {
      console.warn("[CloudSaveManager] sync error:", e);
      return { status: "ERROR", message: e.message };
    }
  }

  return {
    initialize,
    hasCloudSave,
    setHasCloudSave,
    createSnapshot,
    detectConflict,
    showConflictModal,
    mergeSaves,
    resolveConflict,
    uploadSave,
    downloadSave,
    sync,
    get isConnected() { return isConnected; }
  };
})();

const SaveManager = (() => {
  const defaults = () => ({
    version: 3,
    account: {
      mode: "guest",
      provider: "guest",
      userId: "guest_" + Math.random().toString(36).slice(2, 9),
      displayName: "Guest",
      avatar: "bomb",
      createdAt: new Date().toISOString().slice(0, 10),
      email: "",
    },
    tutorialCompleted: false,
    coins: 0,
    bestScore: 0,
    bestStreak: 0,
    bestDailyScore: 0,
    soundEnabled: true,
    upgrades: Object.fromEntries(Object.keys(UpgradeDefinitions).map(id => [id, 0])),
    powers: Object.fromEntries(Object.keys(PowerDefinitions).map(id => [id, 0])),
    daily: {
      date: "",
      status: "NONE",
      score: 0,
      bombsCompleted: 0,
      rewardClaimed: false,
    },
    stats: {
      totalBombsDefused: 0,
      totalBombsFailed: 0,
      totalAttempts: 0,
      totalScore: 0,
      bestScore: 0,
      bestStreak: 0,
      totalCoinsEarned: 0,
      totalCoinsSpent: 0,
      totalPowersUsed: 0,
      totalUpgradesPurchased: 0,
      totalDailyChallengesCompleted: 0,
      perfectDailyChallenges: 0,
      totalPlayTimeSeconds: 0,
      fastestDefuseSeconds: 999,
      rulesMastered: [],
      achievementsUnlocked: 0,
    },
    loginReward: {
      lastClaimDate: "",
      streakDay: 0,
    },
    dailyGoals: {
      date: "",
      goals: [],
    },
    personalBests: {
      bestScore: 0,
      bestStreak: 0,
      mostBombsRun: 0,
      fastestDefuse: 0,
      bestDailyScore: 0,
      mostCoinsRun: 0,
    },
    sessionMilestones: {},
    privacy: {
      analytics: false,
      personalizedAds: false,
    },
    consent: {
      essential: true,
      analytics: false,
      personalizedAds: false,
    },
    achievements: {
      unlocked: [],
      unlockedDates: {},
      progress: {},
      stats: {
        totalBombsDefused: 0,
        fastDefuses: 0,
        closeCalls: 0,
        lastMillisecondCalls: 0,
        speedDemonCount: 0,
        streakBest: 0,
        noPowerStreak: 0,
        noPowerTotal: 0,
        coinsSpent: 0,
        upgradesPurchased: 0,
        powersUsedCount: 0,
        secondChanceSurvivals: 0,
        ruleTypesSolved: [],
        nonColorRulesSolved: 0,
        difficultRulesSolved: 0,
        powersUsedTypes: [],
        dailyChallengesCompleted: 0,
        highestCoinBalance: 0,
      },
    },
  });

  function normalize(raw) {
    const base = defaults();
    const incoming = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
    
    base.version = 3;

    // Account normalization
    const accIn = (incoming.account && typeof incoming.account === "object" && !Array.isArray(incoming.account)) ? incoming.account : {};
    const validAvatars = ["bomb", "defuser", "shield", "lightning", "circuit", "skull", "robot"];
    let rawDisplayName = typeof accIn.displayName === "string" ? accIn.displayName.replace(/<[^>]*>/g, "").trim().slice(0, 20) : "";
    if (!rawDisplayName || rawDisplayName.length < 3) {
      rawDisplayName = "Guest";
    }
    base.account = {
      mode: accIn.mode === "registered" ? "registered" : "guest",
      provider: typeof accIn.provider === "string" ? accIn.provider : "guest",
      userId: typeof accIn.userId === "string" && accIn.userId ? accIn.userId : base.account.userId,
      displayName: rawDisplayName,
      avatar: validAvatars.includes(accIn.avatar) ? accIn.avatar : "bomb",
      createdAt: typeof accIn.createdAt === "string" && accIn.createdAt ? accIn.createdAt : base.account.createdAt,
      email: typeof accIn.email === "string" ? accIn.email : "",
    };

    base.tutorialCompleted = Boolean(incoming.tutorialCompleted);
    base.coins = nonNegativeInt(incoming.coins);
    base.bestScore = nonNegativeInt(incoming.bestScore);
    base.bestStreak = nonNegativeInt(incoming.bestStreak);
    base.bestDailyScore = nonNegativeInt(incoming.bestDailyScore);
    base.soundEnabled = incoming.soundEnabled !== undefined ? Boolean(incoming.soundEnabled) : true;
    
    Object.keys(base.upgrades).forEach(id => {
      const maxLvl = UpgradeDefinitions[id]?.prices?.length || 5;
      base.upgrades[id] = Math.min(maxLvl, nonNegativeInt(incoming.upgrades?.[id]));
    });
    
    base.powers = {};
    Object.keys(PowerDefinitions).forEach(id => {
      base.powers[id] = nonNegativeInt(incoming.powers?.[id]);
    });
    
    const incomingDaily = (incoming.daily && typeof incoming.daily === "object" && !Array.isArray(incoming.daily)) ? incoming.daily : {};
    const validStatuses = ["NONE", "IN_PROGRESS", "COMPLETED", "FAILED"];
    base.daily = {
      date: typeof incomingDaily.date === "string" ? incomingDaily.date : "",
      status: validStatuses.includes(incomingDaily.status) ? incomingDaily.status : "NONE",
      score: nonNegativeInt(incomingDaily.score),
      bombsCompleted: Math.min(GameConfig.daily?.bombCount || 7, nonNegativeInt(incomingDaily.bombsCompleted)),
      rewardClaimed: Boolean(incomingDaily.rewardClaimed),
    };

    const incomingStats = (incoming.stats && typeof incoming.stats === "object" && !Array.isArray(incoming.stats)) ? incoming.stats : {};
    const achStatsIn = (incoming.achievements && typeof incoming.achievements.stats === "object" && !Array.isArray(incoming.achievements.stats)) ? incoming.achievements.stats : {};
    const s = base.stats;
    s.totalBombsDefused = nonNegativeInt(incomingStats.totalBombsDefused || achStatsIn.totalBombsDefused);
    s.totalBombsFailed = nonNegativeInt(incomingStats.totalBombsFailed);
    s.totalAttempts = nonNegativeInt(incomingStats.totalAttempts || (s.totalBombsDefused + s.totalBombsFailed));
    s.totalScore = nonNegativeInt(incomingStats.totalScore);
    s.bestScore = Math.max(base.bestScore, nonNegativeInt(incomingStats.bestScore));
    s.bestStreak = Math.max(base.bestStreak, nonNegativeInt(incomingStats.bestStreak));
    s.totalCoinsEarned = Math.max(base.coins, nonNegativeInt(incomingStats.totalCoinsEarned));
    s.totalCoinsSpent = nonNegativeInt(incomingStats.totalCoinsSpent || achStatsIn.coinsSpent);
    s.totalPowersUsed = nonNegativeInt(incomingStats.totalPowersUsed || achStatsIn.powersUsedCount);
    s.totalUpgradesPurchased = nonNegativeInt(incomingStats.totalUpgradesPurchased || achStatsIn.upgradesPurchased);
    s.totalDailyChallengesCompleted = nonNegativeInt(incomingStats.totalDailyChallengesCompleted || achStatsIn.dailyChallengesCompleted);
    s.perfectDailyChallenges = nonNegativeInt(incomingStats.perfectDailyChallenges);
    s.totalPlayTimeSeconds = nonNegativeInt(incomingStats.totalPlayTimeSeconds);
    const fastest = Number(incomingStats.fastestDefuseSeconds);
    s.fastestDefuseSeconds = (Number.isFinite(fastest) && fastest > 0) ? fastest : 999;
    const rules = incomingStats.rulesMastered || achStatsIn.ruleTypesSolved || [];
    s.rulesMastered = Array.isArray(rules) ? rules.filter(r => typeof r === "string") : [];
    s.achievementsUnlocked = nonNegativeInt(incomingStats.achievementsUnlocked);

    const incomingLogin = (incoming.loginReward && typeof incoming.loginReward === "object" && !Array.isArray(incoming.loginReward)) ? incoming.loginReward : {};
    base.loginReward = {
      lastClaimDate: typeof incomingLogin.lastClaimDate === "string" ? incomingLogin.lastClaimDate : "",
      streakDay: Math.min(7, nonNegativeInt(incomingLogin.streakDay)),
    };

    const incomingGoals = (incoming.dailyGoals && typeof incoming.dailyGoals === "object" && !Array.isArray(incoming.dailyGoals)) ? incoming.dailyGoals : {};
    const goalsList = Array.isArray(incomingGoals.goals) ? incomingGoals.goals : [];
    base.dailyGoals = {
      date: typeof incomingGoals.date === "string" ? incomingGoals.date : "",
      goals: goalsList.map(g => ({
        id: typeof g.id === "string" ? g.id : "goal",
        text: typeof g.text === "string" ? g.text : "",
        target: nonNegativeInt(g.target || 1),
        progress: nonNegativeInt(g.progress),
        reward: nonNegativeInt(g.reward || 50),
        type: typeof g.type === "string" ? g.type : "defuse",
        claimed: Boolean(g.claimed),
      })),
    };

    const incomingPb = (incoming.personalBests && typeof incoming.personalBests === "object" && !Array.isArray(incoming.personalBests)) ? incoming.personalBests : {};
    base.personalBests = {
      bestScore: Math.max(base.bestScore, nonNegativeInt(incomingPb.bestScore)),
      bestStreak: Math.max(base.bestStreak, nonNegativeInt(incomingPb.bestStreak)),
      mostBombsRun: nonNegativeInt(incomingPb.mostBombsRun),
      fastestDefuse: (Number.isFinite(Number(incomingPb.fastestDefuse)) && Number(incomingPb.fastestDefuse) > 0) ? Number(incomingPb.fastestDefuse) : 0,
      bestDailyScore: Math.max(base.bestDailyScore, nonNegativeInt(incomingPb.bestDailyScore)),
      mostCoinsRun: nonNegativeInt(incomingPb.mostCoinsRun),
    };

    const privIn = (incoming.privacy && typeof incoming.privacy === "object" && !Array.isArray(incoming.privacy)) ? incoming.privacy : {};
    base.privacy = {
      analytics: Boolean(privIn.analytics),
      personalizedAds: Boolean(privIn.personalizedAds),
    };

    const consIn = (incoming.consent && typeof incoming.consent === "object" && !Array.isArray(incoming.consent)) ? incoming.consent : {};
    base.consent = {
      essential: true,
      analytics: Boolean(consIn.analytics),
      personalizedAds: Boolean(consIn.personalizedAds),
    };

    const incomingAch = (incoming.achievements && typeof incoming.achievements === "object" && !Array.isArray(incoming.achievements)) ? incoming.achievements : {};
    const validAchIds = new Set(Object.keys(AchievementDefinitions));
    base.achievements.unlocked = Array.isArray(incomingAch.unlocked)
      ? incomingAch.unlocked.filter(id => validAchIds.has(id))
      : [];
    base.achievements.unlockedDates = (incomingAch.unlockedDates && typeof incomingAch.unlockedDates === "object" && !Array.isArray(incomingAch.unlockedDates))
      ? incomingAch.unlockedDates
      : {};
    base.achievements.progress = (incomingAch.progress && typeof incomingAch.progress === "object" && !Array.isArray(incomingAch.progress))
      ? incomingAch.progress
      : {};

    const incomingAchStats = (incomingAch.stats && typeof incomingAch.stats === "object" && !Array.isArray(incomingAch.stats)) ? incomingAch.stats : {};
    const achStats = base.achievements.stats;
    achStats.totalBombsDefused = nonNegativeInt(incomingAchStats.totalBombsDefused || s.totalBombsDefused);
    achStats.fastDefuses = nonNegativeInt(incomingAchStats.fastDefuses);
    achStats.closeCalls = nonNegativeInt(incomingAchStats.closeCalls);
    achStats.lastMillisecondCalls = nonNegativeInt(incomingAchStats.lastMillisecondCalls);
    achStats.speedDemonCount = nonNegativeInt(incomingAchStats.speedDemonCount);
    achStats.streakBest = Math.max(base.bestStreak, nonNegativeInt(incomingAchStats.streakBest));
    achStats.noPowerStreak = nonNegativeInt(incomingAchStats.noPowerStreak);
    achStats.noPowerTotal = nonNegativeInt(incomingAchStats.noPowerTotal);
    achStats.coinsSpent = nonNegativeInt(incomingAchStats.coinsSpent || s.totalCoinsSpent);
    achStats.upgradesPurchased = nonNegativeInt(incomingAchStats.upgradesPurchased || s.totalUpgradesPurchased);
    achStats.powersUsedCount = nonNegativeInt(incomingAchStats.powersUsedCount || s.totalPowersUsed);
    achStats.secondChanceSurvivals = nonNegativeInt(incomingAchStats.secondChanceSurvivals);
    achStats.ruleTypesSolved = Array.isArray(incomingAchStats.ruleTypesSolved)
      ? incomingAchStats.ruleTypesSolved.filter(r => typeof r === "string")
      : s.rulesMastered;
    achStats.nonColorRulesSolved = nonNegativeInt(incomingAchStats.nonColorRulesSolved);
    achStats.difficultRulesSolved = nonNegativeInt(incomingAchStats.difficultRulesSolved);
    achStats.powersUsedTypes = Array.isArray(incomingAchStats.powersUsedTypes)
      ? incomingAchStats.powersUsedTypes.filter(p => typeof p === "string")
      : [];
    achStats.dailyChallengesCompleted = nonNegativeInt(incomingAchStats.dailyChallengesCompleted || s.totalDailyChallengesCompleted);
    achStats.highestCoinBalance = Math.max(base.coins, nonNegativeInt(incomingAchStats.highestCoinBalance));

    return base;
  }

  function load() {
    const raw = LocalSaveManager.load();
    return raw ? normalize(raw) : defaults();
  }

  let cloudSaveTimeout = null;
  let pendingSaveData = null;
  let saveMicrotaskScheduled = false;

  function flushLocalSave() {
    if (!pendingSaveData) return;
    const dataToSave = pendingSaveData;
    pendingSaveData = null;
    saveMicrotaskScheduled = false;
    const normalized = normalize(dataToSave);
    LocalSaveManager.save(normalized);
    if (AuthManager?.isAuthenticated?.()) {
      scheduleCloudSave(normalized);
    }
  }

  function scheduleCloudSave(saveData) {
    if (!AuthManager?.isAuthenticated?.() || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    if (cloudSaveTimeout) clearTimeout(cloudSaveTimeout);
    cloudSaveTimeout = setTimeout(() => {
      CloudSaveManager.uploadSave(saveData || profile).catch(err => {
        console.warn("[SaveManager] Debounced cloud upload error:", err);
      });
    }, 1500);
  }

  function save(data, immediateCloud = false) {
    pendingSaveData = data || profile;
    if (immediateCloud) {
      if (cloudSaveTimeout) clearTimeout(cloudSaveTimeout);
      const normalized = normalize(pendingSaveData);
      pendingSaveData = null;
      saveMicrotaskScheduled = false;
      LocalSaveManager.save(normalized);
      if (AuthManager?.isAuthenticated?.()) {
        CloudSaveManager.uploadSave(normalized).catch(err => {
          console.warn("[SaveManager] Immediate cloud upload error:", err);
        });
      }
      return;
    }

    if (AuthManager?.isAuthenticated?.()) {
      scheduleCloudSave(pendingSaveData);
    }

    if (!saveMicrotaskScheduled) {
      saveMicrotaskScheduled = true;
      if (typeof queueMicrotask === "function") {
        queueMicrotask(flushLocalSave);
      } else {
        setTimeout(flushLocalSave, 0);
      }
    }
  }

  function reset() {
    LocalSaveManager.reset();
    const data = defaults();
    LocalSaveManager.save(data);
    return data;
  }

  return { load, save, flush: flushLocalSave, reset, normalize, defaults, Local: LocalSaveManager, Cloud: CloudSaveManager };
})();

let profile = SaveManager.load();

const AudioManager = (() => {
  let ctx = null;
  let masterGain = null;
  let noiseBuffer = null;
  let lastTickUnit = null;
  let isMuted = !profile.soundEnabled;

  function initContext() {
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      return ctx;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : 0.75, ctx.currentTime);
      masterGain.connect(ctx.destination);

      const bufferSize = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      return ctx;
    } catch {
      return null;
    }
  }

  function getContext() {
    if (!ctx) initContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function setSoundEnabled(enabled) {
    isMuted = !enabled;
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(isMuted ? 0 : 0.75, ctx.currentTime);
    }
  }

  function isEnabled() {
    return !isMuted;
  }

  function playWireCut() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.035);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.04);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };

      if (noiseBuffer) {
        const noise = ac.createBufferSource();
        noise.buffer = noiseBuffer;
        const filter = ac.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(2500, now);
        const noiseGain = ac.createGain();
        noiseGain.gain.setValueAtTime(0.25, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start(now);
        noise.stop(now + 0.03);
        noise.onended = () => { noise.disconnect(); filter.disconnect(); noiseGain.disconnect(); };
      }
    } catch {}
  }

  function playDefuseSuccess() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [659.25, 830.61, 987.77];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.055;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.28, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.13);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playWrongWire() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc1 = ac.createOscillator(), osc2 = ac.createOscillator(), gain = ac.createGain();
      osc1.type = "sawtooth";
      osc2.type = "square";
      osc1.frequency.setValueAtTime(180, now);
      osc1.frequency.linearRampToValueAtTime(80, now + 0.14);
      osc2.frequency.setValueAtTime(130, now);
      osc2.frequency.linearRampToValueAtTime(65, now + 0.14);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(masterGain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.16);
      osc2.stop(now + 0.16);
      osc1.onended = () => { osc1.disconnect(); osc2.disconnect(); gain.disconnect(); };
    } catch {}
  }

  function playExplosion() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const sub = ac.createOscillator(), subGain = ac.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.65);
      subGain.gain.setValueAtTime(0.7, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      sub.connect(subGain);
      subGain.connect(masterGain);
      sub.start(now);
      sub.stop(now + 0.7);
      sub.onended = () => { sub.disconnect(); subGain.disconnect(); };

      if (noiseBuffer) {
        const noise = ac.createBufferSource(), filter = ac.createBiquadFilter(), noiseGain = ac.createGain();
        noise.buffer = noiseBuffer;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(900, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 0.7);
        noiseGain.gain.setValueAtTime(0.6, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start(now);
        noise.stop(now + 0.75);
        noise.onended = () => { noise.disconnect(); filter.disconnect(); noiseGain.disconnect(); };
      }
    } catch {}
  }

  function playTimerTick(remaining) {
    if (isMuted) return;
    const isCritical = remaining <= 1.5;
    const isDanger = remaining <= 3;
    const currentUnit = isCritical ? Math.floor(remaining * 4) : isDanger ? Math.floor(remaining * 2) : Math.floor(remaining);
    if (lastTickUnit === currentUnit) return;
    lastTickUnit = currentUnit;

    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = "sine";
      const freq = isCritical ? 960 : isDanger ? 680 : 480;
      const vol = isCritical ? 0.22 : isDanger ? 0.16 : 0.09;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.03);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch {}
  }

  function resetTickTracker() {
    lastTickUnit = null;
  }

  function playEmergencyShield() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.28);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch {}
  }

  function playCoinReward() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [1318.5, 1760];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.045;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.09);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.1);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playStreakMilestone() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.06;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.22);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playShopPurchase() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [587.33, 880];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.055;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.28, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.14);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playShopError() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      [0, 0.08].forEach(offset => {
        const startTime = now + offset;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(140, startTime);
        osc.frequency.linearRampToValueAtTime(95, startTime + 0.06);
        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.07);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playScanner() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(2200, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.13);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch {}
  }

  function playTimeFreeze() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(440, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.24);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.25);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch {}
  }

  function playDailyStart() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.05;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.24, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.16);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playDailyProgression() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [587.33, 739.99, 880.00];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.06;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.28, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.2);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playDailyComplete() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.08;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.32, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.38);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playDailyFail() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [329.63, 311.13, 293.66, 261.63];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.11;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.22, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.25);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playAchievementUnlock() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
      chord.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.055;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.26, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.38);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.4);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playDailyRewardClaim() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.05;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.28, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playGoalComplete() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const chord = [659.25, 830.61, 987.77, 1318.51];
      chord.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.04;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.28);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playGoalClaimed() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [783.99, 987.77, 1174.66, 1567.98];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.045;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.26, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.25);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playMilestoneReward() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [349.23, 440.00, 523.25, 698.46, 880.00];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.055;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.35);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playNewRecord() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00];
      chord.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.05;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.28, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.48);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playShareCopied() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [880.00, 1174.66];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.06;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.22, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.18);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playLoginSuccess() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [440.00, 554.37, 659.25, 880.00];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.05;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.24, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.25);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playLogout() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [587.33, 440.00, 329.63];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.06;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.22, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.28);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playProfileSaved() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [659.25, 987.77];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.05;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.2);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playDataExported() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [523.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.045;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.22, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.22);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  return {
    init: initContext,
    setSoundEnabled,
    isEnabled,
    playWireCut,
    playDefuseSuccess,
    playWrongWire,
    playExplosion,
    playTimerTick,
    resetTickTracker,
    playEmergencyShield,
    playCoinReward,
    playStreakMilestone,
    playShopPurchase,
    playShopError,
    playScanner,
    playTimeFreeze,
    playDailyStart,
    playDailyProgression,
    playDailyComplete,
    playDailyFail,
    playAchievementUnlock,
    playDailyRewardClaim,
    playGoalComplete,
    playGoalClaimed,
    playMilestoneReward,
    playNewRecord,
    playShareCopied,
    playLoginSuccess,
    playLogout,
    playProfileSaved,
    playDataExported,
  };
})();

const CoinManager = {
  rewards: { color: 5, position: 7, length: 7, relation: 10, combination: 14, memory: 14, master: 16 },
  award(ruleType, streak) {
    const milestone = streak >= 10 ? 5 : streak >= 5 ? 3 : streak >= 3 ? 2 : 0;
    const streakBonus = milestone ? milestone + UpgradeManager.level("streakBonus") : 0;
    const baseReward = this.rewards[ruleType] || 8;
    const boosted = Math.round((baseReward + streakBonus) * (1 + UpgradeManager.level("coinBoost") * .05));
    this.addCoins(boosted);
    return boosted;
  },
  addCoins(amount) {
    if (amount <= 0) return;
    profile.coins += amount;
    SaveManager.save(profile);
    AchievementManager.onCoinsChanged(profile.coins);
  },
};

const UpgradeManager = {
  level(id) { return profile.upgrades[id] || 0; },
  maxLevel(id) { return UpgradeDefinitions[id].prices.length; },
  nextPrice(id) { return UpgradeDefinitions[id].prices[this.level(id)] ?? null; },
  purchase(id) {
    const price = this.nextPrice(id);
    if (price === null) return { status: "max" };
    if (profile.coins < price) return { status: "insufficient", price };
    profile.coins -= price; profile.upgrades[id] += 1; SaveManager.save(profile);
    AchievementManager.onUpgradePurchased(id, price);
    StatsManager.recordUpgradePurchased(id, price);
    return { status: "purchased", level: this.level(id), price };
  },
  timeBonus() { return this.level("timeBuffer") * .25; },
  speedMultiplier() { return 1 + this.level("speedBonus") * .05; },
  shieldChance() { return this.level("emergencyShield") * .04; },
};

const PowerManager = (() => {
  let scannerTimeoutId = null;
  let freezeTimeoutId = null;
  let activeSecondChance = false;
  let isFrozen = false;
  let purchasing = false;

  function count(id) {
    return profile.powers?.[id] || 0;
  }

  function purchase(id) {
    if (purchasing) return { status: "busy" };
    purchasing = true;
    const def = PowerDefinitions[id];
    if (!def) {
      purchasing = false;
      return { status: "invalid" };
    }
    if (profile.coins < def.price) {
      purchasing = false;
      return { status: "insufficient", price: def.price };
    }
    profile.coins -= def.price;
    profile.powers[id] = (profile.powers[id] || 0) + 1;
    SaveManager.save(profile);
    AchievementManager.onCoinsSpent(def.price);
    StatsManager.recordCoinsSpent(def.price);
    window.setTimeout(() => { purchasing = false; }, 180);
    return { status: "purchased", count: profile.powers[id], price: def.price };
  }

  function canActivate(id) {
    if (state !== "PLAYING" || !run || run.inputLocked) return false;
    if (count(id) <= 0) return false;
    if (id === "timeFreeze" && isFrozen) return false;
    if (id === "secondChance" && activeSecondChance) return false;
    return true;
  }

  function activate(id) {
    if (!canActivate(id)) return false;
    profile.powers[id] = Math.max(0, (profile.powers[id] || 0) - 1);
    SaveManager.save(profile);
    updatePowerUI();

    if (run) run.powerUsedOnRun = true;
    HapticsManager.powerActivate();
    AchievementManager.onPowerActivated(id);
    StatsManager.recordPowerUsed(id);
    DailyGoalsManager.onEvent("power", 1);

    if (id === "scanner") {
      activateScanner();
    } else if (id === "timeFreeze") {
      activateTimeFreeze();
    } else if (id === "secondChance") {
      activateSecondChance();
    }
    return true;
  }

  function activateScanner() {
    clearScanner();
    AudioManager.playScanner();
    showFloatingText("SCANNER ACTIVATED", "var(--accent)");
    if (!run || !run.bomb) return;

    const incorrectWires = run.bomb.wires.filter(w => w.index !== run.bomb.challenge.answerIndex);
    if (!incorrectWires.length) return;
    const target = pick(incorrectWires);
    const wireElements = el.wiresContainer.children;
    for (let wireEl of wireElements) {
      if (Number(wireEl.dataset.index) === target.index) {
        wireEl.classList.add("wire-scanned");
        break;
      }
    }

    scannerTimeoutId = setTimeout(() => {
      clearScanner();
    }, 1500);
  }

  function clearScanner() {
    if (scannerTimeoutId) {
      clearTimeout(scannerTimeoutId);
      scannerTimeoutId = null;
    }
    if (el.wiresContainer) {
      Array.from(el.wiresContainer.children).forEach(wireEl => {
        wireEl.classList.remove("wire-scanned");
      });
    }
  }

  function activateTimeFreeze() {
    clearFreeze();
    isFrozen = true;
    AudioManager.playTimeFreeze();
    showFloatingText("TIME FROZEN (3s)", "#00e5ff");
    Timer.freeze();
    el.timerWrap.classList.add("is-frozen");
    el.timerBarFill.classList.add("is-frozen");
    setBombStatus("FROZEN");
    updatePowerUI();

    freezeTimeoutId = setTimeout(() => {
      endFreeze();
    }, 3000);
  }

  function endFreeze() {
    if (!isFrozen) return;
    isFrozen = false;
    if (freezeTimeoutId) {
      clearTimeout(freezeTimeoutId);
      freezeTimeoutId = null;
    }
    Timer.unfreeze();
    el.timerWrap.classList.remove("is-frozen");
    el.timerBarFill.classList.remove("is-frozen");
    if (state === "PLAYING") {
      setBombStatus("ARMED");
    }
    updatePowerUI();
  }

  function clearFreeze() {
    if (freezeTimeoutId) {
      clearTimeout(freezeTimeoutId);
      freezeTimeoutId = null;
    }
    if (isFrozen) {
      isFrozen = false;
      Timer.unfreeze();
      if (el.timerWrap) el.timerWrap.classList.remove("is-frozen");
      if (el.timerBarFill) el.timerBarFill.classList.remove("is-frozen");
    }
  }

  function activateSecondChance() {
    activeSecondChance = true;
    AudioManager.playEmergencyShield();
    showFloatingText("SECOND CHANCE ACTIVE", "var(--accent)");
    updatePowerUI();
  }

  function hasActiveSecondChance() {
    return activeSecondChance;
  }

  function consumeSecondChance() {
    activeSecondChance = false;
    updatePowerUI();
  }

  function cleanup() {
    clearScanner();
    clearFreeze();
    activeSecondChance = false;
    updatePowerUI();
  }

  return {
    count,
    purchase,
    canActivate,
    activate,
    clearScanner,
    hasActiveSecondChance,
    consumeSecondChance,
    cleanup,
    get isFrozen() { return isFrozen; },
    get activeSecondChance() { return activeSecondChance; }
  };
})();

const Timer = (() => {
  let frameId = null, startedAt = 0, duration = 0, remaining = 0, onTick = null, onExpired = null;
  let isFrozen = false, freezeStartedAt = 0, lastTickTime = 0;

  function tick(now) {
    if (isFrozen) {
      lastTickTime = now;
      frameId = requestAnimationFrame(tick);
      return;
    }
    const deltaSeconds = (now - lastTickTime) / 1000;
    lastTickTime = now;
    if (deltaSeconds > 0 && deltaSeconds < 1.0) {
      StatsManager.addPlayTime(deltaSeconds);
    }

    remaining = Math.max(0, duration - (now - startedAt) / 1000);
    onTick?.(remaining, duration);
    if (remaining <= 0) {
      frameId = null;
      onExpired?.();
      return;
    }
    frameId = requestAnimationFrame(tick);
  }
  function start(seconds, tickHandler, expiredHandler) {
    stop();
    isFrozen = false;
    duration = seconds;
    remaining = seconds;
    onTick = tickHandler;
    onExpired = expiredHandler;
    startedAt = performance.now();
    lastTickTime = startedAt;
    lastRenderedTimerSec = null;
    lastTimerAlertState = "";
    onTick(remaining, duration);
    frameId = requestAnimationFrame(tick);
  }
  function pause() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  }
  function resume() {
    if (frameId === null && remaining > 0) {
      startedAt = performance.now() - (duration - remaining) * 1000;
      lastTickTime = performance.now();
      frameId = requestAnimationFrame(tick);
    }
  }
  function freeze() {
    if (!isFrozen) {
      isFrozen = true;
      freezeStartedAt = performance.now();
    }
  }
  function unfreeze() {
    if (isFrozen) {
      isFrozen = false;
      const frozenDuration = performance.now() - freezeStartedAt;
      startedAt += frozenDuration;
      lastTickTime = performance.now();
    }
  }
  function stop() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    isFrozen = false;
  }
  return { start, pause, resume, freeze, unfreeze, stop, get remaining() { return remaining; }, get isFrozen() { return isFrozen; } };
})();

const RuleEngine = {
  definitions: {
    color: bomb => { const target = pick(bomb.wires); return rule("color", `CUT THE ${target.color.toUpperCase()} WIRE`, target.index); },
    position: bomb => pick([rule("position", "CUT THE FIRST WIRE FROM THE LEFT", 0), rule("position", "CUT THE SECOND WIRE FROM THE RIGHT", bomb.wires.length - 2), ...(bomb.wires.length % 2 ? [rule("position", "CUT THE MIDDLE WIRE", Math.floor(bomb.wires.length / 2))] : [])]),
    length: bomb => { const ordered = [...bomb.wires].sort((a, b) => b.length - a.length); return pick([rule("length", "CUT THE LONGEST WIRE", ordered[0].index), rule("length", "CUT THE SHORTEST WIRE", ordered.at(-1).index), ...(ordered.length >= 4 ? [rule("length", "CUT THE SECOND LONGEST WIRE", ordered[1].index), rule("length", "CUT THE SECOND SHORTEST WIRE", ordered.at(-2).index)] : [])]); },
    relation: bomb => { const index = randomInt(1, bomb.wires.length - 2), left = bomb.wires[index - 1], right = bomb.wires[index + 1]; return rule("relation", `CUT THE WIRE BETWEEN ${left.color.toUpperCase()} AND ${right.color.toUpperCase()}`, index); },
    combination: bomb => { const ordered = [...bomb.wires].sort((a, b) => b.length - a.length), longest = ordered[0], shortestOther = ordered.filter(wire => wire.index !== longest.index).at(-1); return pick([rule("combination", `CUT THE LONGEST ${longest.color.toUpperCase()} WIRE`, longest.index), rule("combination", `CUT THE SHORTEST WIRE THAT IS NOT ${longest.color.toUpperCase()}`, shortestOther.index), ...(ordered.length >= 4 ? [rule("combination", `CUT THE SECOND LONGEST ${ordered[1].color.toUpperCase()} WIRE`, ordered[1].index)] : [])]); },
    memory: (bomb, history) => { if (history.lastAnswerIndex === null || history.lastAnswerIndex >= bomb.wires.length) return null; const opposite = bomb.wires.length - 1 - history.lastAnswerIndex; return pick([rule("memory", "CUT THE SAME POSITION AS LAST ROUND", history.lastAnswerIndex), rule("memory", "CUT THE POSITION OPPOSITE LAST ROUND", opposite)]); },
  },
  create(bomb, allowed, history) { return shuffle(allowed).map(type => this.definitions[type](bomb, history)).find(Boolean) || this.definitions.color(bomb); },
};

const BombFactory = {
  create(number, history) {
    if (number === 1) {
      // Guaranteed accessible, clear first bomb for smooth onboarding
      const colors = shuffle(["blue", "red", "green", "yellow"]).slice(0, 3);
      const wires = colors.map((color, index) => ({ color, index, length: 0.72 + index * 0.08 }));
      const target = pick(wires);
      const bomb = { number: 1, wires, time: 10 + UpgradeManager.timeBonus() };
      bomb.challenge = rule("color", `CUT THE ${target.color.toUpperCase()} WIRE`, target.index);
      return bomb;
    }
    const stage = getStage(number), count = randomInt(stage.wires[0], stage.wires[1]), wires = shuffle(GameConfig.wireColors).slice(0, count).map((color, index) => ({ color, index, length: 0 }));
    const closeness = Math.min(.28, Math.max(0, (number - 6) * .014)), base = .6 + closeness;
    shuffle(wires).forEach((wire, rank) => { wire.length = base + (count - rank) * ((.36 - closeness) / count); });
    const bomb = { number, wires, time: stage.time + UpgradeManager.timeBonus() }; bomb.challenge = RuleEngine.create(bomb, stage.rules, history); return bomb;
  },
};
const Scoring = { award: (type, secondsLeft, streak) => GameConfig.score[type] + Math.round(secondsLeft * GameConfig.speedBonusPerSecond * UpgradeManager.speedMultiplier()) + Math.min(GameConfig.comboBonusCap, Math.max(0, streak - 1) * 8) };

const ShopUI = (() => {
  let purchasing = false;
  function render() {
    el.shopCoins.textContent = profile.coins.toLocaleString();
    el.upgradeList.replaceChildren();
    el.powerList.replaceChildren();

    // Upgrades
    Object.entries(UpgradeDefinitions).forEach(([id, item]) => {
      const level = UpgradeManager.level(id), max = UpgradeManager.maxLevel(id), price = UpgradeManager.nextPrice(id), card = document.createElement("article");
      card.className = "upgrade-card"; card.dataset.upgrade = id;
      card.innerHTML = `<div class="upgrade-icon">${item.icon}</div><div class="upgrade-copy"><h2>${item.name}</h2><p>${item.description}</p><span>LEVEL ${level}/${max} · ${item.effect(level)}</span></div><div class="upgrade-action"><strong>${price === null ? "MAX" : `◆ ${price}`}</strong><button class="upgrade-btn ${price === null ? "is-max" : ""}">${price === null ? "MAX LEVEL" : "UPGRADE"}</button></div>`;
      card.querySelector("button").addEventListener("click", () => buyUpgrade(id, card));
      el.upgradeList.appendChild(card);
    });

    // Powers
    Object.entries(PowerDefinitions).forEach(([id, item]) => {
      const count = PowerManager.count(id), card = document.createElement("article");
      card.className = "power-card"; card.dataset.power = id;
      card.innerHTML = `<div class="power-icon-box">${item.icon}</div><div class="power-copy"><h2>${item.name}</h2><p>${item.description}</p><span>OWNED: ${count}</span></div><div class="power-action"><strong>◆ ${item.price}</strong><button class="power-buy-btn">BUY +1</button></div>`;
      card.querySelector("button").addEventListener("click", () => buyPower(id, card));
      el.powerList.appendChild(card);
    });
  }

  function buyUpgrade(id, card) {
    if (purchasing) return; purchasing = true;
    const result = UpgradeManager.purchase(id);
    if (result.status === "purchased") { AudioManager.playShopPurchase(); showToast(`${UpgradeDefinitions[id].name} · LEVEL ${result.level}`, "success"); refreshPersistentUI(); render(); }
    else if (result.status === "insufficient") { AudioManager.playShopError(); card.classList.add("not-enough"); showToast("NOT ENOUGH COINS", "danger"); later(() => card.classList.remove("not-enough"), 350); }
    else showToast("MAX LEVEL REACHED", "neutral");
    window.setTimeout(() => { purchasing = false; }, 180);
  }

  function buyPower(id, card) {
    if (purchasing) return; purchasing = true;
    const result = PowerManager.purchase(id);
    if (result.status === "purchased") { AudioManager.playShopPurchase(); showToast(`+1 ${PowerDefinitions[id].name}`, "success"); refreshPersistentUI(); render(); }
    else if (result.status === "insufficient") { AudioManager.playShopError(); card.classList.add("not-enough"); showToast("NOT ENOUGH COINS", "danger"); later(() => card.classList.remove("not-enough"), 350); }
    window.setTimeout(() => { purchasing = false; }, 180);
  }

  return { render };
})();

let state = "MENU", run = null, gameMode = "NORMAL", cachedDailyChallenge = null;
const pendingTimeouts = new Set();

function rule(type, text, answerIndex) { return { type, text, answerIndex }; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(items) { return [...items].sort(() => Math.random() - .5); }
function pick(items) { return items[Math.floor(Math.random() * items.length)]; }
function getStage(number) { return [...GameConfig.stages].reverse().find(stage => number >= stage.from) || GameConfig.stages[0]; }
function newRun() {
  return {
    score: 0,
    coinsEarned: 0,
    streak: 0,
    bestStreak: 0,
    bombsDefused: 0,
    bombNumber: 1,
    bomb: null,
    inputLocked: false,
    lastAnswerIndex: null,
    shieldUsed: false,
    totalTimeRemaining: 0,
    powerUsedOnRun: false,
    achievedMilestones: new Set(),
    runStartTime: performance.now(),
  };
}
function closeAccountPopup() {
  if (el.menuAccountPopup) el.menuAccountPopup.style.display = "none";
  if (el.btnMenuAvatar) el.btnMenuAvatar.setAttribute("aria-expanded", "false");
}
function showScreen(name) {
  closeAccountPopup();
  Object.values(screens).forEach(screen => screen?.classList.remove("active"));
  screens[name]?.classList.add("active");
}
function later(callback, milliseconds) { const id = setTimeout(() => { pendingTimeouts.delete(id); callback(); }, milliseconds); pendingTimeouts.add(id); return id; }
function clearPendingTransitions() { pendingTimeouts.forEach(id => clearTimeout(id)); pendingTimeouts.clear(); }
function setBombStatus(status) {
  if (el.bomb) {
    el.bomb.dataset.status = status.toLowerCase();
    el.bomb.classList.remove("status-arming", "status-armed", "status-success", "status-failure", "status-frozen", "status-saved", "status-shielded");
    const cls = `status-${status.toLowerCase().replace(/[^a-z]/g, "")}`;
    el.bomb.classList.add(cls);
  }
  if (el.bombScreenText) el.bombScreenText.textContent = status;
}

/* =========================================================
   DAILY CHALLENGE MANAGER
========================================================= */
const DailyChallengeManager = (() => {
  function getDateKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
  }

  function getDayNumber(dateKey = getDateKey()) {
    const epoch = new Date((GameConfig.daily.epochDate || "2026-08-01") + "T00:00:00Z").getTime();
    const current = new Date(dateKey + "T00:00:00Z").getTime();
    const dayDiff = Math.floor((current - epoch) / (86400 * 1000));
    return Math.max(1, dayDiff + 1);
  }

  function getDailyTheme(dateKey = getDateKey()) {
    const rng = createSeededRandom(dateKey + "_theme");
    const themes = [
      "MASTER TEST",
      "TACTICAL PROTOCOL",
      "SYNAPSE DEFUSAL",
      "PRECISION TRIAL",
      "CRITICAL CIRCUIT",
      "OMEGA SEQUENCE",
      "HAZARD GAUNTLET",
    ];
    return rng.pick(themes) || "MASTER TEST";
  }

  function generateBombDefinition(stageIndex, stageConfig, rng, previousBombDef = null) {
    const count = rng.nextInt(stageConfig.wires[0], stageConfig.wires[1]);
    const colors = rng.shuffle(GameConfig.wireColors).slice(0, count);
    const wires = colors.map((color, index) => ({ color, index, length: 0 }));

    // Deterministic wire lengths with distinct values
    const closeness = Math.min(0.28, Math.max(0, stageIndex * 0.035));
    const base = 0.6 + closeness;
    const lengthRanks = rng.shuffle([...Array(count).keys()]);
    wires.forEach((wire, i) => {
      const rank = lengthRanks[i];
      wire.length = Number((base + (count - rank) * ((0.36 - closeness) / count)).toFixed(4));
    });

    let challenge = null;
    const ruleType = stageConfig.ruleType;

    if (ruleType === "color") {
      const target = rng.pick(wires);
      challenge = rule("color", `CUT THE ${target.color.toUpperCase()} WIRE`, target.index);
    } else if (ruleType === "position") {
      const options = [
        rule("position", "CUT THE FIRST WIRE FROM THE LEFT", 0),
        rule("position", "CUT THE SECOND WIRE FROM THE RIGHT", wires.length - 2),
      ];
      if (wires.length % 2 === 1) {
        options.push(rule("position", "CUT THE MIDDLE WIRE", Math.floor(wires.length / 2)));
      }
      challenge = rng.pick(options);
    } else if (ruleType === "length") {
      const ordered = [...wires].sort((a, b) => b.length - a.length);
      const options = [
        rule("length", "CUT THE LONGEST WIRE", ordered[0].index),
        rule("length", "CUT THE SHORTEST WIRE", ordered.at(-1).index),
      ];
      if (ordered.length >= 4) {
        options.push(rule("length", "CUT THE SECOND LONGEST WIRE", ordered[1].index));
        options.push(rule("length", "CUT THE SECOND SHORTEST WIRE", ordered.at(-2).index));
      }
      challenge = rng.pick(options);
    } else if (ruleType === "relation") {
      const index = rng.nextInt(1, wires.length - 2);
      const left = wires[index - 1];
      const right = wires[index + 1];
      challenge = rule("relation", `CUT THE WIRE BETWEEN ${left.color.toUpperCase()} AND ${right.color.toUpperCase()}`, index);
    } else if (ruleType === "combination") {
      const ordered = [...wires].sort((a, b) => b.length - a.length);
      const longest = ordered[0];
      const shortestOther = ordered.filter(w => w.index !== longest.index).at(-1);
      const options = [
        rule("combination", `CUT THE LONGEST ${longest.color.toUpperCase()} WIRE`, longest.index),
        rule("combination", `CUT THE SHORTEST WIRE THAT IS NOT ${longest.color.toUpperCase()}`, shortestOther.index),
      ];
      if (ordered.length >= 4) {
        options.push(rule("combination", `CUT THE SECOND LONGEST ${ordered[1].color.toUpperCase()} WIRE`, ordered[1].index));
      }
      challenge = rng.pick(options);
    } else if (ruleType === "memory") {
      const lastAnswer = previousBombDef ? previousBombDef.challenge.answerIndex : 0;
      const options = [];
      if (lastAnswer < wires.length) {
        options.push(rule("memory", "CUT THE SAME POSITION AS LAST ROUND", lastAnswer));
      }
      const opposite = wires.length - 1 - lastAnswer;
      if (opposite >= 0 && opposite < wires.length) {
        options.push(rule("memory", "CUT THE POSITION OPPOSITE LAST ROUND", opposite));
      }
      challenge = options.length ? rng.pick(options) : rule("position", "CUT THE FIRST WIRE FROM THE LEFT", 0);
    } else if (ruleType === "master") {
      const ordered = [...wires].sort((a, b) => b.length - a.length);
      const forbiddenColor = rng.pick(ordered.map(w => w.color));
      const nonForbidden = ordered.filter(w => w.color !== forbiddenColor);

      const masterOptions = [];
      if (nonForbidden.length >= 1) {
        masterOptions.push(rule("master", `CUT THE LONGEST WIRE THAT IS NOT ${forbiddenColor.toUpperCase()}`, nonForbidden[0].index));
        masterOptions.push(rule("master", `CUT THE SHORTEST WIRE THAT IS NOT ${forbiddenColor.toUpperCase()}`, nonForbidden.at(-1).index));
      }
      if (nonForbidden.length >= 2) {
        masterOptions.push(rule("master", `CUT THE SECOND SHORTEST WIRE THAT IS NOT ${forbiddenColor.toUpperCase()}`, nonForbidden.at(-2).index));
      }
      if (ordered.length >= 4) {
        const secondShortest = ordered.at(-2);
        masterOptions.push(rule("master", `CUT THE SECOND SHORTEST WIRE`, secondShortest.index));
      }
      challenge = masterOptions.length ? rng.pick(masterOptions) : rule("master", `CUT THE LONGEST WIRE THAT IS NOT ${ordered[0].color.toUpperCase()}`, ordered.at(-1).index);
    }

    return {
      number: stageConfig.bombNumber,
      time: stageConfig.time,
      wires,
      challenge,
    };
  }

  function validateBomb(bomb) {
    if (!bomb || !bomb.wires || bomb.wires.length < 3) return false;
    if (!bomb.challenge || typeof bomb.challenge.text !== "string") return false;
    const ans = bomb.challenge.answerIndex;
    if (typeof ans !== "number" || ans < 0 || ans >= bomb.wires.length) return false;
    return true;
  }

  function generateDailyChallenge(dateKey = getDateKey()) {
    let attempt = 0;
    while (attempt < 10) {
      const seedStr = attempt === 0 ? `${dateKey}_daily_v1` : `${dateKey}_daily_v1_retry_${attempt}`;
      const rng = createSeededRandom(seedStr);
      const bombs = [];
      let valid = true;

      for (let i = 0; i < GameConfig.daily.stages.length; i++) {
        const stage = GameConfig.daily.stages[i];
        const prevBomb = i > 0 ? bombs[i - 1] : null;
        const bomb = generateBombDefinition(i, stage, rng, prevBomb);
        if (!validateBomb(bomb)) {
          valid = false;
          break;
        }
        bombs.push(bomb);
      }

      if (valid && bombs.length === GameConfig.daily.bombCount) {
        return bombs;
      }
      attempt++;
    }

    // Fallback guaranteed deterministic challenge
    return GameConfig.daily.stages.map((stage, idx) => {
      const count = 4 + (idx % 3);
      const wires = GameConfig.wireColors.slice(0, count).map((color, index) => ({ color, index, length: 0.6 + index * 0.05 }));
      const target = wires[idx % count];
      return {
        number: stage.bombNumber,
        time: stage.time,
        wires,
        challenge: rule("color", `CUT THE ${target.color.toUpperCase()} WIRE`, target.index),
      };
    });
  }

  function ensureDateSync() {
    const today = getDateKey();
    if (profile.daily.date !== today) {
      profile.daily = {
        date: today,
        status: "NONE",
        score: 0,
        bombsCompleted: 0,
        rewardClaimed: false,
      };
      SaveManager.save(profile);
      cachedDailyChallenge = null;
    }
  }

  function calculateReward(score, totalTimeRemaining, bombsCompleted, isVictory) {
    const base = isVictory ? GameConfig.daily.baseReward : 0;
    const timeBonus = isVictory ? Math.min(GameConfig.daily.timeBonusCap || 50, Math.round(totalTimeRemaining * 2.5)) : 0;
    const scoreBonus = isVictory ? Math.min(GameConfig.daily.scoreBonusCap || 50, Math.round(score / 150)) : 0;
    const perfectBonus = (isVictory && bombsCompleted >= 7) ? (GameConfig.daily.perfectBonus || 50) : 0;

    const rawSubtotal = base + timeBonus + scoreBonus + perfectBonus;
    const cappedSubtotal = Math.min(GameConfig.daily.maxReward || 200, rawSubtotal);

    const boostMultiplier = 1 + UpgradeManager.level("coinBoost") * 0.05;
    const totalCoins = Math.round(cappedSubtotal * boostMultiplier);

    return {
      base,
      timeBonus,
      scoreBonus,
      perfectBonus,
      rawSubtotal,
      cappedSubtotal,
      boostMultiplier,
      totalCoins,
    };
  }

  return {
    getDateKey,
    getDayNumber,
    getDailyTheme,
    generateDailyChallenge,
    ensureDateSync,
    calculateReward,
  };
})();

/* =========================================================
   ACHIEVEMENT NOTIFICATION TOAST QUEUE
========================================================= */
const AchievementToastManager = (() => {
  const queue = [];
  let isShowing = false;
  let currentTimerId = null;

  function enqueue(item) {
    queue.push(item);
    if (!isShowing) {
      showNext();
    }
  }

  function showNext() {
    if (queue.length === 0) {
      isShowing = false;
      return;
    }
    isShowing = true;
    const item = queue.shift();

    if (el.achievementToast && el.achToastIcon && el.achToastName && el.achToastDesc && el.achToastReward) {
      el.achToastIcon.textContent = item.icon || "🏆";
      el.achToastName.textContent = item.name;
      el.achToastDesc.textContent = item.description;
      el.achToastReward.textContent = `+${item.reward} ◆`;

      el.achievementToast.classList.add("show");

      if (currentTimerId) clearTimeout(currentTimerId);
      currentTimerId = setTimeout(() => {
        el.achievementToast.classList.remove("show");
        currentTimerId = setTimeout(() => {
          showNext();
        }, 300);
      }, 2600);
    } else {
      isShowing = false;
    }
  }

  function reset() {
    queue.length = 0;
    if (currentTimerId) clearTimeout(currentTimerId);
    isShowing = false;
    if (el.achievementToast) el.achievementToast.classList.remove("show");
  }

  return { enqueue, reset };
})();

/* =========================================================
   ACHIEVEMENT MANAGER
========================================================= */
const AchievementManager = (() => {
  function getStats() {
    return profile.achievements.stats;
  }

  function isUnlocked(id) {
    return profile.achievements.unlocked.includes(id);
  }

  function unlock(id) {
    if (isUnlocked(id)) return false;
    const def = AchievementDefinitions[id];
    if (!def) return false;

    profile.achievements.unlocked.push(id);
    profile.achievements.unlockedDates[id] = Date.now();

    // Award coins through CoinManager
    CoinManager.addCoins(def.reward);

    // Play triumphant audio chime, trigger haptic pulse, and show notification toast
    AudioManager.playAchievementUnlock();
    HapticsManager.achievementUnlock();
    AchievementToastManager.enqueue(def);

    SaveManager.save(profile);
    AchievementUI.updateBadge();
    return true;
  }

  function getProgress(id) {
    const def = AchievementDefinitions[id];
    if (!def) return { current: 0, target: 1, percent: 0, unlocked: false };
    const unlocked = isUnlocked(id);
    if (unlocked) return { current: def.target, target: def.target, percent: 100, unlocked: true };

    const stats = getStats();
    let current = 0;

    switch (id) {
      case "first_blood":
      case "professional":
      case "bomb_squad":
      case "machine":
        current = stats.totalBombsDefused;
        break;
      case "quick_hands":
      case "lightning":
        current = stats.fastDefuses;
        break;
      case "too_close":
        current = stats.closeCalls;
        break;
      case "speed_demon":
        current = stats.speedDemonCount;
        break;
      case "on_fire":
      case "unstoppable":
      case "legend":
        current = stats.streakBest;
        break;
      case "perfect_run":
        current = stats.noPowerStreak;
        break;
      case "rule_master":
        current = stats.ruleTypesSolved.length;
        break;
      case "logic_machine":
        current = stats.nonColorRulesSolved;
        break;
      case "master_defuser":
        current = stats.difficultRulesSolved;
        break;
      case "saver":
        current = Math.max(profile.coins, stats.highestCoinBalance || profile.coins);
        break;
      case "big_spender":
        current = stats.coinsSpent;
        break;
      case "investor":
        current = stats.upgradesPurchased;
        break;
      case "emergency":
        current = stats.secondChanceSurvivals;
        break;
      case "tactician":
        current = stats.powersUsedTypes.length;
        break;
      case "last_millisecond":
        current = stats.lastMillisecondCalls;
        break;
      case "no_help":
        current = stats.noPowerTotal;
        break;
      case "master_of_daily":
        current = stats.dailyChallengesCompleted;
        break;
      default:
        current = profile.achievements.progress[id] || 0;
    }

    current = Math.min(def.target, Math.max(0, current));
    const percent = Math.min(100, Math.round((current / def.target) * 100));
    return { current, target: def.target, percent, unlocked };
  }

  function checkProgressAndUnlocks() {
    Object.keys(AchievementDefinitions).forEach(id => {
      if (!isUnlocked(id)) {
        const { current, target } = getProgress(id);
        if (current >= target) {
          unlock(id);
        }
      }
    });
  }

  function onBombDefused({ bombNumber, ruleType, timeRemaining, totalTime, streak, powerUsedThisRun }) {
    const stats = getStats();
    stats.totalBombsDefused += 1;

    if (timeRemaining >= 5.0) {
      stats.fastDefuses += 1;
    }
    if (timeRemaining >= 4.0) {
      stats.speedDemonCount += 1;
    }
    if (timeRemaining < 0.5 && timeRemaining > 0) {
      stats.closeCalls += 1;
    }
    if (timeRemaining < 0.1 && timeRemaining > 0) {
      stats.lastMillisecondCalls += 1;
    }

    stats.streakBest = Math.max(stats.streakBest, streak);

    if (ruleType && ["color", "position", "length", "relation", "combination", "memory"].includes(ruleType)) {
      if (!stats.ruleTypesSolved.includes(ruleType)) {
        stats.ruleTypesSolved.push(ruleType);
      }
    }

    if (ruleType && ruleType !== "color") {
      stats.nonColorRulesSolved += 1;
    }

    if (["combination", "memory", "master"].includes(ruleType) || bombNumber >= 15) {
      stats.difficultRulesSolved += 1;
    }

    if (!powerUsedThisRun) {
      stats.noPowerStreak = (stats.noPowerStreak || 0) + 1;
      stats.noPowerTotal = (stats.noPowerTotal || 0) + 1;
    } else {
      stats.noPowerStreak = 0;
    }

    SaveManager.save(profile);
    checkProgressAndUnlocks();
  }

  function onBombExploded() {
    const stats = getStats();
    stats.noPowerStreak = 0;
    SaveManager.save(profile);
  }

  function onPowerActivated(powerId) {
    const stats = getStats();
    stats.powersUsedCount = (stats.powersUsedCount || 0) + 1;
    if (powerId && !stats.powersUsedTypes.includes(powerId)) {
      stats.powersUsedTypes.push(powerId);
    }
    stats.noPowerStreak = 0;
    SaveManager.save(profile);
    checkProgressAndUnlocks();
  }

  function onPowerSaved() {
    const stats = getStats();
    stats.secondChanceSurvivals = (stats.secondChanceSurvivals || 0) + 1;
    stats.noPowerStreak = 0;
    SaveManager.save(profile);
    checkProgressAndUnlocks();
  }

  function onUpgradePurchased(upgradeId, cost) {
    const stats = getStats();
    stats.upgradesPurchased += 1;
    stats.coinsSpent += cost;
    SaveManager.save(profile);
    checkProgressAndUnlocks();
  }

  function onCoinsSpent(cost) {
    const stats = getStats();
    stats.coinsSpent += cost;
    SaveManager.save(profile);
    checkProgressAndUnlocks();
  }

  function onCoinsChanged(currentCoins) {
    const stats = getStats();
    stats.highestCoinBalance = Math.max(stats.highestCoinBalance || 0, currentCoins);
    SaveManager.save(profile);
    checkProgressAndUnlocks();
  }

  function onDailyCompleted() {
    const stats = getStats();
    stats.dailyChallengesCompleted += 1;
    SaveManager.save(profile);
    checkProgressAndUnlocks();
  }

  return {
    isUnlocked,
    unlock,
    getProgress,
    checkProgressAndUnlocks,
    onBombDefused,
    onBombExploded,
    onPowerActivated,
    onPowerSaved,
    onUpgradePurchased,
    onCoinsSpent,
    onCoinsChanged,
    onDailyCompleted,
  };
})();

/* =========================================================
   ACHIEVEMENTS UI
========================================================= */
const AchievementUI = (() => {
  let activeCategory = "ALL";

  function updateBadge() {
    const total = Object.keys(AchievementDefinitions).length;
    const unlockedCount = profile.achievements.unlocked.length;
    if (el.menuAchievementsBadge) {
      el.menuAchievementsBadge.innerHTML = `<span class="ach-badge-val">${unlockedCount}</span><span class="ach-badge-total">/${total}</span>`;
    }
    if (el.achTotalCount) {
      el.achTotalCount.textContent = `${unlockedCount} / ${total}`;
    }
    if (el.achSummaryFill) {
      const pct = Math.round((unlockedCount / total) * 100);
      el.achSummaryFill.style.width = `${pct}%`;
    }
  }

  function render() {
    updateBadge();
    if (!el.achievementList) return;
    el.achievementList.replaceChildren();

    const allItems = Object.values(AchievementDefinitions);
    const filtered = activeCategory === "ALL"
      ? allItems
      : allItems.filter(item => item.category === activeCategory);

    // Sorting: Unlocked first, then in-progress (highest %), then locked, then hidden
    filtered.sort((a, b) => {
      const progA = AchievementManager.getProgress(a.id);
      const progB = AchievementManager.getProgress(b.id);
      if (progA.unlocked !== progB.unlocked) return progA.unlocked ? -1 : 1;
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      return progB.percent - progA.percent;
    });

    filtered.forEach(item => {
      const prog = AchievementManager.getProgress(item.id);
      const isHiddenLocked = item.hidden && !prog.unlocked;

      const card = document.createElement("article");
      card.className = `achievement-card ${prog.unlocked ? "unlocked" : isHiddenLocked ? "hidden-locked" : "locked"}`;
      card.dataset.achievement = item.id;

      const iconText = isHiddenLocked ? "❓" : (item.icon || "🏆");
      const titleText = isHiddenLocked ? "???" : item.name;
      const descText = isHiddenLocked ? "Hidden achievement. Play to discover." : item.description;
      const rewardText = `+${item.reward} ◆`;
      const statusText = prog.unlocked ? "✓ UNLOCKED" : isHiddenLocked ? "???" : `${prog.current} / ${prog.target}`;

      card.innerHTML = `
        <div class="ach-card-icon">${iconText}</div>
        <div class="ach-card-copy">
          <h2 class="ach-card-title">${titleText}</h2>
          <p class="ach-card-desc">${descText}</p>
          ${!prog.unlocked && !isHiddenLocked ? `
            <div class="ach-card-progress-wrap">
              <div class="ach-card-track">
                <div class="ach-card-fill" style="width: ${prog.percent}%"></div>
              </div>
              <span class="ach-card-progress-text">${prog.percent}%</span>
            </div>
          ` : ""}
        </div>
        <div class="ach-card-meta">
          <span class="ach-card-reward">${rewardText}</span>
          <span class="ach-card-status">${statusText}</span>
        </div>
      `;
      el.achievementList.appendChild(card);
    });
  }

  function setCategory(cat) {
    activeCategory = cat;
    if (el.achFilterPills) {
      Array.from(el.achFilterPills.children).forEach(btn => {
        btn.classList.toggle("active", btn.dataset.category === cat);
      });
    }
    render();
  }

  return {
    render,
    updateBadge,
    setCategory,
  };
})();

/* =========================================================
   MONETIZATION ARCHITECTURE (LIVE-OPS STUB)
========================================================= */
const MonetizationConfig = {
  enabled: false,
  rewardedAdsEnabled: false,
  interstitialAdsEnabled: false,
};

const MonetizationManager = {
  initialize() {},
  isRewardedAdAvailable(placement = "default") {
    return Boolean(MonetizationConfig.enabled && MonetizationConfig.rewardedAdsEnabled);
  },
  showRewardedAd(placement = "default", onRewarded, onClosed) {
    if (!this.isRewardedAdAvailable(placement)) {
      onClosed?.();
      return;
    }
  },
  showInterstitial(placement = "default", onClosed) {
    if (!MonetizationConfig.enabled || !MonetizationConfig.interstitialAdsEnabled) {
      onClosed?.();
      return;
    }
  },
  onRewarded(placement) {},
  onInterstitialClosed(placement) {},
};

/* =========================================================
   CAREER STATISTICS MANAGER
========================================================= */
const StatsManager = (() => {
  function getStats() {
    return profile.stats;
  }

  function addPlayTime(seconds) {
    if (seconds > 0) {
      profile.stats.totalPlayTimeSeconds = (profile.stats.totalPlayTimeSeconds || 0) + seconds;
      // Note: Persisted at natural game boundaries (defusal, explosion, pause, menu) to avoid 60fps localStorage disk thrashing.
    }
  }

  function recordDefuse({ bombNumber, ruleType, timeRemaining, totalTime, streak, score, coins }) {
    const s = profile.stats;
    s.totalBombsDefused = (s.totalBombsDefused || 0) + 1;
    s.totalAttempts = (s.totalBombsDefused || 0) + (s.totalBombsFailed || 0);
    s.totalCoinsEarned = (s.totalCoinsEarned || 0) + (coins || 0);
    s.totalScore = (s.totalScore || 0) + (score || 0);
    s.bestScore = Math.max(s.bestScore || 0, profile.bestScore || score || 0);
    s.bestStreak = Math.max(s.bestStreak || 0, streak || 0);

    const timeTaken = Math.max(0.01, totalTime - timeRemaining);
    if (!s.fastestDefuseSeconds || s.fastestDefuseSeconds <= 0 || timeTaken < s.fastestDefuseSeconds) {
      s.fastestDefuseSeconds = Number(timeTaken.toFixed(2));
    }

    if (ruleType && !s.rulesMastered.includes(ruleType)) {
      s.rulesMastered.push(ruleType);
    }
    s.achievementsUnlocked = profile.achievements.unlocked.length;
    SaveManager.save(profile);
  }

  function recordExplosion({ score, streak, coins }) {
    const s = profile.stats;
    s.totalBombsFailed = (s.totalBombsFailed || 0) + 1;
    s.totalAttempts = (s.totalBombsDefused || 0) + (s.totalBombsFailed || 0);
    // Note: Do NOT add cumulative run.score or run.coinsEarned again, as they were already counted per-defuse.
    s.bestScore = Math.max(s.bestScore || 0, profile.bestScore || score || 0);
    s.bestStreak = Math.max(s.bestStreak || 0, profile.bestStreak || streak || 0);
    s.achievementsUnlocked = profile.achievements.unlocked.length;
    SaveManager.save(profile);
  }

  function recordPowerUsed(powerId) {
    profile.stats.totalPowersUsed = (profile.stats.totalPowersUsed || 0) + 1;
    SaveManager.save(profile);
  }

  function recordUpgradePurchased(upgradeId, cost) {
    profile.stats.totalUpgradesPurchased = (profile.stats.totalUpgradesPurchased || 0) + 1;
    profile.stats.totalCoinsSpent = (profile.stats.totalCoinsSpent || 0) + cost;
    SaveManager.save(profile);
  }

  function recordCoinsSpent(cost) {
    profile.stats.totalCoinsSpent = (profile.stats.totalCoinsSpent || 0) + cost;
    SaveManager.save(profile);
  }

  function recordDailyCompleted({ isPerfect, score, bombsDefused }) {
    profile.stats.totalDailyChallengesCompleted = (profile.stats.totalDailyChallengesCompleted || 0) + 1;
    if (isPerfect || bombsDefused >= 7) {
      profile.stats.perfectDailyChallenges = (profile.stats.perfectDailyChallenges || 0) + 1;
    }
    SaveManager.save(profile);
  }

  function formatTime(totalSec) {
    const s = Math.floor(totalSec || 0);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${secs}s`;
  }

  function renderStats() {
    const s = profile.stats;
    const totalDefused = s.totalBombsDefused || 0;
    const totalFailed = s.totalBombsFailed || 0;
    const totalRuns = totalDefused + totalFailed;
    const rate = totalRuns > 0 ? Math.round((totalDefused / totalRuns) * 100) : 0;

    if (el.statBombsDefused) el.statBombsDefused.textContent = totalDefused.toLocaleString();
    if (el.statBombsFailed) el.statBombsFailed.textContent = totalFailed.toLocaleString();
    if (el.statSuccessRate) el.statSuccessRate.textContent = `${rate}%`;
    if (el.statTotalScore) el.statTotalScore.textContent = (s.totalScore || 0).toLocaleString();

    if (el.statBestStreak) el.statBestStreak.textContent = (profile.bestStreak || 0).toLocaleString();
    if (el.statFastestDefuse) {
      el.statFastestDefuse.textContent = s.fastestDefuseSeconds && s.fastestDefuseSeconds < 900 ? `${s.fastestDefuseSeconds.toFixed(2)}s` : "--";
    }
    if (el.statRulesMastered) el.statRulesMastered.textContent = `${(s.rulesMastered || []).length} / 6`;
    if (el.statDailiesWon) el.statDailiesWon.textContent = String(s.totalDailyChallengesCompleted || 0);

    if (el.statCoinsEarned) el.statCoinsEarned.textContent = (s.totalCoinsEarned || 0).toLocaleString();
    if (el.statCoinsSpent) el.statCoinsSpent.textContent = (s.totalCoinsSpent || 0).toLocaleString();
    if (el.statPowersUsed) el.statPowersUsed.textContent = String(s.totalPowersUsed || 0);
    if (el.statUpgradesBought) el.statUpgradesBought.textContent = String(s.totalUpgradesPurchased || 0);

    if (el.statPlayTime) el.statPlayTime.textContent = formatTime(s.totalPlayTimeSeconds || 0);
  }

  return {
    getStats,
    addPlayTime,
    recordDefuse,
    recordExplosion,
    recordPowerUsed,
    recordUpgradePurchased,
    recordCoinsSpent,
    recordDailyCompleted,
    renderStats,
  };
})();

/* =========================================================
   DAILY LOGIN REWARD (7-DAY SUPPLY CRATE)
========================================================= */
const LoginRewardManager = (() => {
  const rewards = [25, 30, 40, 50, 65, 80, 125];

  function getTodayLocalDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function getYesterdayLocalDate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getStatus() {
    const today = getTodayLocalDate();
    const yesterday = getYesterdayLocalDate();
    const lr = profile.loginReward;

    const claimedToday = lr.lastClaimDate === today;
    let currentStreakDay = lr.streakDay || 0;

    if (!claimedToday) {
      if (lr.lastClaimDate === yesterday) {
        currentStreakDay = (currentStreakDay % 7) + 1;
      } else {
        // Missed a day or first time
        currentStreakDay = 1;
      }
    }

    return {
      today,
      claimedToday,
      activeDay: currentStreakDay, // 1 to 7
      rewardAmount: rewards[currentStreakDay - 1],
    };
  }

  function renderGrid() {
    const { claimedToday, activeDay } = getStatus();
    if (!el.loginDaysGrid) return;
    el.loginDaysGrid.replaceChildren();

    rewards.forEach((amount, index) => {
      const dayNum = index + 1;
      const card = document.createElement("div");
      card.className = "login-day-card";

      let statusText = "LOCKED";
      if (claimedToday) {
        if (dayNum <= activeDay) {
          card.classList.add("claimed");
          statusText = "CLAIMED ✓";
        }
      } else {
        if (dayNum < activeDay) {
          card.classList.add("claimed");
          statusText = "CLAIMED ✓";
        } else if (dayNum === activeDay) {
          card.classList.add("active-today");
          statusText = "READY!";
        }
      }

      card.innerHTML = `
        <span class="login-day-num">DAY ${dayNum}</span>
        <span class="login-day-icon">${dayNum === 7 ? "💎" : "📦"}</span>
        <span class="login-day-reward">+${amount} ◆</span>
        <span class="login-day-status">${statusText}</span>
      `;
      el.loginDaysGrid.appendChild(card);
    });

    if (el.btnClaimLoginReward) {
      if (claimedToday) {
        el.btnClaimLoginReward.textContent = "CLAIMED FOR TODAY";
        el.btnClaimLoginReward.disabled = true;
        el.btnClaimLoginReward.classList.add("disabled");
      } else {
        el.btnClaimLoginReward.textContent = `CLAIM +${rewards[activeDay - 1]} COINS`;
        el.btnClaimLoginReward.disabled = false;
        el.btnClaimLoginReward.classList.remove("disabled");
      }
    }
  }

  let claiming = false;
  function claim() {
    if (claiming) return false;
    const status = getStatus();
    if (status.claimedToday) return false;
    claiming = true;

    profile.loginReward.lastClaimDate = status.today;
    profile.loginReward.streakDay = status.activeDay;

    CoinManager.addCoins(status.rewardAmount);
    AudioManager.playDailyRewardClaim();
    HapticsManager.dailyReward();
    showFloatingText(`+${status.rewardAmount} COINS!`, "var(--coin)");
    showToast(`DAY ${status.activeDay} REWARD CLAIMED! +${status.rewardAmount} ◆`, "success");

    SaveManager.save(profile);
    refreshPersistentUI();
    renderGrid();
    later(() => {
      claiming = false;
      showScreen("menu");
    }, 450);
    return true;
  }

  function checkAndShowOnMenu() {
    if (!profile.tutorialCompleted) return;
    const status = getStatus();
    if (!status.claimedToday) {
      renderGrid();
      showScreen("login-reward");
    }
  }

  return {
    getStatus,
    renderGrid,
    claim,
    checkAndShowOnMenu,
  };
})();

/* =========================================================
   DAILY GOALS MANAGER (3 ROTATING GOALS)
========================================================= */
const DailyGoalsManager = (() => {
  const goalDefinitions = [
    { id: "defuse_10", text: "Defuse 10 bombs in Normal Play", target: 10, reward: 50, type: "defuse" },
    { id: "fast_3", text: "Defuse 3 bombs with > 4.5s remaining", target: 3, reward: 75, type: "fast" },
    { id: "streak_6", text: "Reach a streak of 6 in one run", target: 6, reward: 60, type: "streak" },
    { id: "powers_2", text: "Use active powers 2 times", target: 2, reward: 50, type: "power" },
    { id: "coins_80", text: "Earn 80 coins across games", target: 80, reward: 65, type: "coins" },
    { id: "logic_4", text: "Defuse 4 relation or combination bombs", target: 4, reward: 80, type: "logic" },
    { id: "daily_3", text: "Defuse at least 3 Daily Challenge bombs", target: 3, reward: 75, type: "daily" },
    { id: "endurance_15", text: "Defuse 15 total bombs across modes", target: 15, reward: 90, type: "defuse_total" },
  ];

  function getUtcDateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function ensureGoals() {
    const today = getUtcDateKey();
    if (profile.dailyGoals.date === today && Array.isArray(profile.dailyGoals.goals) && profile.dailyGoals.goals.length === 3) {
      return profile.dailyGoals.goals;
    }

    const rng = createSeededRandom(today + "_goals_v1");
    const chosen = rng.shuffle(goalDefinitions).slice(0, 3).map(def => ({
      id: def.id,
      text: def.text,
      target: def.target,
      reward: def.reward,
      type: def.type,
      progress: 0,
      claimed: false,
    }));

    profile.dailyGoals = {
      date: today,
      goals: chosen,
    };
    SaveManager.save(profile);
    return chosen;
  }

  function onEvent(type, delta = 1, metadata = {}) {
    const goals = ensureGoals();
    let updated = false;

    goals.forEach(g => {
      if (g.claimed) return;
      if (type === "streak" && g.type === "streak") {
        const newProg = Math.min(g.target, Math.max(g.progress, delta));
        if (newProg !== g.progress) {
          g.progress = newProg;
          updated = true;
        }
      } else if (g.type === type) {
        g.progress = Math.min(g.target, g.progress + delta);
        updated = true;
      } else if (type === "defuse_total" && (g.type === "defuse" || g.type === "defuse_total")) {
        g.progress = Math.min(g.target, g.progress + delta);
        updated = true;
      }
    });

    if (updated) {
      SaveManager.save(profile);
      updateBadge();
    }
  }

  let claiming = false;
  function claim(index) {
    if (claiming) return false;
    const goals = ensureGoals();
    const goal = goals[index];
    if (!goal || goal.claimed || goal.progress < goal.target) return false;
    claiming = true;

    goal.claimed = true;
    CoinManager.addCoins(goal.reward);
    AudioManager.playGoalClaimed();
    HapticsManager.goalClaim();
    showFloatingText(`+${goal.reward} COINS!`, "var(--coin)");
    showToast(`GOAL COMPLETED! +${goal.reward} ◆`, "success");

    SaveManager.save(profile);
    refreshPersistentUI();
    render();
    updateBadge();
    window.setTimeout(() => { claiming = false; }, 200);
    return true;
  }

  function updateBadge() {
    const goals = ensureGoals();
    const claimableCount = goals.filter(g => !g.claimed && g.progress >= g.target).length;
    if (el.menuGoalsBadge) {
      if (claimableCount > 0) {
        el.menuGoalsBadge.textContent = `${claimableCount} !`;
        el.menuGoalsBadge.style.display = "inline-block";
        el.menuGoalsBadge.classList.add("pulse");
      } else {
        const remaining = goals.filter(g => !g.claimed).length;
        el.menuGoalsBadge.textContent = `${3 - remaining}/3`;
        el.menuGoalsBadge.style.display = "inline-block";
        el.menuGoalsBadge.classList.remove("pulse");
      }
    }
  }

  function render() {
    const goals = ensureGoals();
    if (!el.dailyGoalsList) return;
    el.dailyGoalsList.replaceChildren();

    goals.forEach((goal, idx) => {
      const isComplete = goal.progress >= goal.target;
      const isClaimed = goal.claimed;

      const card = document.createElement("article");
      card.className = `goal-card ${isComplete ? "completed" : ""} ${isClaimed ? "claimed" : ""}`;

      const pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));

      card.innerHTML = `
        <div class="goal-card-header">
          <div class="goal-card-info">
            <h2 class="goal-card-title">${goal.text}</h2>
            <div class="goal-card-reward"><span class="coin-icon" aria-hidden="true">◆</span> +${goal.reward} COINS</div>
          </div>
          <button class="goal-claim-btn ${isClaimed ? "is-claimed" : isComplete ? "can-claim" : ""}" type="button">
            ${isClaimed ? "CLAIMED ✓" : isComplete ? "CLAIM" : "IN PROGRESS"}
          </button>
        </div>
        <div class="goal-progress-wrap">
          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width: ${pct}%;"></div>
          </div>
          <span class="goal-progress-text">${goal.progress} / ${goal.target}</span>
        </div>
      `;

      const claimBtn = card.querySelector(".goal-claim-btn");
      if (isComplete && !isClaimed) {
        claimBtn.addEventListener("click", () => claim(idx));
      }

      el.dailyGoalsList.appendChild(card);
    });
  }

  return {
    ensureGoals,
    onEvent,
    claim,
    updateBadge,
    render,
  };
})();

/* =========================================================
   SESSION MILESTONE MANAGER (PER-RUN NORMAL PLAY)
========================================================= */
const MilestoneManager = (() => {
  const milestones = [
    { count: 5, reward: 10 },
    { count: 10, reward: 20 },
    { count: 20, reward: 35 },
    { count: 30, reward: 50 },
    { count: 50, reward: 100 },
  ];

  function check(bombsDefused, run) {
    if (!run || !run.achievedMilestones) return;
    milestones.forEach(m => {
      if (bombsDefused === m.count && !run.achievedMilestones.has(m.count)) {
        run.achievedMilestones.add(m.count);
        CoinManager.addCoins(m.reward);
        run.coinsEarned += m.reward;
        AudioManager.playMilestoneReward();
        HapticsManager.milestone();
        showFloatingText(`MILESTONE! +${m.reward} ◆`, "var(--accent)");
        showToast(`MILESTONE: ${m.count} BOMBS DEFUSED! +${m.reward} ◆`, "success");
      }
    });
  }

  function getNextMilestone(currentCount) {
    for (const m of milestones) {
      if (m.count > currentCount) {
        return m;
      }
    }
    return null;
  }

  return { check, getNextMilestone };
})();

/* =========================================================
   PERSONAL BESTS & RECORD TRACKING
========================================================= */
const PersonalBestsManager = (() => {
  function checkNormalRun(run) {
    const pb = profile.personalBests;
    let isNewRecord = false;
    let recordText = "";

    if (run.score > (pb.bestScore || 0)) {
      pb.bestScore = run.score;
      isNewRecord = true;
      recordText = "NEW BEST SCORE!";
    }
    if (run.bestStreak > (pb.bestStreak || 0)) {
      pb.bestStreak = run.bestStreak;
      isNewRecord = true;
      recordText = "NEW BEST STREAK!";
    }
    if (run.bombsDefused > (pb.mostBombsRun || 0)) {
      pb.mostBombsRun = run.bombsDefused;
    }
    if (run.coinsEarned > (pb.mostCoinsRun || 0)) {
      pb.mostCoinsRun = run.coinsEarned;
    }

    if (isNewRecord) {
      SaveManager.save(profile);
      AudioManager.playNewRecord();
      HapticsManager.newRecord();
      showFloatingText(recordText, "var(--good)");
    }
    return { isNewRecord, recordText };
  }

  function checkFastestDefuse(timeTaken) {
    const pb = profile.personalBests;
    if (!pb.fastestDefuse || pb.fastestDefuse <= 0 || timeTaken < pb.fastestDefuse) {
      pb.fastestDefuse = Number(timeTaken.toFixed(2));
      SaveManager.save(profile);
    }
  }

  return { checkNormalRun, checkFastestDefuse };
})();

/* =========================================================
   SHARE RESULT MANAGER
========================================================= */
const ShareManager = {
  async shareNormal(score, streak, bombs) {
    const text = `💣 BOMB DEFUSE\nScore: ${score.toLocaleString()}\nStreak: ${streak} 🔥\nBombs Defused: ${bombs} ✂\nCan you beat my score?`;
    await this._doShare(text, "Bomb Defuse Result");
  },

  async shareDaily(dayNum, score, bombs, isVictory) {
    const resultIcon = isVictory ? "7/7 ✓" : `${bombs}/7`;
    const text = `💣 BOMB DEFUSE — DAILY CHALLENGE\nDay ${dayNum} · ${resultIcon}\nScore: ${score.toLocaleString()}\nCan you beat my score today?`;
    await this._doShare(text, `Bomb Defuse Day ${dayNum}`);
  },

  async _doShare(text, title) {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: window.location.href });
        AudioManager.playShareCopied();
        showToast("SHARED SUCCESSFULLY!", "success");
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    // Fallback: Copy to clipboard
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      AudioManager.playShareCopied();
      showToast("RESULT COPIED TO CLIPBOARD!", "success");
    } catch {
      showToast("UNABLE TO COPY RESULT", "neutral");
    }
  },
};

/* =========================================================
   PHASE 9A: REAL FIREBASE BACKEND INTEGRATION LAYER
========================================================= */
const AUTH_CONFIG = {
  googleEnabled: false,
  facebookEnabled: false,
  emailEnabled: false,
};

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA8hs_8wY570oHBg_-eE0z7ObFLmJGpE2Y",
  authDomain: "bomb-defuse-0428.firebaseapp.com",
  projectId: "bomb-defuse-0428",
  storageBucket: "bomb-defuse-0428.firebasestorage.app",
  messagingSenderId: "1036895238881",
  appId: "1:1036895238881:web:5efadcfca4e53865c2d5a0",
  measurementId: "G-8TV39CN4V9"
};

const FirebaseManager = (() => {
  let app = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let authStateListeners = [];
  let isInitialized = false;

  function isConfigured() {
    return Boolean(
      FIREBASE_CONFIG &&
      FIREBASE_CONFIG.apiKey &&
      typeof FIREBASE_CONFIG.apiKey === "string" &&
      FIREBASE_CONFIG.apiKey.trim().length > 0 &&
      FIREBASE_CONFIG.apiKey !== "FIREBASE_API_KEY_PLACEHOLDER" &&
      FIREBASE_CONFIG.projectId &&
      typeof FIREBASE_CONFIG.projectId === "string" &&
      FIREBASE_CONFIG.projectId.trim().length > 0
    );
  }

  function isAvailable() {
    const hasSdk = typeof window !== "undefined" && (Boolean(window.firebase) || Boolean(auth));
    return isConfigured() && hasSdk;
  }

  function getDb() {
    if (!db && typeof window !== "undefined" && window.firebase && typeof window.firebase.firestore === "function") {
      try {
        db = window.firebase.firestore();
      } catch (e) {
        console.warn("[FirebaseManager] Firestore getDb warning:", e);
      }
    }
    return db;
  }

  function initialize() {
    if (isInitialized) return;
    isInitialized = true;

    if (!isConfigured()) {
      console.info("[FirebaseManager] Backend not configured. Running in Guest Mode with local saves.");
      return;
    }

    try {
      if (typeof window !== "undefined" && window.firebase) {
        if (!window.firebase.apps || window.firebase.apps.length === 0) {
          app = window.firebase.initializeApp(FIREBASE_CONFIG);
        } else {
          app = window.firebase.apps[0];
        }
        auth = window.firebase.auth();
        if (typeof window.firebase.firestore === "function") {
          try {
            db = window.firebase.firestore();
          } catch (e) {
            console.warn("[FirebaseManager] Firestore initialization warning:", e);
          }
        }

        // Register persistent auth state change listener
        auth.onAuthStateChanged((user) => {
          currentUser = user;
          authStateListeners.forEach((fn) => {
            try { fn(user); } catch (e) { console.error("[FirebaseManager] Auth listener callback error:", e); }
          });
        }, (err) => {
          console.warn("[FirebaseManager] onAuthStateChanged warning:", err);
        });
      } else {
        console.warn("[FirebaseManager] Firebase Web SDK script is not available.");
      }
    } catch (err) {
      console.warn("[FirebaseManager] Firebase initialization failed:", err);
    }
  }

  function onAuthStateChanged(callback) {
    if (typeof callback === "function") {
      authStateListeners.push(callback);
      if (currentUser !== null) {
        try { callback(currentUser); } catch (e) {}
      }
    }
  }

  function formatAuthError(err) {
    if (!err) return "An unknown authentication error occurred.";
    const code = err.code || "";
    switch (code) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/user-disabled":
        return "This account has been disabled by an administrator.";
      case "auth/user-not-found":
        return "No registered account found with this email.";
      case "auth/wrong-password":
      case "auth/invalid-credential":
      case "auth/invalid-login-credentials":
        return "Invalid email or password. Please try again.";
      case "auth/email-already-in-use":
        return "This email is already registered. Please sign in instead.";
      case "auth/weak-password":
        return "Password is too weak. Please use at least 6 characters.";
      case "auth/popup-blocked":
        return "Login popup was blocked by your browser. Please allow popups.";
      case "auth/popup-closed-by-user":
        return "Login popup was closed before completing authentication.";
      case "auth/cancelled-popup-request":
        return "Authentication request was cancelled.";
      case "auth/account-exists-with-different-credential":
        return "An account already exists with this email under a different sign-in method.";
      case "auth/operation-not-allowed":
        return "This authentication provider is not configured yet in the project.";
      case "auth/configuration-not-found":
        return "This authentication provider is not configured yet.";
      case "auth/requires-recent-login":
        return "This sensitive action requires recent authentication. Please sign in again.";
      case "auth/too-many-requests":
        return "Too many requests. Please wait a moment and try again.";
      case "auth/network-request-failed":
        return "Network connection unavailable. Please check your internet connection.";
      case "auth/internal-error":
        return "Firebase authentication encountered an internal error. Please try again.";
      case "auth/unauthorized-domain":
        return "This domain is not authorized in the Firebase Console OAuth redirect list.";
      default:
        return err.message ? err.message.replace(/Firebase:\s*/, "") : "Authentication failed.";
    }
  }

  async function signInWithGoogle() {
    if (!isConfigured()) {
      return { success: false, reason: "NOT_CONFIGURED", message: "Firebase is not configured. Please supply credentials in FIREBASE_CONFIG." };
    }
    if (!isAvailable()) {
      return { success: false, reason: "SDK_UNAVAILABLE", message: "Firebase SDK is unavailable. Check network connectivity." };
    }
    try {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      const result = await auth.signInWithPopup(provider);
      currentUser = result.user;
      return { success: true, user: result.user };
    } catch (err) {
      return { success: false, reason: err.code || "GOOGLE_AUTH_ERROR", message: formatAuthError(err) };
    }
  }

  async function signInWithFacebook() {
    if (!isConfigured()) {
      return { success: false, reason: "NOT_CONFIGURED", message: "Firebase is not configured. Please supply credentials in FIREBASE_CONFIG." };
    }
    if (!isAvailable()) {
      return { success: false, reason: "SDK_UNAVAILABLE", message: "Firebase SDK is unavailable. Check network connectivity." };
    }
    try {
      const provider = new window.firebase.auth.FacebookAuthProvider();
      provider.addScope("public_profile");
      provider.addScope("email");
      const result = await auth.signInWithPopup(provider);
      currentUser = result.user;
      return { success: true, user: result.user };
    } catch (err) {
      return { success: false, reason: err.code || "FACEBOOK_AUTH_ERROR", message: formatAuthError(err) };
    }
  }

  async function signInWithEmail(email, password) {
    if (!isConfigured()) {
      return { success: false, reason: "NOT_CONFIGURED", message: "Firebase is not configured. Please supply credentials in FIREBASE_CONFIG." };
    }
    if (!isAvailable()) {
      return { success: false, reason: "SDK_UNAVAILABLE", message: "Firebase SDK is unavailable. Check network connectivity." };
    }
    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      currentUser = result.user;
      return { success: true, user: result.user };
    } catch (err) {
      return { success: false, reason: err.code || "EMAIL_AUTH_ERROR", message: formatAuthError(err) };
    }
  }

  async function signUpWithEmail(displayName, email, password) {
    if (!isConfigured()) {
      return { success: false, reason: "NOT_CONFIGURED", message: "Firebase is not configured. Please supply credentials in FIREBASE_CONFIG." };
    }
    if (!isAvailable()) {
      return { success: false, reason: "SDK_UNAVAILABLE", message: "Firebase SDK is unavailable. Check network connectivity." };
    }
    try {
      const result = await auth.createUserWithEmailAndPassword(email, password);
      currentUser = result.user;
      if (displayName && result.user && typeof result.user.updateProfile === "function") {
        await result.user.updateProfile({ displayName: displayName.trim().slice(0, 20) });
      }
      return { success: true, user: result.user };
    } catch (err) {
      return { success: false, reason: err.code || "REGISTER_ERROR", message: formatAuthError(err) };
    }
  }

  async function sendPasswordReset(email) {
    if (!isConfigured()) {
      return { success: false, reason: "NOT_CONFIGURED", message: "Firebase is not configured. Please supply credentials in FIREBASE_CONFIG." };
    }
    if (!isAvailable()) {
      return { success: false, reason: "SDK_UNAVAILABLE", message: "Firebase SDK is unavailable. Check network connectivity." };
    }
    try {
      await auth.sendPasswordResetEmail(email);
      return { success: true, message: `Password reset link sent to ${email}. Check your inbox.` };
    } catch (err) {
      return { success: false, reason: err.code || "RESET_ERROR", message: formatAuthError(err) };
    }
  }

  async function signOut() {
    if (!isAvailable() || !auth) {
      currentUser = null;
      return { success: true };
    }
    try {
      await auth.signOut();
      currentUser = null;
      return { success: true };
    } catch (err) {
      return { success: false, reason: err.code || "SIGNOUT_ERROR", message: formatAuthError(err) };
    }
  }

  async function deleteAccount() {
    const active = currentUser || (auth ? auth.currentUser : null);
    if (!active) {
      return { success: true, message: "No active Firebase session to delete." };
    }
    try {
      await active.delete();
      currentUser = null;
      return { success: true };
    } catch (err) {
      return { success: false, reason: err.code || "DELETE_ERROR", message: formatAuthError(err) };
    }
  }

  return {
    initialize,
    isConfigured,
    isAvailable,
    getDb,
    onAuthStateChanged,
    formatAuthError,
    signInWithGoogle,
    signInWithFacebook,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signOut,
    deleteAccount,
    getCurrentUser: () => currentUser || (auth ? auth.currentUser : null),
  };
})();

/* =========================================================
   AUTH PROVIDERS (ADAPTER LAYER)
========================================================= */
const GoogleAuthProvider = {
  id: "google",
  name: "Google",
  initialize() {},
  isAvailable() { return FirebaseManager.isAvailable(); },
  async login() {
    return await FirebaseManager.signInWithGoogle();
  },
  async logout() {
    return await FirebaseManager.signOut();
  },
  getUser() {
    return FirebaseManager.getCurrentUser();
  },
};

const FacebookAuthProvider = {
  id: "facebook",
  name: "Facebook",
  initialize() {},
  isAvailable() { return FirebaseManager.isAvailable(); },
  async login() {
    return await FirebaseManager.signInWithFacebook();
  },
  async logout() {
    return await FirebaseManager.signOut();
  },
  getUser() {
    return FirebaseManager.getCurrentUser();
  },
};

const EmailAuthProvider = {
  id: "email",
  name: "Email",
  initialize() {},
  isAvailable() { return FirebaseManager.isAvailable(); },
  async login(email, password) {
    return await FirebaseManager.signInWithEmail(email, password);
  },
  async register(displayName, email, password) {
    return await FirebaseManager.signUpWithEmail(displayName, email, password);
  },
  async sendPasswordReset(email) {
    return await FirebaseManager.sendPasswordReset(email);
  },
  async logout() {
    return await FirebaseManager.signOut();
  },
  getUser() {
    return FirebaseManager.getCurrentUser();
  },
};

const GuestAuthProvider = {
  id: "guest",
  name: "Guest",
  initialize() {},
  isAvailable() { return true; },
  async login() {
    return {
      success: true,
      user: {
        userId: "guest_" + (profile?.account?.userId?.replace(/^guest_/, "") || Date.now().toString(36)),
        displayName: profile?.account?.displayName || "Guest",
        avatar: profile?.account?.avatar || "bomb",
        provider: "guest",
        mode: "guest",
        createdAt: profile?.account?.createdAt || new Date().toISOString().slice(0, 10),
      },
    };
  },
  async logout() { return { success: true }; },
  getUser() {
    return {
      userId: profile?.account?.userId || "guest_local",
      displayName: profile?.account?.displayName || "Guest",
      avatar: profile?.account?.avatar || "bomb",
      provider: "guest",
      mode: "guest",
      createdAt: profile?.account?.createdAt || new Date().toISOString().slice(0, 10),
    };
  },
};

/* =========================================================
   AUTH MANAGER (MAIN ACCOUNT INTERFACE)
========================================================= */
const AuthManager = (() => {
  const providers = {
    google: GoogleAuthProvider,
    facebook: FacebookAuthProvider,
    email: EmailAuthProvider,
    guest: GuestAuthProvider,
  };

  const AVATARS = {
    bomb: { id: "bomb", icon: "💣", name: "Bomb" },
    defuser: { id: "defuser", icon: "⚡", name: "Defuser" },
    shield: { id: "shield", icon: "🛡", name: "Shield" },
    lightning: { id: "lightning", icon: "↯", name: "Lightning" },
    circuit: { id: "circuit", icon: "🔌", name: "Circuit" },
    skull: { id: "skull", icon: "💀", name: "Skull" },
    robot: { id: "robot", icon: "🤖", name: "Robot" },
  };

  function initialize() {
    FirebaseManager.initialize();
    FirebaseManager.onAuthStateChanged((user) => {
      handleAuthStateChanged(user);
    });
  }

  async function handleAuthStateChanged(user) {
    if (user) {
      let providerName = "email";
      if (user.providerData && user.providerData.length > 0) {
        const pid = user.providerData[0].providerId;
        if (pid.includes("google")) providerName = "google";
        else if (pid.includes("facebook")) providerName = "facebook";
        else if (pid.includes("password")) providerName = "email";
      }

      profile.account.mode = "registered";
      profile.account.provider = providerName;
      profile.account.userId = user.uid;
      profile.account.email = user.email || profile.account.email || "";

      if (user.displayName && (!profile.account.displayName || profile.account.displayName === "Guest")) {
        const val = validateDisplayName(user.displayName);
        if (val.valid) {
          profile.account.displayName = val.name;
        }
      }

      // Save credentials locally first (do not immediate upload until cloud is downloaded and merged)
      LocalSaveManager.save(profile);
      updateMenuAccountBadge();
      updateNetworkBadge();

      // Initiate cloud download, deterministic merge, and upload
      if (typeof CloudSaveManager !== "undefined" && typeof CloudSaveManager.sync === "function") {
        showToast("SYNCING ACCOUNT...", "neutral", 2500);
        try {
          const syncRes = await CloudSaveManager.sync();
          if (syncRes.status === "MERGED" || syncRes.status === "FIRST_UPLOAD_SUCCESS") {
            showToast("ACCOUNT SYNCED", "success", 2500);
          }
        } catch (err) {
          console.warn("[AuthManager] CloudSave sync error:", err);
        }
      }

      refreshPersistentUI();
      updateMenuAccountBadge();
      updateNetworkBadge();
      DailyGoalsManager.updateBadge();
      AchievementUI.updateBadge();

      // Automatically navigate from auth screens to main menu
      if (screens["login"]?.classList.contains("active") || 
          screens["register"]?.classList.contains("active") || 
          screens["forgot-password"]?.classList.contains("active")) {
        returnToMenu();
      }
    } else {
      if (typeof CloudSaveManager !== "undefined") {
        CloudSaveManager.setHasCloudSave?.(false);
      }
      updateMenuAccountBadge();
      updateNetworkBadge();
    }
  }

  function isAuthenticated() {
    return Boolean(profile.account && profile.account.mode === "registered" && profile.account.userId);
  }

  function getCurrentUser() {
    return profile.account;
  }

  function getAvatarDef(avatarId) {
    return AVATARS[avatarId] || AVATARS.bomb;
  }

  function validateDisplayName(rawName) {
    if (typeof rawName !== "string") return { valid: false, error: "Display name must be text." };
    const trimmed = rawName.trim();
    if (trimmed.length < 3) return { valid: false, error: "Name must be at least 3 characters." };
    if (trimmed.length > 20) return { valid: false, error: "Name cannot exceed 20 characters." };
    if (/[<>]/.test(trimmed) || /<[^>]*>/i.test(trimmed) || /javascript:/i.test(trimmed) || /onerror\s*=|onload\s*=/i.test(trimmed)) {
      return { valid: false, error: "Name cannot contain HTML or script characters." };
    }
    if (/^[^\w\s]+$/.test(trimmed)) return { valid: false, error: "Name must contain letters or numbers." };
    if (/(.)\1{4,}/i.test(trimmed)) return { valid: false, error: "Name contains too many repeated characters." };
    
    const blocked = ["admin", "moderator", "root", "system", "null", "undefined"];
    if (blocked.includes(trimmed.toLowerCase())) {
      return { valid: false, error: "This display name is reserved." };
    }
    return { valid: true, name: trimmed };
  }

  function setDisplayName(name) {
    const val = validateDisplayName(name);
    if (!val.valid) return val;
    profile.account.displayName = val.name;
    SaveManager.save(profile);
    AudioManager.playProfileSaved();
    HapticsManager.profileSaved();
    updateMenuAccountBadge();
    return { valid: true, name: val.name };
  }

  function setAvatar(avatarId) {
    if (AVATARS[avatarId]) {
      profile.account.avatar = avatarId;
      SaveManager.save(profile);
      AudioManager.playProfileSaved();
      HapticsManager.profileSaved();
      updateMenuAccountBadge();
      return true;
    }
    return false;
  }

  async function loginWithGoogle() {
    const res = await providers.google.login();
    if (res.success && res.user) {
      await handleAuthStateChanged(res.user);
      AudioManager.playProfileSaved();
      HapticsManager.profileSaved();
      showToast(`SIGNED IN AS ${profile.account.displayName.toUpperCase()}`, "success", 2500);
      return { success: true, user: res.user };
    }
    return res;
  }

  async function loginWithFacebook() {
    const res = await providers.facebook.login();
    if (res.success && res.user) {
      await handleAuthStateChanged(res.user);
      AudioManager.playProfileSaved();
      HapticsManager.profileSaved();
      showToast(`SIGNED IN AS ${profile.account.displayName.toUpperCase()}`, "success", 2500);
      return { success: true, user: res.user };
    }
    return res;
  }

  async function loginWithEmail(email, password) {
    const res = await providers.email.login(email, password);
    if (res.success && res.user) {
      await handleAuthStateChanged(res.user);
      AudioManager.playProfileSaved();
      HapticsManager.profileSaved();
      showToast(`SIGNED IN AS ${profile.account.displayName.toUpperCase()}`, "success", 2500);
      return { success: true, user: res.user };
    }
    return res;
  }

  async function registerWithEmail(displayName, email, password) {
    const res = await providers.email.register(displayName, email, password);
    if (res.success && res.user) {
      if (displayName) {
        const val = validateDisplayName(displayName);
        if (val.valid) profile.account.displayName = val.name;
      }
      await handleAuthStateChanged(res.user);
      AudioManager.playProfileSaved();
      HapticsManager.profileSaved();
      showToast("ACCOUNT CREATED SUCCESSFULLY!", "success", 2500);
      return { success: true, user: res.user };
    }
    return res;
  }

  async function sendPasswordReset(email) {
    return await providers.email.sendPasswordReset(email);
  }

  function continueAsGuest() {
    profile.account.mode = "guest";
    profile.account.provider = "guest";
    SaveManager.save(profile);
    updateMenuAccountBadge();
    showToast("PLAYING AS GUEST · LOCAL SAVE", "neutral", 2500);
    showScreen("menu");
  }

  async function logout() {
    await FirebaseManager.signOut();
    profile.account.mode = "guest";
    profile.account.provider = "guest";
    if (typeof CloudSaveManager !== "undefined") {
      CloudSaveManager.setHasCloudSave?.(false);
    }
    SaveManager.save(profile);
    AudioManager.playLogout();
    HapticsManager.logout();
    updateMenuAccountBadge();
    showToast("LOGGED OUT · GUEST MODE", "neutral", 2500);
    showScreen("menu");
  }

  async function deleteAccount() {
    if (isAuthenticated()) {
      const res = await FirebaseManager.deleteAccount();
      if (!res.success && res.reason === "auth/requires-recent-login") {
        showToast("PLEASE SIGN IN AGAIN BEFORE DELETING ACCOUNT", "danger");
        return;
      }
    }
    profile = SaveManager.reset();
    AudioManager.playLogout();
    HapticsManager.logout();
    refreshPersistentUI();
    updateMenuAccountBadge();
    DailyGoalsManager.updateBadge();
    showToast("ACCOUNT AND LOCAL DATA DELETED", "danger");
    showScreen("menu");
  }

  return {
    initialize,
    isAuthenticated,
    getCurrentUser,
    getAvatarDef,
    AVATARS,
    validateDisplayName,
    setDisplayName,
    setAvatar,
    loginWithGoogle,
    loginWithFacebook,
    loginWithEmail,
    registerWithEmail,
    sendPasswordReset,
    continueAsGuest,
    logout,
    deleteAccount,
  };
})();

/* =========================================================
   PHASE 9A: ANALYTICS INTEGRATION BOUNDARY
========================================================= */
const AnalyticsManager = (() => {
  let isInitialized = false;

  function isEnabled() {
    return Boolean(ConsentManager && ConsentManager.hasConsent("analytics"));
  }

  function initialize() {
    if (isInitialized) return;
    isInitialized = true;
  }

  function logEvent(eventName, params = {}) {
    if (!isEnabled()) return;
    if (typeof eventName !== "string" || !eventName) return;

    // Strict privacy protection: strip sensitive keys
    const sanitizedParams = {};
    const sensitiveKeys = ["password", "token", "credential", "apikey", "secret", "email", "location", "lat", "lng", "contact"];
    Object.entries(params).forEach(([k, v]) => {
      const lower = k.toLowerCase();
      if (!sensitiveKeys.some(sk => lower.includes(sk))) {
        if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
          sanitizedParams[k] = v;
        }
      }
    });

    try {
      if (typeof window !== "undefined" && window.firebase && typeof window.firebase.analytics === "function") {
        window.firebase.analytics().logEvent(eventName, sanitizedParams);
      }
    } catch (err) {
      // Non-blocking telemetry
    }
  }

  return { initialize, isEnabled, logEvent };
})();

/* =========================================================
   CONSENT & PRIVACY MANAGERS
========================================================= */
const ConsentManager = (() => {
  function hasConsent(type) {
    if (type === "essential") return true;
    return Boolean(profile?.consent?.[type]);
  }

  function setConsent(type, val) {
    if (type === "essential") return;
    if (!profile.consent) profile.consent = { essential: true, analytics: false, personalizedAds: false };
    if (!profile.privacy) profile.privacy = { analytics: false, personalizedAds: false };
    profile.consent[type] = Boolean(val);
    profile.privacy[type] = Boolean(val);
    SaveManager.save(profile);
  }

  return { hasConsent, setConsent };
})();

/* =========================================================
   DATA EXPORT MANAGER
========================================================= */
const DataExportManager = {
  exportData() {
    const exportPayload = {
      game: "Bomb Defuse",
      version: profile.version || 3,
      exportedAt: new Date().toISOString(),
      account: {
        mode: profile.account?.mode || "guest",
        provider: profile.account?.provider || "guest",
        displayName: profile.account?.displayName || "Guest",
        avatar: profile.account?.avatar || "bomb",
        createdAt: profile.account?.createdAt || "",
      },
      stats: profile.stats || {},
      personalBests: profile.personalBests || {},
      achievements: {
        unlocked: profile.achievements?.unlocked || [],
        unlockedDates: profile.achievements?.unlockedDates || {},
      },
      economy: {
        coins: profile.coins || 0,
        upgrades: profile.upgrades || {},
        powers: profile.powers || {},
      },
      retention: {
        dailyGoals: profile.dailyGoals || {},
        loginReward: profile.loginReward || {},
        daily: profile.daily || {},
      },
      privacy: profile.privacy || {},
      consent: profile.consent || {},
    };

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bomb-defuse-player-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    AudioManager.playDataExported();
    showToast("PLAYER DATA EXPORTED AS JSON", "success");
  },
};

/* =========================================================
   PROFILE & SETTINGS UI CONTROLLERS
========================================================= */
function updateMenuAccountBadge() {
  const acc = profile.account;
  const avatarDef = AuthManager.getAvatarDef(acc.avatar);
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const netText = isOnline ? "ONLINE" : "OFFLINE";
  const isRegistered = Boolean(acc.mode === "registered" && acc.userId);

  // Top-Right Avatar button
  if (el.menuAvatarIcon) {
    el.menuAvatarIcon.textContent = isRegistered ? avatarDef.icon : "💣";
  }

  // Popup Menu elements
  if (el.popupAvatarIcon) {
    el.popupAvatarIcon.textContent = isRegistered ? avatarDef.icon : "💣";
  }
  if (el.popupDisplayName) {
    el.popupDisplayName.textContent = acc.displayName || (isRegistered ? "Player" : "Guest");
  }
  if (el.popupEmail) {
    el.popupEmail.textContent = isRegistered ? (acc.email || acc.provider.toUpperCase()) : "GUEST";
  }
  if (el.popupStatusText) {
    el.popupStatusText.textContent = netText;
  }
  if (el.popupStatusDot) {
    el.popupStatusDot.textContent = isOnline ? "●" : "○";
  }
  if (el.popupAuthActions) {
    el.popupAuthActions.style.display = isRegistered ? "flex" : "none";
  }
  if (el.popupGuestActions) {
    el.popupGuestActions.style.display = isRegistered ? "none" : "flex";
  }

  // Fallback legacy badge elements
  if (el.menuDisplayName) el.menuDisplayName.textContent = acc.displayName || "Guest";
  if (el.menuAccountStatus) {
    el.menuAccountStatus.textContent = isRegistered ? `${acc.provider.toUpperCase()} · ${netText}` : `DEVICE SAVE · ${netText}`;
  }
  if (el.guestNoticeBanner) {
    el.guestNoticeBanner.style.display = isRegistered ? "none" : "block";
  }
  const btnPlay = byId("btn-play");
  if (btnPlay) {
    btnPlay.textContent = isRegistered ? "PLAY NORMAL" : "PLAY AS GUEST";
  }
}

function updateNetworkBadge() {
  updateMenuAccountBadge();
  if (el.profileNetworkVal) {
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    el.profileNetworkVal.textContent = isOnline ? "ONLINE" : "OFFLINE";
  }
}

const ProfileUI = {
  render() {
    const acc = profile.account;
    const avatarDef = AuthManager.getAvatarDef(acc.avatar);
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

    if (el.profileAvatarLarge) el.profileAvatarLarge.textContent = avatarDef.icon;
    if (el.profileDisplayNameVal) el.profileDisplayNameVal.textContent = acc.displayName || "Guest";
    if (el.profileProviderPill) {
      el.profileProviderPill.textContent = acc.mode === "registered" ? `${acc.provider.toUpperCase()} ACCOUNT` : "GUEST · LOCAL SAVE";
    }
    if (el.profileCreatedAtVal) el.profileCreatedAtVal.textContent = acc.createdAt || new Date().toISOString().slice(0, 10);
    if (el.profileNetworkVal) el.profileNetworkVal.textContent = isOnline ? "ONLINE" : "OFFLINE";
    if (el.profileStorageVal) el.profileStorageVal.textContent = acc.mode === "registered" ? "CLOUD & LOCAL" : "THIS DEVICE";

    // Quick Stats
    const s = profile.stats;
    if (el.profileStatDefused) el.profileStatDefused.textContent = (s.totalBombsDefused || 0).toLocaleString();
    if (el.profileStatScore) el.profileStatScore.textContent = (profile.bestScore || 0).toLocaleString();
    if (el.profileStatStreak) el.profileStatStreak.textContent = (profile.bestStreak || 0).toLocaleString();
    if (el.profileStatDailies) el.profileStatDailies.textContent = String(s.totalDailyChallengesCompleted || 0);

    if (el.btnProfileCreateAccount) {
      el.btnProfileCreateAccount.style.display = acc.mode === "registered" ? "none" : "block";
    }
  },
};

const AvatarPickerUI = {
  selectedAvatar: "bomb",
  render() {
    this.selectedAvatar = profile.account.avatar || "bomb";
    if (!el.avatarGrid) return;
    el.avatarGrid.replaceChildren();

    Object.values(AuthManager.AVATARS).forEach(av => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `avatar-card ${av.id === this.selectedAvatar ? "selected" : ""}`;
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", av.id === this.selectedAvatar ? "true" : "false");
      card.innerHTML = `
        <span class="avatar-card-icon" aria-hidden="true">${av.icon}</span>
        <span class="avatar-card-name">${av.name}</span>
      `;
      card.addEventListener("click", () => this.select(av.id));
      el.avatarGrid.appendChild(card);
    });
  },

  select(avatarId) {
    this.selectedAvatar = avatarId;
    if (el.avatarGrid) {
      Array.from(el.avatarGrid.children).forEach((child, idx) => {
        const id = Object.keys(AuthManager.AVATARS)[idx];
        const isSel = id === avatarId;
        child.classList.toggle("selected", isSel);
        child.setAttribute("aria-checked", isSel ? "true" : "false");
      });
    }
  },

  save() {
    AuthManager.setAvatar(this.selectedAvatar);
    ProfileUI.render();
    SettingsUI.render();
    showScreen("profile");
    showToast("AVATAR UPDATED", "success");
  },
};

const SettingsUI = {
  render() {
    const acc = profile.account;
    const avatarDef = AuthManager.getAvatarDef(acc.avatar);

    if (el.settingsDisplayNameVal) el.settingsDisplayNameVal.textContent = acc.displayName || "Guest";
    if (el.settingsAvatarVal) el.settingsAvatarVal.textContent = `${avatarDef.name} (${avatarDef.icon})`;
    if (el.settingsProviderVal) {
      el.settingsProviderVal.textContent = acc.mode === "registered" ? `${acc.provider.toUpperCase()}` : "Guest (Local Save)";
    }
    if (el.settingsCloudBadge) {
      el.settingsCloudBadge.textContent = acc.mode === "registered" ? "CLOUD SYNC" : "LOCAL ONLY";
    }
    if (el.settingsStatusVal) el.settingsStatusVal.textContent = "Active";

    if (el.btnToggleAnalytics) {
      const active = Boolean(profile.privacy?.analytics);
      el.btnToggleAnalytics.textContent = active ? "ON" : "OFF";
      el.btnToggleAnalytics.classList.toggle("on", active);
    }
    if (el.btnToggleAds) {
      const active = Boolean(profile.privacy?.personalizedAds);
      el.btnToggleAds.textContent = active ? "ON" : "OFF";
      el.btnToggleAds.classList.toggle("on", active);
    }
    if (el.btnSettingsToggleSound) {
      el.btnSettingsToggleSound.textContent = profile.soundEnabled ? "ON" : "OFF";
      el.btnSettingsToggleSound.classList.toggle("on", profile.soundEnabled);
    }
    if (el.btnSettingsToggleMotion) {
      const prefersReduced = Boolean(document.body.classList.contains("reduced-motion-override"));
      el.btnSettingsToggleMotion.textContent = prefersReduced ? "ON" : "OFF";
      el.btnSettingsToggleMotion.classList.toggle("on", prefersReduced);
    }
  },
};

/* =========================================================
   GAME CONTROLLER & LOOP
========================================================= */
function startGame() {
  clearPendingTransitions();
  Timer.stop();
  PowerManager.cleanup();
  AudioManager.init();
  gameMode = "NORMAL";
  run = newRun();
  state = "PLAYING";
  if (el.dailyHudBanner) el.dailyHudBanner.style.display = "none";
  showScreen("game");
  updateHud();
  updatePowerUI();
  nextBomb();
}

function startDailyChallenge() {
  DailyChallengeManager.ensureDateSync();
  if (profile.daily.status === "COMPLETED") {
    showToast("DAILY CHALLENGE COMPLETED TODAY", "neutral");
    return;
  }
  if (profile.daily.status === "FAILED") {
    showToast("DAILY ATTEMPT ALREADY USED TODAY", "neutral");
    return;
  }

  clearPendingTransitions();
  Timer.stop();
  PowerManager.cleanup();
  AudioManager.init();
  gameMode = "DAILY";

  if (!cachedDailyChallenge) {
    cachedDailyChallenge = DailyChallengeManager.generateDailyChallenge();
  }

  run = newRun();
  run.totalTimeRemaining = 0;

  // Restore progression safely if resuming an in-progress challenge
  if (profile.daily.status === "IN_PROGRESS" && profile.daily.bombsCompleted > 0 && profile.daily.bombsCompleted < 7) {
    run.bombNumber = profile.daily.bombsCompleted + 1;
    run.bombsDefused = profile.daily.bombsCompleted;
    run.score = profile.daily.score;
  } else {
    profile.daily.status = "IN_PROGRESS";
    profile.daily.bombsCompleted = 0;
    profile.daily.score = 0;
    SaveManager.save(profile);
  }

  state = "PLAYING";
  showScreen("game");
  AudioManager.playDailyStart();

  if (el.dailyHudBanner) {
    el.dailyHudBanner.style.display = "flex";
    if (el.dailyHudDay) el.dailyHudDay.textContent = `DAY ${DailyChallengeManager.getDayNumber()}`;
  }

  updateDailyTrackerUI();
  updateHud();
  updatePowerUI();
  nextBomb();
}

function nextBomb() {
  if (state !== "PLAYING") return;
  run.inputLocked = false;

  if (gameMode === "DAILY") {
    if (!cachedDailyChallenge) {
      cachedDailyChallenge = DailyChallengeManager.generateDailyChallenge();
    }
    const stageIndex = Math.min(GameConfig.daily.bombCount - 1, Math.max(0, run.bombNumber - 1));
    const bombDef = cachedDailyChallenge[stageIndex];
    run.bomb = {
      number: run.bombNumber,
      wires: bombDef.wires.map(w => ({ ...w })),
      time: bombDef.time + UpgradeManager.timeBonus(),
      challenge: bombDef.challenge,
    };
    el.hudBombLabel.textContent = `BOMB ${run.bomb.number} / 7`;
    updateDailyTrackerUI();
  } else {
    run.bomb = BombFactory.create(run.bombNumber, run);
    el.hudBombLabel.textContent = `BOMB ${run.bomb.number}`;
  }

  el.bomb.classList.remove("exploding", "shaking", "success-pulse", "failure-pulse");
  setBombStatus("ARMING");
  el.instruction.textContent = run.bomb.challenge.text;
  renderWires(run.bomb.wires);
  AudioManager.resetTickTracker();
  PowerManager.clearScanner();
  updatePowerUI();
  later(() => { if (state === "PLAYING" && !PowerManager.isFrozen) setBombStatus("ARMED"); }, 180);
  Timer.start(run.bomb.time, renderTimer, () => explode("TIME'S UP!"));
}

function renderWires(wires) {
  el.wiresContainer.replaceChildren();
  wires.forEach(wire => {
    const wireEl = document.createElement("button");
    wireEl.type = "button";
    wireEl.className = `wire wire-color-${wire.color}`;
    wireEl.dataset.index = String(wire.index);
    wireEl.style.animationDelay = `${wire.index * 0.03}s`;
    wireEl.setAttribute("aria-label", `Wire ${wire.index + 1}, ${wire.color.toUpperCase()}, position ${wire.index + 1} of ${wires.length}`);
    wireEl.innerHTML = `
      <span class="wire-hit-area">
        <span class="wire-cable" style="height:${Math.round(wire.length * 100)}%">
          <span class="wire-segment wire-top"></span>
          <span class="wire-spark-burst" aria-hidden="true"></span>
          <span class="wire-segment wire-bottom"></span>
          <span class="wire-connector">
            <span class="wire-tag">${wire.index + 1}</span>
          </span>
        </span>
      </span>
    `;
    wireEl.addEventListener("pointerdown", event => { event.preventDefault(); cutWire(wire.index, wireEl); }, { passive: false });
    wireEl.addEventListener("click", event => { if (event.detail === 0) cutWire(wire.index, wireEl); });
    el.wiresContainer.appendChild(wireEl);
  });
}

function cutWire(index, wireEl) {
  if (state !== "PLAYING" || run.inputLocked) return;
  // Compute spatial coordinates before mutating element classes to prevent layout thrashing
  const rect = wireEl.getBoundingClientRect();
  const stage = byId("bomb-stage")?.getBoundingClientRect() || { left: 0, top: 0 };
  const x = rect.left + rect.width / 2 - stage.left;
  const y = rect.top + rect.height * 0.42 - stage.top;

  PowerManager.clearScanner();
  run.inputLocked = true;
  wireEl.classList.add("pressed", "cut");
  AudioManager.playWireCut();

  if (index === run.bomb.challenge.answerIndex) {
    defuse(wireEl, x, y);
  } else if (PowerManager.hasActiveSecondChance()) {
    PowerManager.consumeSecondChance();
    if (run) run.powerUsedOnRun = true;
    AchievementManager.onPowerSaved();
    wireEl.classList.add("shielded", "second-chance-saved");
    setBombStatus("SAVED");
    AudioManager.playEmergencyShield();
    createParticles(x, y, "#00e5ff", 14, 70);
    flashScreen("white");
    showFloatingText("SECOND CHANCE!", "var(--accent)");
    later(() => {
      if (state === "PLAYING") {
        setBombStatus(PowerManager.isFrozen ? "FROZEN" : "ARMED");
        run.inputLocked = false;
        updatePowerUI();
      }
    }, 280);
  } else if (tryEmergencyShield(wireEl, x, y)) {
    return;
  } else {
    explode("WRONG WIRE!", wireEl, x, y);
  }
}

function tryEmergencyShield(wireEl, x, y) {
  if (run.shieldUsed || Math.random() >= UpgradeManager.shieldChance()) return false;
  run.shieldUsed = true;
  if (run) run.powerUsedOnRun = true;
  wireEl.classList.add("shielded");
  setBombStatus("SHIELDED");
  AudioManager.playEmergencyShield();
  createParticles(x, y, "#00e5ff", 12, 64);
  flashScreen("white");
  showFloatingText("SHIELD SAVED YOU!", "var(--accent)");
  later(() => {
    if (state === "PLAYING") {
      setBombStatus(PowerManager.isFrozen ? "FROZEN" : "ARMED");
      run.inputLocked = false;
      updatePowerUI();
    }
  }, 260);
  return true;
}

function defuse(wireEl, x, y) {
  Timer.stop();
  state = "RESOLVING";
  PowerManager.cleanup();
  wireEl.classList.add("correct-flash", "success-wire");
  el.bomb.classList.add("success-pulse");
  setBombStatus("SUCCESS");
  AudioManager.playDefuseSuccess();
  HapticsManager.cutSuccess();

  run.streak += 1;
  run.bestStreak = Math.max(run.bestStreak, run.streak);
  run.bombsDefused += 1;
  run.totalTimeRemaining = (run.totalTimeRemaining || 0) + Timer.remaining;

  const points = Scoring.award(run.bomb.challenge.type, Timer.remaining, run.streak);
  const coins = CoinManager.award(run.bomb.challenge.type, run.streak);

  run.score += points;
  run.coinsEarned += coins;
  run.lastAnswerIndex = run.bomb.challenge.answerIndex;

  const ansWire = run.bomb.wires[run.bomb.challenge.answerIndex];
  const wireColor = ansWire ? (WIRE_COLOR_MAP[ansWire.color] || "#00e5ff") : "#00e5ff";
  createParticles(x, y, wireColor, 14, 74);
  createParticles(x, y, "#f8ffff", 6, 46);
  flashScreen("white");
  showFloatingText(`+${points}`);
  showCoinFeedback(coins);
  showStreakFeedback(run.streak);
  pulseHud();
  updateHud();
  updatePowerUI();

  // Phase 8: Milestone & Stats & Goals Observers
  if (gameMode === "NORMAL") {
    MilestoneManager.check(run.bombsDefused, run);
  }
  DailyGoalsManager.onEvent("defuse", 1);
  DailyGoalsManager.onEvent("defuse_total", 1);
  if (Timer.remaining >= 4.5) {
    DailyGoalsManager.onEvent("fast", 1);
  }
  if (["relation", "combination"].includes(run.bomb.challenge.type)) {
    DailyGoalsManager.onEvent("logic", 1);
  }
  if (run.streak >= 6) {
    DailyGoalsManager.onEvent("streak", run.streak);
  }
  DailyGoalsManager.onEvent("coins", coins);

  StatsManager.recordDefuse({
    bombNumber: run.bombNumber,
    ruleType: run.bomb.challenge.type,
    timeRemaining: Timer.remaining,
    totalTime: run.bomb.time,
    streak: run.streak,
    score: points,
    coins: coins,
  });

  PersonalBestsManager.checkFastestDefuse(run.bomb.time - Timer.remaining);

  // Trigger achievement defusal observer
  AchievementManager.onBombDefused({
    bombNumber: run.bombNumber,
    ruleType: run.bomb.challenge.type,
    timeRemaining: Timer.remaining,
    totalTime: run.bomb.time,
    streak: run.streak,
    powerUsedThisRun: run.powerUsedOnRun,
  });

  if (gameMode === "DAILY") {
    DailyGoalsManager.onEvent("daily", 1);
    if (run.bombNumber >= GameConfig.daily.bombCount) {
      // Completed all 7 daily bombs!
      profile.daily.bombsCompleted = 7;
      profile.daily.score = run.score;
      profile.bestDailyScore = Math.max(profile.bestDailyScore || 0, run.score);
      SaveManager.save(profile);
      updateDailyTrackerUI();
      later(() => finishDailyChallenge(true), 460);
      return;
    }

    // Progression to next daily bomb
    profile.daily.bombsCompleted = run.bombNumber;
    profile.daily.score = run.score;
    profile.bestDailyScore = Math.max(profile.bestDailyScore || 0, run.score);
    SaveManager.save(profile);
    updateDailyTrackerUI();

    later(() => {
      AudioManager.playDailyProgression();
      showFloatingText(`BOMB ${run.bombNumber} DEFUSED!`, "var(--good)");
    }, 110);
    later(() => {
      run.bombNumber += 1;
      state = "PLAYING";
      nextBomb();
    }, 460);
  } else {
    later(() => AudioManager.playCoinReward(), 110);
    later(() => {
      run.bombNumber += 1;
      state = "PLAYING";
      nextBomb();
    }, 460);
  }
}

function explode(reason, wireEl, x, y) {
  if (state !== "PLAYING") return;
  Timer.stop();
  state = "EXPLODED";
  PowerManager.cleanup();
  setBombStatus("FAILURE");
  el.bomb.classList.add("shaking", "failure-pulse");
  HapticsManager.cutFailure();

  AchievementManager.onBombExploded();
  StatsManager.recordExplosion({ score: run.score, streak: run.bestStreak, coins: run.coinsEarned });

  if (wireEl) {
    AudioManager.playWrongWire();
    wireEl.classList.add("wrong-flash", "failure-wire");
    createParticles(x, y, "#ff4757", 22, 100);
  } else {
    const rect = el.bomb.getBoundingClientRect(), stage = byId("bomb-stage").getBoundingClientRect();
    createParticles(rect.left + rect.width / 2 - stage.left, rect.top + rect.height / 2 - stage.top, "#ff9f43", 24, 120);
  }

  later(() => AudioManager.playExplosion(), wireEl ? 70 : 0);
  shakeScreen();
  flashScreen("red");
  later(() => el.bomb.classList.add("exploding"), 210);

  if (gameMode === "DAILY") {
    later(() => finishDailyChallenge(false, reason), 820);
  } else {
    later(() => endGame(reason), 820);
  }
}

function endGame(reason) {
  profile.bestScore = Math.max(profile.bestScore, run.score);
  profile.bestStreak = Math.max(profile.bestStreak, run.bestStreak);
  
  const { isNewRecord, recordText } = PersonalBestsManager.checkNormalRun(run);

  SaveManager.save(profile);
  refreshPersistentUI();
  el.resultTitle.textContent = `💥 ${reason}`;
  el.resultMessage.textContent = run.bombsDefused ? "NICE RUN!" : "CUT SMARTER NEXT TIME!";
  el.resultScore.textContent = run.score.toLocaleString();
  el.resultBest.textContent = profile.bestScore.toLocaleString();
  el.resultBombs.textContent = String(run.bombsDefused);
  el.resultStreak.textContent = String(run.bestStreak);
  el.resultCoinsEarned.textContent = `+${run.coinsEarned}`;
  el.resultCurrentCoins.textContent = profile.coins.toLocaleString();

  // Dynamic comparison message
  if (el.resultComparisonText) {
    if (isNewRecord) {
      el.resultComparisonText.textContent = `🌟 ${recordText} (+${run.score.toLocaleString()} PTS)`;
    } else if (run.score > profile.bestScore * 0.8 && profile.bestScore > 0) {
      const pct = Math.round((run.score / profile.bestScore) * 100);
      el.resultComparisonText.textContent = `🔥 SO CLOSE! ${pct}% OF YOUR ALL-TIME BEST!`;
    } else {
      const nextM = MilestoneManager.getNextMilestone(run.bombsDefused);
      if (nextM) {
        const remainingBombs = nextM.count - run.bombsDefused;
        el.resultComparisonText.textContent = `⚡ ${remainingBombs} MORE DEFUSAL${remainingBombs > 1 ? "S" : ""} TO NEXT MILESTONE (+${nextM.reward} ◆)`;
      } else {
        el.resultComparisonText.textContent = `👑 MASTER OPERATOR · LIFETIME BEST: ${profile.bestScore.toLocaleString()} PTS`;
      }
    }
  }

  state = "RESULT";
  showScreen("result");
}

function finishDailyChallenge(isVictory, failureReason = "WRONG WIRE") {
  Timer.stop();
  PowerManager.cleanup();
  profile.daily.status = isVictory ? "COMPLETED" : "FAILED";
  profile.daily.bombsCompleted = run.bombsDefused;
  profile.daily.score = run.score;
  profile.bestDailyScore = Math.max(profile.bestDailyScore || 0, run.score);

  StatsManager.recordDailyCompleted({
    isPerfect: isVictory,
    score: run.score,
    bombsDefused: run.bombsDefused,
  });

  const reward = DailyChallengeManager.calculateReward(run.score, run.totalTimeRemaining || 0, run.bombsDefused, isVictory);

  if (isVictory && !profile.daily.rewardClaimed) {
    profile.coins += reward.totalCoins;
    profile.daily.rewardClaimed = true;
    profile.stats.totalCoinsEarned = (profile.stats.totalCoinsEarned || 0) + reward.totalCoins;
  }

  if (isVictory) {
    AchievementManager.onDailyCompleted();
  }

  SaveManager.save(profile);
  refreshPersistentUI();

  // Populate Daily Result Screen
  const dayNum = DailyChallengeManager.getDayNumber();
  if (el.dailyResultTitle) {
    el.dailyResultTitle.textContent = isVictory ? "DAILY COMPLETE" : `DAILY FAILED`;
    el.dailyResultTitle.className = `title daily-result-title ${isVictory ? "victory" : "failure"}`;
  }
  if (el.dailyResultIcon) {
    el.dailyResultIcon.textContent = isVictory ? "✓" : "✕";
    el.dailyResultIcon.className = `daily-result-icon ${isVictory ? "victory" : "failure"}`;
  }
  if (el.dailyResultMessage) {
    el.dailyResultMessage.textContent = isVictory ? `DAY ${dayNum} MASTERED!` : `${failureReason} · Come back tomorrow for the next challenge.`;
  }
  if (el.dailyResultScore) el.dailyResultScore.textContent = run.score.toLocaleString();
  if (el.dailyResultBest) el.dailyResultBest.textContent = profile.bestDailyScore.toLocaleString();
  if (el.dailyResultBombs) el.dailyResultBombs.textContent = `${run.bombsDefused} / 7`;
  if (el.dailyResultTimeBonus) el.dailyResultTimeBonus.textContent = isVictory ? `+${(run.totalTimeRemaining || 0).toFixed(1)}s (+${reward.timeBonus})` : "+0";
  if (el.dailyResultReward) el.dailyResultReward.textContent = isVictory ? `+${reward.totalCoins} COINS` : "+0 COINS";

  if (el.dailyRewardBreakdown) {
    el.dailyRewardBreakdown.replaceChildren();
    if (isVictory) {
      const items = [
        { label: "Base", val: `+${reward.base}` },
        { label: "Time Bonus", val: `+${reward.timeBonus}` },
        { label: "Score Bonus", val: `+${reward.scoreBonus}` },
        { label: "7/7 Bonus", val: `+${reward.perfectBonus}` },
      ];
      if (reward.boostMultiplier > 1) {
        items.push({ label: "Coin Boost", val: `x${reward.boostMultiplier.toFixed(2)}` });
      }
      items.forEach(it => {
        const chip = document.createElement("div");
        chip.className = "daily-reward-chip";
        chip.innerHTML = `${it.label}: <span>${it.val}</span>`;
        el.dailyRewardBreakdown.appendChild(chip);
      });
    } else {
      const chip = document.createElement("div");
      chip.className = "daily-reward-chip";
      chip.innerHTML = `Challenge Failed · <span>0 Coins</span>`;
      el.dailyRewardBreakdown.appendChild(chip);
    }
  }

  if (isVictory) {
    AudioManager.playDailyComplete();
  } else {
    AudioManager.playDailyFail();
  }

  state = "DAILY_RESULT";
  showScreen("daily-result");
}

function updateDailyTrackerUI() {
  if (!el.dailyProgressTracker) return;
  const currentStep = run ? run.bombNumber : 1;
  const dots = el.dailyProgressTracker.querySelectorAll(".daily-dot");
  dots.forEach(dot => {
    const step = Number(dot.dataset.step);
    dot.classList.remove("active", "completed", "failed");
    if (step < currentStep) {
      dot.classList.add("completed");
    } else if (step === currentStep) {
      dot.classList.add("active");
    }
  });
  if (el.dailyHudStep) {
    el.dailyHudStep.textContent = `${Math.min(7, currentStep)} / 7`;
  }
}

function updateDailyCardUI() {
  DailyChallengeManager.ensureDateSync();
  const dayNum = DailyChallengeManager.getDayNumber();
  if (el.dailyDayLabel) el.dailyDayLabel.textContent = `DAY ${dayNum}`;
  if (el.dailyThemeText) el.dailyThemeText.textContent = DailyChallengeManager.getDailyTheme();

  const status = profile.daily.status;
  if (el.dailyStatusIndicator && el.dailyStatusText) {
    el.dailyStatusIndicator.className = `daily-status-indicator status-${status.toLowerCase()}`;
    if (status === "NONE") el.dailyStatusText.textContent = "READY";
    else if (status === "IN_PROGRESS") el.dailyStatusText.textContent = "IN PROGRESS";
    else if (status === "COMPLETED") el.dailyStatusText.textContent = "COMPLETED ✓";
    else if (status === "FAILED") el.dailyStatusText.textContent = "FAILED ✕";
  }

  if (el.btnDailyPlay) {
    if (status === "NONE") {
      el.btnDailyPlay.textContent = "PLAY DAILY";
      el.btnDailyPlay.disabled = false;
      el.btnDailyPlay.classList.remove("is-disabled");
    } else if (status === "IN_PROGRESS") {
      el.btnDailyPlay.textContent = "CONTINUE";
      el.btnDailyPlay.disabled = false;
      el.btnDailyPlay.classList.remove("is-disabled");
    } else if (status === "COMPLETED") {
      el.btnDailyPlay.textContent = "COMPLETED ✓";
      el.btnDailyPlay.disabled = true;
      el.btnDailyPlay.classList.add("is-disabled");
    } else if (status === "FAILED") {
      el.btnDailyPlay.textContent = "FAILED ✕";
      el.btnDailyPlay.disabled = true;
      el.btnDailyPlay.classList.add("is-disabled");
    }
  }
}

let lastRenderedTimerSec = null;
let lastTimerAlertState = "";

function renderTimer(remaining, total) {
  const formatted = remaining.toFixed(1);
  if (formatted !== lastRenderedTimerSec) {
    el.timerValue.textContent = formatted;
    lastRenderedTimerSec = formatted;
  }
  const ratio = Math.max(0, Math.min(1, remaining / total));
  el.timerBarFill.style.transform = `scaleX(${ratio})`;

  const alertState = remaining <= 1.5 ? "critical" : remaining <= 3.0 ? "danger" : remaining <= 5.0 ? "warning" : "normal";
  if (alertState !== lastTimerAlertState) {
    lastTimerAlertState = alertState;
    const warning = alertState === "warning";
    const danger = alertState === "danger";
    const critical = alertState === "critical";

    el.timerWrap.classList.toggle("warning", warning);
    el.timerWrap.classList.toggle("danger", danger);
    el.timerWrap.classList.toggle("critical", critical);
    el.timerValue.classList.toggle("urgent", danger);
    el.timerValue.classList.toggle("critical", critical);
    el.timerBarFill.classList.toggle("warn", warning);
    el.timerBarFill.classList.toggle("danger", danger || critical);
  }

  if (remaining <= 5.0 && !PowerManager.isFrozen) {
    AudioManager.playTimerTick(remaining);
  }
}

function updateHud() {
  el.hudScore.textContent = run.score.toLocaleString();
  const currentBest = gameMode === "DAILY" ? profile.bestDailyScore : profile.bestScore;
  el.hudBest.textContent = Math.max(currentBest || 0, run.score).toLocaleString();
  const bestLabel = byId("hud-best-label");
  if (bestLabel) bestLabel.textContent = gameMode === "DAILY" ? "DAILY BEST" : "BEST";
  el.hudStreak.textContent = `🔥 ${run.streak}`;
  el.hudCoins.textContent = profile.coins.toLocaleString();
}

function updateSoundUI() {
  const on = profile.soundEnabled;
  if (el.btnSoundMenu) {
    el.btnSoundMenu.textContent = on ? "🔊 SOUND ON" : "🔇 SOUND OFF";
    el.btnSoundMenu.classList.toggle("is-muted", !on);
  }
  if (el.btnSoundPause) {
    el.btnSoundPause.textContent = on ? "ON" : "OFF";
    el.btnSoundPause.classList.toggle("off", !on);
  }
}

function updatePowerUI() {
  const isPlaying = state === "PLAYING" && run && !run.inputLocked;
  Object.keys(PowerDefinitions).forEach(id => {
    const btn = byId(`btn-power-${id}`);
    const badge = byId(`badge-${id}`);
    const count = PowerManager.count(id);
    if (badge) badge.textContent = String(count);
    if (btn) {
      btn.disabled = !isPlaying || count <= 0;
      btn.classList.toggle("is-disabled", !isPlaying || count <= 0);
      if (id === "secondChance") {
        btn.classList.toggle("is-active", PowerManager.hasActiveSecondChance());
      } else if (id === "timeFreeze") {
        btn.classList.toggle("is-active", PowerManager.isFrozen);
      }
    }
  });
}

function toggleSound() {
  profile.soundEnabled = !profile.soundEnabled;
  AudioManager.setSoundEnabled(profile.soundEnabled);
  SaveManager.save(profile);
  updateSoundUI();
  showToast(profile.soundEnabled ? "SOUND ENABLED" : "SOUND MUTED", "neutral", 2500);
}

function refreshPersistentUI() {
  DailyChallengeManager.ensureDateSync();
  el.menuBestScore.textContent = profile.bestScore.toLocaleString();
  el.menuBestStreak.textContent = profile.bestStreak.toLocaleString();
  el.menuCoins.textContent = profile.coins.toLocaleString();
  el.shopCoins.textContent = profile.coins.toLocaleString();
  if (run) el.hudCoins.textContent = profile.coins.toLocaleString();
  updateDailyCardUI();
  updateSoundUI();
  updatePowerUI();
  AchievementUI.updateBadge();
}

function flashScreen(type) {
  el.flashOverlay.className = "flash-overlay";
  requestAnimationFrame(() => {
    el.flashOverlay.className = `flash-overlay ${type === "red" ? "flash-red" : "flash-white"}`;
  });
}

function shakeScreen() {
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;
  const app = byId("app");
  if (!app) return;
  app.classList.remove("shake-lg");
  requestAnimationFrame(() => app.classList.add("shake-lg"));
  later(() => app.classList.remove("shake-lg"), 350);
}

function pulseHud() {
  const hud = document.querySelector(".hud");
  if (!hud) return;
  hud.classList.remove("hud-pulse");
  requestAnimationFrame(() => hud.classList.add("hud-pulse"));
  later(() => hud.classList.remove("hud-pulse"), 280);
}

function showFloatingText(text, color) {
  const node = document.createElement("div");
  node.className = "floating-text";
  node.textContent = text;
  if (color) node.style.color = color;
  el.feedbackLayer.appendChild(node);
  later(() => node.remove(), 900);
}

function showCoinFeedback(coins) {
  const node = document.createElement("div");
  node.className = "coin-feedback";
  node.textContent = `◆ +${coins} COINS`;
  el.feedbackLayer.appendChild(node);
  later(() => node.remove(), 820);
}

function showStreakFeedback(streak) {
  const labels = { 3: "GOOD!", 5: "ON FIRE!", 10: "UNSTOPPABLE!", 20: "DEFUSAL MASTER!" };
  if (!labels[streak]) return;
  AudioManager.playStreakMilestone();
  const node = document.createElement("div");
  node.className = "streak-feedback";
  node.textContent = `${labels[streak]} · ${streak} STREAK`;
  el.feedbackLayer.appendChild(node);
  later(() => node.remove(), 780);
}

let toastTimeoutId = null;

function showToast(message, tone = "neutral", duration = 2500) {
  if (!el.progressToast) return;
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
  el.progressToast.textContent = message;
  el.progressToast.className = `progress-toast show ${tone}`;
  toastTimeoutId = setTimeout(() => {
    if (el.progressToast) {
      el.progressToast.className = "progress-toast";
    }
    toastTimeoutId = null;
  }, duration);
}

const ParticlePool = (() => {
  const MAX_POOL = 24;
  const pool = [];

  function init() {
    if (!el.particleLayer || pool.length > 0) return;
    const docFrag = document.createDocumentFragment();
    for (let i = 0; i < MAX_POOL; i++) {
      const p = document.createElement("div");
      p.className = "particle spark";
      p.style.display = "none";
      docFrag.appendChild(p);
      pool.push({ el: p, inUse: false });
    }
    el.particleLayer.appendChild(docFrag);
  }

  function spawn(x, y, color, count = 16, spread = 90) {
    init();
    const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      count = Math.max(2, Math.round(count * 0.25));
    } else if (typeof window !== "undefined" && window.innerWidth < 480) {
      count = Math.max(4, Math.min(count, 8));
    }

    for (let i = 0; i < count; i++) {
      let item = pool.find(p => !p.inUse);
      if (!item) break;
      item.inUse = true;
      const size = 3 + Math.random() * 4;
      const angle = Math.random() * Math.PI * 2;
      const distance = 14 + Math.random() * (spread * 0.85);
      const duration = 240 + Math.random() * 180;
      const pEl = item.el;
      pEl.style.cssText = `display:block;width:${size}px;height:${size}px;background:${color};left:${x}px;top:${y}px;transform:translate3d(0,0,0);will-change:transform,opacity;`;

      const anim = pEl.animate([
        { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
        { transform: `translate3d(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px,0) scale(0.2)`, opacity: 0 }
      ], { duration, easing: "cubic-bezier(0.1, 0.7, 0.2, 1)" });

      anim.onfinish = () => {
        pEl.style.display = "none";
        item.inUse = false;
      };
    }
  }

  return { init, spawn };
})();

function createParticles(x, y, color, count = 16, spread = 90) {
  ParticlePool.spawn(x, y, color, count, spread);
}

function pauseGame() {
  if (state !== "PLAYING") return;
  Timer.pause();
  state = "PAUSED";
  showScreen("pause");
}

function resumeGame() {
  if (state !== "PAUSED") return;
  state = "PLAYING";
  showScreen("game");
  Timer.resume();
  updatePowerUI();
}

function returnToMenu() {
  clearPendingTransitions();
  Timer.stop();
  PowerManager.cleanup();
  if (el.dailyHudBanner) el.dailyHudBanner.style.display = "none";
  state = "MENU";
  refreshPersistentUI();
  DailyGoalsManager.updateBadge();
  showScreen("menu");
  LoginRewardManager.checkAndShowOnMenu();
}

/* =========================================================
   TUTORIAL MANAGER (FIRST-TIME ONBOARDING)
========================================================= */
const TutorialManager = (() => {
  let currentStep = 1;
  const totalSteps = 3;

  function showStep(step) {
    currentStep = step;
    [1, 2, 3].forEach(s => {
      const stepEl = byId(`tutorial-step-${s}`);
      if (stepEl) {
        stepEl.style.display = s === step ? "flex" : "none";
      }
    });

    if (el.tutorialDots) {
      Array.from(el.tutorialDots.children).forEach(dot => {
        const dotStep = Number(dot.dataset.step);
        dot.classList.toggle("active", dotStep === step);
      });
    }

    if (el.btnTutorialNext) {
      el.btnTutorialNext.textContent = step === totalSteps ? "READY? DEFUSE!" : "NEXT";
    }
  }

  function start() {
    currentStep = 1;
    showStep(1);
    state = "TUTORIAL";
    showScreen("tutorial");
  }

  function next() {
    if (currentStep < totalSteps) {
      showStep(currentStep + 1);
    } else {
      complete();
    }
  }

  function complete() {
    profile.tutorialCompleted = true;
    SaveManager.save(profile);
    startGame();
  }

  return { start, next, complete, showStep };
})();

// First-gesture audio initialization for desktop and mobile
["pointerdown", "touchstart", "click", "keydown"].forEach(eventName => {
  window.addEventListener(eventName, () => {
    AudioManager.init();
  }, { passive: true });
});

byId("btn-play").addEventListener("click", () => {
  if (!profile.tutorialCompleted) {
    TutorialManager.start();
  } else {
    startGame();
  }
});

if (byId("btn-tutorial-next")) byId("btn-tutorial-next").addEventListener("click", () => TutorialManager.next());
if (byId("btn-tutorial-skip")) byId("btn-tutorial-skip").addEventListener("click", () => TutorialManager.complete());

if (byId("btn-daily-play")) byId("btn-daily-play").addEventListener("click", startDailyChallenge);
if (byId("btn-daily-play-normal")) byId("btn-daily-play-normal").addEventListener("click", startGame);
if (byId("btn-daily-menu")) byId("btn-daily-menu").addEventListener("click", returnToMenu);

if (byId("btn-achievements")) {
  byId("btn-achievements").addEventListener("click", () => {
    AchievementUI.render();
    showScreen("achievements");
  });
}
if (byId("btn-back-achievements")) {
  byId("btn-back-achievements").addEventListener("click", returnToMenu);
}

if (el.achFilterPills) {
  el.achFilterPills.addEventListener("click", event => {
    const btn = event.target.closest(".ach-filter-pill");
    if (btn && btn.dataset.category) {
      AchievementUI.setCategory(btn.dataset.category);
    }
  });
}

byId("btn-shop").addEventListener("click", () => { ShopUI.render(); showScreen("shop"); showToast("SHOP READY", "neutral"); });
byId("btn-back-shop").addEventListener("click", returnToMenu);
byId("btn-reset-progress").addEventListener("click", () => showScreen("reset"));

byId("btn-confirm-reset").addEventListener("click", () => {
  clearPendingTransitions();
  Timer.stop();
  PowerManager.cleanup();
  AchievementToastManager.reset();
  profile = SaveManager.reset();
  AudioManager.setSoundEnabled(profile.soundEnabled);
  run = null;
  cachedDailyChallenge = null;
  refreshPersistentUI();
  ShopUI.render();
  returnToMenu();
  showToast("ALL PROGRESS RESET", "danger");
});

byId("btn-cancel-reset").addEventListener("click", () => showScreen("shop"));
byId("btn-pause").addEventListener("click", pauseGame);
byId("btn-resume").addEventListener("click", resumeGame);
byId("btn-restart-pause").addEventListener("click", () => {
  if (gameMode === "DAILY") startDailyChallenge();
  else startGame();
});
byId("btn-menu-pause").addEventListener("click", returnToMenu);
byId("btn-play-again").addEventListener("click", startGame);
byId("btn-menu-result").addEventListener("click", returnToMenu);

if (el.btnSoundMenu) el.btnSoundMenu.addEventListener("click", toggleSound);
if (el.btnSoundPause) el.btnSoundPause.addEventListener("click", toggleSound);

// Power bar event handlers
Object.keys(PowerDefinitions).forEach(id => {
  const btn = byId(`btn-power-${id}`);
  if (btn) {
    btn.addEventListener("click", event => {
      event.stopPropagation();
      PowerManager.activate(id);
    });
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    SaveManager.flush?.();
    if (state === "PLAYING") pauseGame();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (el.menuAccountPopup && el.menuAccountPopup.style.display === "block") {
      closeAccountPopup();
      return;
    }
    if (state === "PLAYING") {
      pauseGame();
      return;
    }
    if (state === "PAUSED") {
      resumeGame();
      return;
    }
    const activeEntry = Object.entries(screens).find(([_, screenEl]) => screenEl?.classList.contains("active"));
    const activeName = activeEntry ? activeEntry[0] : "menu";

    switch (activeName) {
      case "avatar-picker":
        ProfileUI.render();
        showScreen("profile");
        break;
      case "delete-account":
      case "logout-confirm":
        SettingsUI.render();
        showScreen("account-settings");
        break;
      case "account-settings":
        ProfileUI.render();
        showScreen("profile");
        break;
      case "register":
      case "forgot-password":
        showScreen("login");
        break;
      case "profile":
      case "login":
      case "stats":
      case "daily-goals":
      case "login-reward":
      case "shop":
      case "achievements":
      case "reset":
      case "sync-conflict":
      case "tutorial":
        returnToMenu();
        break;
      default:
        break;
    }
  }
});

// PWA Install Prompt handling
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const btnInstall = byId("btn-install");
  if (btnInstall) {
    btnInstall.style.display = "block";
  }
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const btnInstall = byId("btn-install");
  if (btnInstall) {
    btnInstall.style.display = "none";
  }
  showToast("BOMB DEFUSE INSTALLED!", "success");
});

if (byId("btn-install")) {
  byId("btn-install").addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        const btnInstall = byId("btn-install");
        if (btnInstall) btnInstall.style.display = "none";
      }
      deferredInstallPrompt = null;
    }
  });
}

// Phase 8: Stats, Goals, Login Rewards, Share Event Handlers
if (byId("btn-stats")) {
  byId("btn-stats").addEventListener("click", () => {
    StatsManager.renderStats();
    showScreen("stats");
  });
}
if (byId("btn-back-stats")) {
  byId("btn-back-stats").addEventListener("click", returnToMenu);
}

if (byId("btn-daily-goals")) {
  byId("btn-daily-goals").addEventListener("click", () => {
    DailyGoalsManager.render();
    showScreen("daily-goals");
  });
}
if (byId("btn-back-daily-goals")) {
  byId("btn-back-daily-goals").addEventListener("click", returnToMenu);
}

if (byId("btn-claim-login-reward")) {
  byId("btn-claim-login-reward").addEventListener("click", () => {
    LoginRewardManager.claim();
  });
}
if (byId("btn-close-login-reward")) {
  byId("btn-close-login-reward").addEventListener("click", returnToMenu);
}

if (byId("btn-share-result")) {
  byId("btn-share-result").addEventListener("click", () => {
    if (run) ShareManager.shareNormal(run.score, run.bestStreak, run.bombsDefused);
  });
}
if (byId("btn-result-shop")) {
  byId("btn-result-shop").addEventListener("click", () => {
    ShopUI.render();
    showScreen("shop");
  });
}
if (byId("btn-daily-share")) {
  byId("btn-daily-share").addEventListener("click", () => {
    if (run) ShareManager.shareDaily(DailyChallengeManager.getDayNumber(), run.score, run.bombsDefused, profile.daily.status === "COMPLETED");
  });
}

// Phase 8 & 10: Player Accounts, Profile & Settings Event Handlers
function toggleAccountPopup(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  if (!el.menuAccountPopup) return;
  const isOpen = el.menuAccountPopup.style.display === "block";
  if (isOpen) {
    closeAccountPopup();
  } else {
    updateMenuAccountBadge();
    el.menuAccountPopup.style.display = "block";
    if (el.btnMenuAvatar) {
      el.btnMenuAvatar.setAttribute("aria-expanded", "true");
    }
  }
}

if (el.btnMenuAvatar) {
  el.btnMenuAvatar.addEventListener("click", toggleAccountPopup);
}

if (el.btnPopupSettings) {
  el.btnPopupSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPopup();
    ProfileUI.render();
    showScreen("account-settings");
  });
}

if (el.btnPopupLogout) {
  el.btnPopupLogout.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPopup();
    showScreen("logout-confirm");
  });
}

if (el.btnPopupSignin) {
  el.btnPopupSignin.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPopup();
    showScreen("login");
  });
}

// Global click-outside listener to close account popup
document.addEventListener("click", (e) => {
  if (el.menuAccountPopup && el.menuAccountPopup.style.display === "block") {
    if (!el.menuAccountPopup.contains(e.target) && !el.btnMenuAvatar?.contains(e.target)) {
      closeAccountPopup();
    }
  }
});



let isAuthInProgress = false;

function setAuthButtonLoading(btn, isLoading, loadingText, defaultContent) {
  if (!btn) return;
  btn.disabled = isLoading;
  if (isLoading) {
    btn.classList.add("is-loading");
    btn.dataset.originalContent = defaultContent || btn.innerHTML;
    btn.innerHTML = `<span class="auth-spinner" aria-hidden="true"></span> <span>${loadingText}</span>`;
  } else {
    btn.classList.remove("is-loading");
    if (btn.dataset.originalContent) {
      btn.innerHTML = btn.dataset.originalContent;
    }
  }
}

if (byId("btn-auth-google")) {
  byId("btn-auth-google").addEventListener("click", async () => {
    if (isAuthInProgress) return;
    isAuthInProgress = true;
    const btn = byId("btn-auth-google");
    const originalContent = btn ? btn.innerHTML : "";
    setAuthButtonLoading(btn, true, "CONNECTING GOOGLE...", originalContent);
    try {
      const res = await AuthManager.loginWithGoogle();
      if (!res.success) {
        showToast(res.message || "Google login unavailable in this build.", "neutral");
      } else {
        returnToMenu();
      }
    } catch (err) {
      showToast("Google login was cancelled or encountered an error.", "neutral");
    } finally {
      setAuthButtonLoading(btn, false, "", originalContent);
      isAuthInProgress = false;
    }
  });
}

if (byId("btn-auth-facebook")) {
  byId("btn-auth-facebook").addEventListener("click", async () => {
    if (isAuthInProgress) return;
    isAuthInProgress = true;
    const btn = byId("btn-auth-facebook");
    const originalContent = btn ? btn.innerHTML : "";
    setAuthButtonLoading(btn, true, "CONNECTING FACEBOOK...", originalContent);
    try {
      const res = await AuthManager.loginWithFacebook();
      if (!res.success) {
        showToast(res.message || "Facebook login unavailable in this build.", "neutral");
      } else {
        returnToMenu();
      }
    } catch (err) {
      showToast("Facebook login encountered an error.", "neutral");
    } finally {
      setAuthButtonLoading(btn, false, "", originalContent);
      isAuthInProgress = false;
    }
  });
}

if (byId("btn-auth-email")) {
  byId("btn-auth-email").addEventListener("click", () => {
    if (el.authProvidersContainer) el.authProvidersContainer.style.display = "none";
    if (el.formLoginEmail) {
      el.formLoginEmail.style.display = "flex";
      if (el.loginErrorMsg) el.loginErrorMsg.style.display = "none";
      if (el.loginEmail) el.loginEmail.focus();
    }
  });
}

if (byId("btn-cancel-email-login")) {
  byId("btn-cancel-email-login").addEventListener("click", () => {
    if (el.formLoginEmail) el.formLoginEmail.style.display = "none";
    if (el.authProvidersContainer) el.authProvidersContainer.style.display = "flex";
    if (el.loginErrorMsg) el.loginErrorMsg.style.display = "none";
  });
}

if (byId("btn-do-login-email")) {
  byId("btn-do-login-email").addEventListener("click", async () => {
    if (isAuthInProgress) return;
    const email = el.loginEmail?.value || "";
    const pass = el.loginPassword?.value || "";

    if (!email || !email.includes("@")) {
      if (el.loginErrorMsg) {
        el.loginErrorMsg.textContent = "Please enter a valid email address.";
        el.loginErrorMsg.style.display = "block";
      }
      return;
    }

    if (!pass || pass.length < 6) {
      if (el.loginErrorMsg) {
        el.loginErrorMsg.textContent = "Password must be at least 6 characters.";
        el.loginErrorMsg.style.display = "block";
      }
      return;
    }

    isAuthInProgress = true;
    const btn = byId("btn-do-login-email");
    const originalContent = btn ? btn.innerHTML : "";
    setAuthButtonLoading(btn, true, "SIGNING IN...", originalContent);
    if (el.loginErrorMsg) el.loginErrorMsg.style.display = "none";

    try {
      const res = await AuthManager.loginWithEmail(email, pass);
      if (!res.success) {
        if (el.loginErrorMsg) {
          el.loginErrorMsg.textContent = res.message || "Email login failed.";
          el.loginErrorMsg.style.display = "block";
        }
        showToast(res.message || "Email login failed.", "danger");
      } else {
        if (el.loginEmail) el.loginEmail.value = "";
        if (el.loginPassword) el.loginPassword.value = "";
        if (el.formLoginEmail) el.formLoginEmail.style.display = "none";
        if (el.authProvidersContainer) el.authProvidersContainer.style.display = "flex";
        returnToMenu();
      }
    } catch (err) {
      if (el.loginErrorMsg) {
        el.loginErrorMsg.textContent = "Authentication request failed. Please try again.";
        el.loginErrorMsg.style.display = "block";
      }
    } finally {
      setAuthButtonLoading(btn, false, "", originalContent);
      isAuthInProgress = false;
    }
  });
}

if (byId("btn-login-guest")) {
  byId("btn-login-guest").addEventListener("click", () => {
    AuthManager.continueAsGuest();
  });
}

if (byId("btn-goto-register")) {
  byId("btn-goto-register").addEventListener("click", () => showScreen("register"));
}

if (byId("btn-goto-forgot")) {
  byId("btn-goto-forgot").addEventListener("click", () => showScreen("forgot-password"));
}

if (byId("btn-back-login")) {
  byId("btn-back-login").addEventListener("click", () => {
    if (el.formLoginEmail) el.formLoginEmail.style.display = "none";
    if (el.authProvidersContainer) el.authProvidersContainer.style.display = "flex";
    returnToMenu();
  });
}

if (byId("btn-back-to-login")) {
  byId("btn-back-to-login").addEventListener("click", () => {
    if (el.formLoginEmail) el.formLoginEmail.style.display = "none";
    if (el.authProvidersContainer) el.authProvidersContainer.style.display = "flex";
    showScreen("login");
  });
}

if (byId("btn-back-register")) {
  byId("btn-back-register").addEventListener("click", () => showScreen("login"));
}

if (byId("btn-do-register")) {
  byId("btn-do-register").addEventListener("click", async () => {
    if (isAuthInProgress) return;
    const name = el.registerDisplayName?.value || "";
    const email = el.registerEmail?.value || "";
    const pass = el.registerPassword?.value || "";
    const confirm = el.registerConfirmPassword?.value || "";

    const nameVal = AuthManager.validateDisplayName(name);
    if (!nameVal.valid) {
      if (el.registerErrorMsg) {
        el.registerErrorMsg.textContent = nameVal.error;
        el.registerErrorMsg.style.display = "block";
      }
      return;
    }

    if (!email || !email.includes("@")) {
      if (el.registerErrorMsg) {
        el.registerErrorMsg.textContent = "Please enter a valid email address.";
        el.registerErrorMsg.style.display = "block";
      }
      return;
    }

    if (!pass || pass.length < 6) {
      if (el.registerErrorMsg) {
        el.registerErrorMsg.textContent = "Password must be at least 6 characters.";
        el.registerErrorMsg.style.display = "block";
      }
      return;
    }

    if (pass !== confirm) {
      if (el.registerErrorMsg) {
        el.registerErrorMsg.textContent = "Passwords do not match.";
        el.registerErrorMsg.style.display = "block";
      }
      return;
    }

    isAuthInProgress = true;
    const btn = byId("btn-do-register");
    const originalContent = btn ? btn.innerHTML : "";
    setAuthButtonLoading(btn, true, "CREATING ACCOUNT...", originalContent);
    if (el.registerErrorMsg) el.registerErrorMsg.style.display = "none";

    try {
      const res = await AuthManager.registerWithEmail(name, email, pass);
      if (!res.success) {
        if (el.registerErrorMsg) {
          el.registerErrorMsg.textContent = res.message || "Account creation failed.";
          el.registerErrorMsg.style.display = "block";
        }
        showToast(res.message || "Account creation failed.", "danger");
      } else {
        if (el.registerDisplayName) el.registerDisplayName.value = "";
        if (el.registerEmail) el.registerEmail.value = "";
        if (el.registerPassword) el.registerPassword.value = "";
        if (el.registerConfirmPassword) el.registerConfirmPassword.value = "";
        returnToMenu();
      }
    } catch (err) {
      if (el.registerErrorMsg) {
        el.registerErrorMsg.textContent = "Account creation failed. Please try again.";
        el.registerErrorMsg.style.display = "block";
      }
    } finally {
      setAuthButtonLoading(btn, false, "", originalContent);
      isAuthInProgress = false;
    }
  });
}

if (byId("btn-do-forgot")) {
  byId("btn-do-forgot").addEventListener("click", async () => {
    if (isAuthInProgress) return;
    const email = el.forgotEmail?.value || "";
    if (!email || !email.includes("@")) {
      if (el.forgotErrorMsg) {
        el.forgotErrorMsg.textContent = "Please enter a valid email address.";
        el.forgotErrorMsg.style.display = "block";
      }
      return;
    }

    isAuthInProgress = true;
    const btn = byId("btn-do-forgot");
    const originalContent = btn ? btn.innerHTML : "";
    setAuthButtonLoading(btn, true, "SENDING LINK...", originalContent);
    if (el.forgotErrorMsg) el.forgotErrorMsg.style.display = "none";

    try {
      const res = await AuthManager.sendPasswordReset(email);
      if (res.success) {
        showToast(res.message || "Password reset link sent.", "success");
        showScreen("login");
      } else {
        if (el.forgotErrorMsg) {
          el.forgotErrorMsg.textContent = res.message || "Password reset failed.";
          el.forgotErrorMsg.style.display = "block";
        }
        showToast(res.message || "Password reset failed.", "danger");
      }
    } catch (err) {
      if (el.forgotErrorMsg) {
        el.forgotErrorMsg.textContent = "Password reset request failed. Please try again.";
        el.forgotErrorMsg.style.display = "block";
      }
    } finally {
      setAuthButtonLoading(btn, false, "", originalContent);
      isAuthInProgress = false;
    }
  });
}

if (byId("btn-back-forgot")) {
  byId("btn-back-forgot").addEventListener("click", () => showScreen("login"));
}

if (byId("btn-change-avatar")) {
  byId("btn-change-avatar").addEventListener("click", () => {
    AvatarPickerUI.render();
    showScreen("avatar-picker");
  });
}

if (byId("btn-save-avatar")) {
  byId("btn-save-avatar").addEventListener("click", () => {
    AvatarPickerUI.save();
  });
}

if (byId("btn-cancel-avatar")) {
  byId("btn-cancel-avatar").addEventListener("click", () => {
    ProfileUI.render();
    showScreen("profile");
  });
}

if (byId("btn-edit-display-name")) {
  byId("btn-edit-display-name").addEventListener("click", () => {
    const newName = window.prompt("Enter new display name (3-20 characters):", profile.account.displayName || "Guest");
    if (newName !== null) {
      const res = AuthManager.setDisplayName(newName);
      if (res.valid) {
        ProfileUI.render();
        showToast(`NAME CHANGED TO ${res.name}`, "success");
      } else {
        showToast(res.error || "INVALID DISPLAY NAME", "danger");
      }
    }
  });
}

if (byId("btn-profile-create-account")) {
  byId("btn-profile-create-account").addEventListener("click", () => {
    showScreen("register");
  });
}

if (byId("btn-profile-settings")) {
  byId("btn-profile-settings").addEventListener("click", () => {
    SettingsUI.render();
    showScreen("account-settings");
  });
}

if (byId("btn-back-profile")) {
  byId("btn-back-profile").addEventListener("click", returnToMenu);
}

if (byId("btn-settings-change-name")) {
  byId("btn-settings-change-name").addEventListener("click", () => {
    const newName = window.prompt("Enter new display name (3-20 characters):", profile.account.displayName || "Guest");
    if (newName !== null) {
      const res = AuthManager.setDisplayName(newName);
      if (res.valid) {
        SettingsUI.render();
        showToast(`NAME CHANGED TO ${res.name}`, "success");
      } else {
        showToast(res.error || "INVALID DISPLAY NAME", "danger");
      }
    }
  });
}

if (byId("btn-settings-change-avatar")) {
  byId("btn-settings-change-avatar").addEventListener("click", () => {
    AvatarPickerUI.render();
    showScreen("avatar-picker");
  });
}

if (byId("btn-toggle-analytics")) {
  byId("btn-toggle-analytics").addEventListener("click", () => {
    const current = Boolean(profile.privacy?.analytics);
    ConsentManager.setConsent("analytics", !current);
    SettingsUI.render();
    showToast(`ANALYTICS ${!current ? "ENABLED" : "DISABLED"}`, "neutral");
  });
}

if (byId("btn-toggle-ads")) {
  byId("btn-toggle-ads").addEventListener("click", () => {
    const current = Boolean(profile.privacy?.personalizedAds);
    ConsentManager.setConsent("personalizedAds", !current);
    SettingsUI.render();
    showToast(`PERSONALIZED ADS ${!current ? "ENABLED" : "DISABLED"}`, "neutral");
  });
}

if (byId("btn-settings-toggle-sound")) {
  byId("btn-settings-toggle-sound").addEventListener("click", () => {
    toggleSound();
    SettingsUI.render();
  });
}

if (byId("btn-settings-toggle-motion")) {
  byId("btn-settings-toggle-motion").addEventListener("click", () => {
    const body = document.body;
    const isReduced = body.classList.toggle("reduced-motion-override");
    SettingsUI.render();
    showToast(`REDUCED MOTION ${isReduced ? "ENABLED" : "DISABLED"}`, "neutral");
  });
}

if (byId("btn-export-data")) {
  byId("btn-export-data").addEventListener("click", () => {
    DataExportManager.exportData();
  });
}

if (byId("btn-logout")) {
  byId("btn-logout").addEventListener("click", () => {
    showScreen("logout-confirm");
  });
}

if (byId("btn-confirm-logout")) {
  byId("btn-confirm-logout").addEventListener("click", () => {
    AuthManager.logout();
  });
}

if (byId("btn-cancel-logout")) {
  byId("btn-cancel-logout").addEventListener("click", () => {
    showScreen("account-settings");
  });
}

if (byId("btn-delete-account")) {
  byId("btn-delete-account").addEventListener("click", () => {
    if (el.inputDeleteConfirm) el.inputDeleteConfirm.value = "";
    if (el.btnConfirmDeleteAccount) el.btnConfirmDeleteAccount.disabled = true;
    showScreen("delete-account");
  });
}

if (byId("input-delete-confirm")) {
  byId("input-delete-confirm").addEventListener("input", event => {
    const val = event.target.value.trim();
    if (el.btnConfirmDeleteAccount) {
      el.btnConfirmDeleteAccount.disabled = val !== "DELETE";
    }
  });
}

if (byId("btn-confirm-delete-account")) {
  byId("btn-confirm-delete-account").addEventListener("click", () => {
    if (el.btnConfirmDeleteAccount) el.btnConfirmDeleteAccount.disabled = true;
    AuthManager.deleteAccount();
  });
}

if (byId("btn-cancel-delete-account")) {
  byId("btn-cancel-delete-account").addEventListener("click", () => {
    showScreen("account-settings");
  });
}

if (byId("btn-back-settings")) {
  byId("btn-back-settings").addEventListener("click", () => {
    ProfileUI.render();
    showScreen("profile");
  });
}

if (byId("btn-choose-local-save")) {
  byId("btn-choose-local-save").addEventListener("click", () => {
    CloudSaveManager.resolveConflict("local");
    returnToMenu();
  });
}

if (byId("btn-choose-cloud-save")) {
  byId("btn-choose-cloud-save").addEventListener("click", () => {
    CloudSaveManager.resolveConflict("cloud");
    returnToMenu();
  });
}

// Service worker registration
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(err => {
      // Graceful fallback: game remains 100% playable
      console.warn("[SW] Registration skipped or failed:", err);
    });
  });
}

AuthManager.initialize();
CloudSaveManager.initialize();
AnalyticsManager.initialize();
AudioManager.setSoundEnabled(profile.soundEnabled);
refreshPersistentUI();
updateMenuAccountBadge();
DailyGoalsManager.updateBadge();
showScreen("menu");
LoginRewardManager.checkAndShowOnMenu();




