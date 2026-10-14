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

const EndlessTimerConfig = {
  minTime: 3.0,
  maxTimeBank: 6.0,
  tiers: [
    { maxBomb: 3, baseTime: 8.0 },
    { maxBomb: 6, baseTime: 7.0 },
    { maxBomb: 9, baseTime: 6.0 },
    { maxBomb: 14, baseTime: 5.0 },
    { maxBomb: 20, baseTime: 4.0 },
    { maxBomb: Infinity, baseTime: 3.5 }
  ]
};

function getEndlessBaseTime(bombNumber) {
  const tier = EndlessTimerConfig.tiers.find(t => bombNumber <= t.maxBomb) || EndlessTimerConfig.tiers.at(-1);
  return Math.max(EndlessTimerConfig.minTime, tier.baseTime);
}

const ENDLESS_BASE_TIME = 8.0;
const MAX_TIME_BANK = 6.0;

const TimeBankCarryover = {
  easy: 1.0,      // 100%
  normal: 1.0,    // 100%
  hard: 0.75,     // 75%
  veryHard: 0.50, // 50%
  extreme: 0.25,  // 25%
};

const EndlessDifficultyConfig = {
  easy: { key: "easy", label: "EASY", wires: [3, 4], rules: ["color", "position", "onlyColor", "count"], bonus: 0, tensionBase: 0.0 },
  normal: { key: "normal", label: "NORMAL", wires: [3, 4], rules: ["color", "position", "length", "onlyColor", "signal", "order"], bonus: 50, tensionBase: 0.15 },
  hard: { key: "hard", label: "HARD", wires: [4, 5], rules: ["color", "position", "length", "relation", "signal", "led", "adjacency"], bonus: 100, tensionBase: 0.30 },
  veryHard: { key: "veryHard", label: "VERY HARD", wires: [4, 5], rules: ["position", "length", "relation", "combination", "signal", "led", "adjacency", "order"], bonus: 175, tensionBase: 0.45 },
  extreme: { key: "extreme", label: "EXTREME", wires: [5, 6], rules: ["length", "relation", "combination", "memory", "signal", "led", "adjacency", "order"], bonus: 250, tensionBase: 0.60 },
};

function getEndlessDifficulty(bombNumber) {
  if (bombNumber <= 3) return "easy";
  if (bombNumber <= 6) return "normal";
  if (bombNumber <= 9) return "hard";
  if (bombNumber <= 14) return "veryHard";
  return "extreme";
}

function getStreakMultiplier(streak) {
  if (streak >= 20) return 3.0;
  if (streak >= 10) return 2.0;
  if (streak >= 5) return 1.5;
  if (streak >= 3) return 1.2;
  return 1.0;
}

function calculateTension(remaining, duration, difficultyKey = "easy", streak = 0, bombNumber = 1, phaseBonus = 0, eventBonus = 0) {
  const diffCfg = EndlessDifficultyConfig[difficultyKey] || EndlessDifficultyConfig.easy;
  const timePct = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
  const dangerPct = 1.0 - timePct;
  const tension = Math.min(1.0, Math.max(0.0,
    diffCfg.tensionBase * 0.50 +
    dangerPct * 0.35 +
    Math.min(0.10, (streak * 0.01) + (bombNumber * 0.002)) +
    (Number(phaseBonus) || 0) +
    (Number(eventBonus) || 0)
  ));
  return Number(tension.toFixed(3));
}

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
  timeSlow: { name: "TIME SLOW", icon: "⏱", description: "Reduces timer countdown speed by 50% for 5 seconds.", effect: "Reduces timer speed by 50% (5s)", price: 30 },
  timeFreeze: { name: "TIME FREEZE", icon: "❄", description: "Freezes the fuse timer countdown for 3 seconds.", effect: "Freezes countdown for 3s", price: 35 },
  secondChance: { name: "SECOND CHANCE", icon: "🛡", description: "Absorbs 1 wrong wire cut on the active bomb.", effect: "Protects against 1 wrong cut", price: 50 },
};

const BombVisualVariants = [
  { id: "military", className: "variant-military", label: "SYS // MIL-01" },
  { id: "redAlert", className: "variant-redalert", label: "SYS // ALERT-02" },
  { id: "cybernetic", className: "variant-cybernetic", label: "SYS // CYBER-03" },
  { id: "industrial", className: "variant-industrial", label: "SYS // IND-04" },
  { id: "unstable", className: "variant-unstable", label: "SYS // FLUX-05" },
];

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
  protocol_breaker: { id: "protocol_breaker", name: "PROTOCOL BREAKER", description: "Complete the FINAL PROTOCOL and finish Chapter 1.", icon: "★", category: "GAMEPLAY", target: 1, reward: 100, hidden: false, progressType: "count" },
};

const screens = Object.fromEntries([
  "menu", "game", "pause", "result", "daily-result", "achievements", "shop", "reset", "tutorial", "stats", "daily-goals", "login-reward", "endless-briefing",
  "login", "register", "forgot-password", "profile", "avatar-picker", "settings", "account-settings", "delete-account", "logout-confirm", "sync-conflict",
  "campaign-select", "campaign-briefing", "campaign-result"
].map(name => [name, document.getElementById(`screen-${name}`)]));

const el = {
  menuBestScore: byId("menu-best-score"), menuBestStreak: byId("menu-best-streak"), shopCoins: byId("shop-coins"),
  hudScore: byId("hud-score"), hudBest: byId("hud-best"), hudBombLabel: byId("hud-bomb-label"), hudStreak: byId("hud-streak"),
  hudTimeBank: byId("hud-time-bank"),
  resultDifficulty: byId("result-difficulty"), btnStartEndlessRun: byId("btn-start-endless-run"), btnCloseEndlessBriefing: byId("btn-close-endless-briefing"),
  timerValue: byId("timer-value"), timerBarFill: byId("timer-bar-fill"), timerWrap: document.querySelector(".timer-wrap"), instruction: byId("instruction"), bomb: byId("bomb"), bombScreenText: byId("bomb-screen-text"), wiresContainer: byId("wires-container"),
  particleLayer: byId("particle-layer"), feedbackLayer: byId("feedback-layer"), flashOverlay: byId("flash-overlay"),
  resultTitle: byId("result-title"), resultMessage: byId("result-message"), resultScore: byId("result-score"), resultBest: byId("result-best"), resultBombs: byId("result-bombs"), resultStreak: byId("result-streak"), resultCoinsEarned: byId("result-coins-earned"), resultCurrentCoins: byId("result-current-coins"),
  resultComparisonBox: byId("result-comparison-box"), resultComparisonText: byId("result-comparison-text"),
  btnShareResult: byId("btn-share-result"), btnResultShop: byId("btn-result-shop"),
  // Campaign elements
  btnCampaign: byId("btn-campaign"),
  btnBackCampaignSelect: byId("btn-back-campaign-select"),
  campaignChapterStatus: byId("campaign-chapter-status"),
  btnPlayLevel1: byId("btn-play-level-1"),
  btnPlayLevel2: byId("btn-play-level-2"),
  lockIcon2: byId("lock-icon-2"),
  descLevel2: byId("desc-level-2"),
  levelCard1: byId("level-card-1"),
  levelCard2: byId("level-card-2"),
  starsLevel1: byId("stars-level-1"),
  starsLevel2: byId("stars-level-2"),
  levelCard3: byId("level-card-3"),
  starsLevel3: byId("stars-level-3"),
  lockIcon3: byId("lock-icon-3"),
  descLevel3: byId("desc-level-3"),
  btnPlayLevel3: byId("btn-play-level-3"),
  levelCard4: byId("level-card-4"),
  starsLevel4: byId("stars-level-4"),
  lockIcon4: byId("lock-icon-4"),
  descLevel4: byId("desc-level-4"),
  btnPlayLevel4: byId("btn-play-level-4"),
  levelCard5: byId("level-card-5"),
  starsLevel5: byId("stars-level-5"),
  lockIcon5: byId("lock-icon-5"),
  descLevel5: byId("desc-level-5"),
  btnPlayLevel5: byId("btn-play-level-5"),
  levelCard6: byId("level-card-6"),
  starsLevel6: byId("stars-level-6"),
  lockIcon6: byId("lock-icon-6"),
  descLevel6: byId("desc-level-6"),
  btnPlayLevel6: byId("btn-play-level-6"),
  levelCard7: byId("level-card-7"),
  starsLevel7: byId("stars-level-7"),
  lockIcon7: byId("lock-icon-7"),
  descLevel7: byId("desc-level-7"),
  btnPlayLevel7: byId("btn-play-level-7"),
  levelCard8: byId("level-card-8"),
  starsLevel8: byId("stars-level-8"),
  lockIcon8: byId("lock-icon-8"),
  descLevel8: byId("desc-level-8"),
  btnPlayLevel8: byId("btn-play-level-8"),
  levelCard9: byId("level-card-9"),
  starsLevel9: byId("stars-level-9"),
  lockIcon9: byId("lock-icon-9"),
  descLevel9: byId("desc-level-9"),
  btnPlayLevel9: byId("btn-play-level-9"),
  levelCard10: byId("level-card-10"),
  starsLevel10: byId("stars-level-10"),
  lockIcon10: byId("lock-icon-10"),
  descLevel10: byId("desc-level-10"),
  btnPlayLevel10: byId("btn-play-level-10"),
  campaignChapterSummary: byId("campaign-chapter-summary"),
  campaignChapterSummaryTitle: byId("campaign-chapter-summary-title"),
  campaignChapterSummaryStats: byId("campaign-chapter-summary-stats"),
  campaignChapterSummaryLevel: byId("campaign-chapter-summary-level"),
  signalOrderContainer: byId("signal-order-container"),
  signalOrderTerminals: byId("signal-order-terminals"),
  signalOrderChip: byId("signal-order-chip"),
  circuitFlowContainer: byId("circuit-flow-container"),
  circuitFlowBoard: byId("circuit-flow-board"),
  circuitFlowSvg: byId("circuit-flow-svg"),
  circuitFlowGrid: byId("circuit-flow-grid"),
  circuitProgressChip: byId("circuit-progress-chip"),
  signalMemoryContainer: byId("signal-memory-container"),
  signalMemoryBoard: byId("signal-memory-board"),
  signalMemoryGrid: byId("signal-memory-grid"),
  signalProgressChip: byId("signal-progress-chip"),
  wordPuzzleContainer: byId("word-puzzle-container"),
  wordPuzzleBoard: byId("word-puzzle-board"),
  wordPuzzleStatus: byId("word-puzzle-status"),
  wordPuzzleChip: byId("word-puzzle-chip"),
  wordPuzzleClue: byId("word-puzzle-clue"),
  wordPuzzleClueText: byId("word-puzzle-clue-text"),
  wordAnswerRow: byId("word-answer-row"),
  wordTilesGrid: byId("word-tiles-grid"),
  btnWordClear: byId("btn-word-clear"),
  btnWordSubmit: byId("btn-word-submit"),
  campaignBriefingBadge: byId("campaign-briefing-badge"),
  campaignBriefingTitle: byId("campaign-briefing-title"),
  campaignBriefingDesc: byId("campaign-briefing-desc"),
  campaignBriefingRules: byId("campaign-briefing-rules"),
  btnStartCampaignLevel: byId("btn-start-campaign-level"),
  btnCloseCampaignBriefing: byId("btn-close-campaign-briefing"),
  campaignResultTitle: byId("campaign-result-title"),
  campaignResultSubtitle: byId("campaign-result-subtitle"),
  campaignStarsBanner: byId("campaign-stars-banner"),
  resultStar1: byId("result-star-1"),
  resultStar2: byId("result-star-2"),
  resultStar3: byId("result-star-3"),
  campaignResultScore: byId("campaign-result-score"),
  campaignResultTime: byId("campaign-result-time"),
  campaignResultCoins: byId("campaign-result-coins"),
  btnCampaignNextLevel: byId("btn-campaign-next-level"),
  btnCampaignReplay: byId("btn-campaign-replay"),
  btnCampaignLevelSelect: byId("btn-campaign-level-select"),
  upgradeList: byId("upgrade-list"), powerList: byId("power-list"), progressToast: byId("progress-toast"),
  btnSoundPause: byId("btn-sound-pause"), powerBar: byId("power-bar"),
  // Daily challenge elements
  dailyCard: byId("daily-card"), dailyDayLabel: byId("daily-day-label"), dailyStatusIndicator: byId("daily-status-indicator"), dailyStatusText: byId("daily-status-text"), dailyThemeText: byId("daily-theme-text"), btnDailyPlay: byId("btn-daily-play"),
  dailyHudBanner: byId("daily-hud-banner"), dailyHudDay: byId("daily-hud-day"), dailyProgressTracker: byId("daily-progress-tracker"), dailyHudStep: byId("daily-hud-step"),
  dailyResultTitle: byId("daily-result-title"), dailyResultIcon: byId("daily-result-icon"), dailyResultMessage: byId("daily-result-message"), dailyResultScore: byId("daily-result-score"), dailyResultBest: byId("daily-result-best"), dailyResultBombs: byId("daily-result-bombs"), dailyResultTimeBonus: byId("daily-result-time-bonus"), dailyResultReward: byId("daily-result-reward"), dailyRewardBreakdown: byId("daily-reward-breakdown"),
  btnDailyPlayNormal: byId("btn-daily-play-normal"), btnDailyShare: byId("btn-daily-share"), btnDailyMenu: byId("btn-daily-menu"),
  // Achievement elements
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
  btnShop: byId("btn-shop"),
  btnBackDailyGoals: byId("btn-back-daily-goals"),
  menuGoalsBadge: byId("menu-goals-badge"),
  dailyGoalsList: byId("daily-goals-list"),
  // Phase 8: Login Reward elements
  loginDaysGrid: byId("login-days-grid"),
  btnClaimLoginReward: byId("btn-claim-login-reward"),
  btnCloseLoginReward: byId("btn-close-login-reward"),
  // Phase 8 & 10: Player Account & Profile elements
  menuTopBar: document.querySelector(".menu-top-bar"),
  menuCoinPill: byId("menu-coin-pill"),
  menuCoins: byId("menu-coins"),
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
  btnPopupProfile: byId("btn-popup-profile"),
  btnPopupStats: byId("btn-popup-stats"),
  btnPopupAchievements: byId("btn-popup-achievements"),
  btnPopupSettings: byId("btn-popup-settings"),
  btnPopupGuestSettings: byId("btn-popup-guest-settings"),
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
  btnToggleCrashReporting: byId("btn-toggle-crash-reporting"),
  btnToggleAds: byId("btn-toggle-ads"),
  btnSettingsToggleSound: byId("btn-settings-toggle-sound"),
  btnSettingsToggleHaptics: byId("btn-settings-toggle-haptics"),
  btnSettingsToggleMotion: byId("btn-settings-toggle-motion"),
  btnExportData: byId("btn-export-data"),
  btnLogout: byId("btn-logout"),
  btnDeleteAccount: byId("btn-delete-account"),
  btnBackSettings: byId("btn-back-settings"),
  btnBackAccountSettings: byId("btn-back-account-settings"),
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
      if (typeof navigator !== "undefined" && "vibrate" in navigator && profile?.hapticsEnabled !== false && profile?.soundEnabled) {
        navigator.vibrate(pattern);
      }
    } catch {}
  },
  cutSuccess() { this.vibrate(25); },
  cutFailure() { this.vibrate([60, 40, 80]); },
  powerActivate() { this.vibrate(30); },
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
function isAnalyticsConsentAllowed(privacyValue, consentValue) {
  return privacyValue === true && consentValue === true;
}

function isCrashReportingConsentAllowed(privacyValue, consentValue) {
  return privacyValue === true && consentValue === true;
}

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

async function deleteAccountDataSafely({ user, deleteCloudSave, deleteAuthAccount, restoreCloudSave, resetLocal }) {
  if (user?.uid) {
    let cloudResult;
    try {
      cloudResult = await deleteCloudSave(user.uid);
    } catch {
      cloudResult = { status: "ERROR" };
    }
    if (cloudResult?.status !== "SUCCESS") {
      return {
        success: false,
        stage: "cloud_delete",
        cloudSaveDeleted: false,
        message: "We couldn't delete your cloud save. Your account and local data were left unchanged. Check your connection and retry.",
      };
    }

    let authResult;
    try {
      authResult = await deleteAuthAccount(user.uid);
    } catch {
      authResult = { success: false, reason: "AUTH_DELETE_FAILED" };
    }
    if (!authResult?.success) {
      let restoreResult;
      try {
        restoreResult = await restoreCloudSave(user.uid);
      } catch {
        restoreResult = { status: "ERROR" };
      }
      const cloudSaveRestored = restoreResult?.status === "SUCCESS";
      const recentLoginRequired = authResult?.reason === "auth/requires-recent-login";
      return {
        success: false,
        stage: "auth_delete",
        reason: authResult?.reason || "AUTH_DELETE_FAILED",
        cloudSaveDeleted: !cloudSaveRestored,
        cloudSaveRestored,
        message: cloudSaveRestored
          ? (recentLoginRequired
            ? "Your cloud save was restored, but Firebase requires a recent sign-in to delete the account. Cancel, sign out, sign back in, then retry."
            : "Firebase couldn't delete the account. Your cloud save and local data were restored; retry when your connection is stable.")
          : "Account deletion is incomplete: Firebase did not delete the account and the cloud save could not be restored. Your local data remains on this device. Retry or contact support.",
      };
    }
  }

  try {
    await resetLocal();
    return { success: true, stage: "complete", cloudSaveDeleted: Boolean(user?.uid) };
  } catch {
    return {
      success: false,
      stage: "local_reset",
      cloudSaveDeleted: Boolean(user?.uid),
      message: "The account and cloud save were deleted, but local data could not be reset. Close and reopen the game, then check this device's saved data.",
    };
  }
}

const CloudSaveManager = (() => {
  let isConnected = typeof navigator !== "undefined" ? navigator.onLine : true;
  let _hasCloudSave = false;
  let activeConflictResolution = null;
  let deletingUid = null;
  let cloudWriteQueue = Promise.resolve();

  function enqueueCloudWrite(operation) {
    const task = cloudWriteQueue.then(operation, operation);
    cloudWriteQueue = task.then(() => undefined, () => undefined);
    return task;
  }

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

  function beginAccountDeletion(uid) {
    if (typeof uid !== "string" || !uid || deletingUid) return false;
    deletingUid = uid;
    return true;
  }

  function endAccountDeletion(uid) {
    if (deletingUid === uid) deletingUid = null;
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

    // Campaign: union of unlockedLevels, max of stars, max of highScores, best of fastestTimes
    const lCamp = l.campaign || {};
    const cCamp = c.campaign || {};
    const mergedUnlocked = Array.from(new Set([...(lCamp.unlockedLevels || [1]), ...(cCamp.unlockedLevels || [1])])).sort((a, b) => a - b);
    const mergedStars = Object.assign({}, lCamp.levelStars || {}, cCamp.levelStars || {});
    Object.keys(mergedStars).forEach(lvl => {
      mergedStars[lvl] = Math.max(lCamp.levelStars?.[lvl] || 0, cCamp.levelStars?.[lvl] || 0);
    });
    const mergedHighScores = Object.assign({}, lCamp.levelHighScores || {}, cCamp.levelHighScores || {});
    Object.keys(mergedHighScores).forEach(lvl => {
      mergedHighScores[lvl] = Math.max(lCamp.levelHighScores?.[lvl] || 0, cCamp.levelHighScores?.[lvl] || 0);
    });
    const mergedFastTimes = Object.assign({}, lCamp.levelFastestTimes || {}, cCamp.levelFastestTimes || {});
    Object.keys(mergedFastTimes).forEach(lvl => {
      const lt = lCamp.levelFastestTimes?.[lvl] || 0;
      const ct = cCamp.levelFastestTimes?.[lvl] || 0;
      if (lt > 0 && ct > 0) mergedFastTimes[lvl] = Math.min(lt, ct);
      else mergedFastTimes[lvl] = lt || ct || 0;
    });

    base.campaign = {
      currentChapter: 1,
      unlockedLevels: mergedUnlocked.length > 0 ? mergedUnlocked : [1],
      levelStars: mergedStars,
      levelHighScores: mergedHighScores,
      levelFastestTimes: mergedFastTimes
    };

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
      const localSave = SaveManager.normalize(localData);
      const analyticsAllowed = isAnalyticsConsentAllowed(localSave.privacy.analytics, localSave.consent.analytics)
        && isAnalyticsConsentAllowed(chosenSave.privacy.analytics, chosenSave.consent.analytics);
      chosenSave.privacy.analytics = analyticsAllowed;
      chosenSave.consent.analytics = analyticsAllowed;
      const crashReportingAllowed = isCrashReportingConsentAllowed(localSave.privacy.crashReporting, localSave.consent.crashReporting)
        && isCrashReportingConsentAllowed(chosenSave.privacy.crashReporting, chosenSave.consent.crashReporting);
      chosenSave.privacy.crashReporting = crashReportingAllowed;
      chosenSave.consent.crashReporting = crashReportingAllowed;
    } else if (choice === "merge") {
      chosenSave = mergeSaves(localData, cloudData);
    } else {
      chosenSave = SaveManager.normalize(localData);
    }

    profile = chosenSave;
    SaveManager.save(profile, true);
    void AnalyticsManager.refreshConsent();
    activeConflictResolution = null;
    refreshPersistentUI();
    AccountSettingsUI.render();
    void SentryCrashReportingManager.refreshConsent();
    void NativeCrashlyticsConsentManager.refreshConsent();
    updateMenuAccountBadge();
    if (typeof onResolved === "function") {
      onResolved(chosenSave);
    }
  }

  async function uploadSave(saveData, expectedUid = null, allowDeletionRestore = false) {
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
    if (expectedUid && user.uid !== expectedUid) {
      return { status: "AUTH_CHANGED", message: "The signed-in account changed before synchronization completed." };
    }
    if (deletingUid === user.uid && !allowDeletionRestore) {
      return { status: "ACCOUNT_DELETION_IN_PROGRESS", message: "Cloud synchronization is paused while account deletion is in progress." };
    }
    const db = typeof FirebaseManager !== "undefined" && typeof FirebaseManager.getDb === "function" ? FirebaseManager.getDb() : (typeof window !== "undefined" && window.firebase && typeof window.firebase.firestore === "function" ? window.firebase.firestore() : null);
    if (!db) {
      return { status: "UNAVAILABLE", message: "Firestore database service is unavailable." };
    }
    const payload = createSnapshot(saveData || profile);
    if (payload.account) {
      delete payload.account.password;
      delete payload.account.token;
    }
    payload.updatedAt = new Date().toISOString();
    return enqueueCloudWrite(async () => {
      const latestUser = FirebaseManager.getCurrentUser();
      if (!latestUser?.uid || latestUser.uid !== user.uid) {
        return { status: "AUTH_CHANGED", message: "The signed-in account changed before synchronization completed." };
      }
      if (deletingUid === user.uid && !allowDeletionRestore) {
        return { status: "ACCOUNT_DELETION_IN_PROGRESS", message: "Cloud synchronization is paused while account deletion is in progress." };
      }
      try {
        await db.collection("users").doc(user.uid).set(payload, { merge: true });
        _hasCloudSave = true;
        return { status: "SUCCESS", message: "Cloud save synchronized." };
      } catch (err) {
        console.warn("[CloudSaveManager] uploadSave error:", err?.code || "UNKNOWN");
        return { status: "ERROR", message: "Cloud save synchronization failed." };
      }
    });
  }

  async function downloadSave() {
    if (!AuthManager?.isAuthenticated?.()) {
      return { status: "GUEST_LOCAL_ONLY" };
    }
    const user = typeof FirebaseManager !== "undefined" ? FirebaseManager.getCurrentUser() : null;
    if (!user || !user.uid) {
      return { status: "NO_AUTH_USER" };
    }
    if (deletingUid === user.uid) return { status: "ACCOUNT_DELETION_IN_PROGRESS" };
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

  async function deleteUserSave(expectedUid) {
    const user = typeof FirebaseManager !== "undefined" ? FirebaseManager.getCurrentUser() : null;
    if (!user?.uid) {
      return { status: "NO_AUTH_USER", message: "Sign in again before deleting your cloud save." };
    }
    if (!expectedUid || user.uid !== expectedUid) {
      return { status: "AUTH_CHANGED", message: "The signed-in account changed. No cloud data was deleted." };
    }
    if (deletingUid !== user.uid) {
      return { status: "DELETE_NOT_LOCKED", message: "Account deletion was not initialized. No cloud data was deleted." };
    }
    if (!isConnected || (typeof navigator !== "undefined" && !navigator.onLine)) {
      return { status: "OFFLINE", message: "Connect to the internet and retry account deletion." };
    }
    const db = typeof FirebaseManager !== "undefined" && typeof FirebaseManager.getDb === "function"
      ? FirebaseManager.getDb()
      : null;
    if (!db) {
      return { status: "UNAVAILABLE", message: "Cloud storage is unavailable. Your account and local data were not deleted." };
    }
    return enqueueCloudWrite(async () => {
      const latestUser = FirebaseManager.getCurrentUser();
      if (!latestUser?.uid || latestUser.uid !== user.uid || deletingUid !== user.uid) {
        return { status: "AUTH_CHANGED", message: "The signed-in account changed. No cloud data was deleted." };
      }
      try {
        // The only user-owned Firestore path used by this app is users/{authenticated UID}.
        await db.collection("users").doc(user.uid).delete();
        _hasCloudSave = false;
        return { status: "SUCCESS" };
      } catch (err) {
        console.warn("[CloudSaveManager] User cloud-save deletion failed:", err?.code || "UNKNOWN");
        return {
          status: "ERROR",
          reason: err?.code || "FIRESTORE_DELETE_FAILED",
          message: "We couldn't delete your cloud save. Your account and local data were left unchanged. Check your connection and retry.",
        };
      }
    });
  }

  async function sync() {
    if (!AuthManager?.isAuthenticated?.() || !isConnected) {
      return { status: "LOCAL_SOURCE_OF_TRUTH" };
    }
    const currentUser = FirebaseManager.getCurrentUser();
    if (currentUser?.uid && deletingUid === currentUser.uid) {
      return { status: "ACCOUNT_DELETION_IN_PROGRESS" };
    }
    try {
      const res = await downloadSave();
      if (res.status === "SUCCESS" && res.data) {
        const cloudData = res.data;
        _hasCloudSave = true;
        profile = mergeSaves(profile, cloudData);
        void AnalyticsManager.refreshConsent();
        void SentryCrashReportingManager.refreshConsent();
        void NativeCrashlyticsConsentManager.refreshConsent();
        LocalSaveManager.save(profile);
        await uploadSave(profile);
        refreshPersistentUI();
        AccountSettingsUI.render();
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
    beginAccountDeletion,
    endAccountDeletion,
    createSnapshot,
    detectConflict,
    showConflictModal,
    mergeSaves,
    resolveConflict,
    uploadSave,
    downloadSave,
    deleteUserSave,
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
    hapticsEnabled: true,
    reducedMotion: false,
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
      crashReporting: false,
      personalizedAds: false,
    },
    consent: {
      essential: true,
      analytics: false,
      crashReporting: false,
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
    campaign: {
      currentChapter: 1,
      unlockedLevels: [1],
      levelStars: { 1: 0 },
      levelHighScores: { 1: 0 },
      levelFastestTimes: { 1: 0 },
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
    base.hapticsEnabled = incoming.hapticsEnabled !== undefined ? Boolean(incoming.hapticsEnabled) : true;
    base.reducedMotion = incoming.reducedMotion !== undefined ? Boolean(incoming.reducedMotion) : false;
    
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
    const consIn = (incoming.consent && typeof incoming.consent === "object" && !Array.isArray(incoming.consent)) ? incoming.consent : {};
    const analyticsAllowed = isAnalyticsConsentAllowed(privIn.analytics, consIn.analytics);
    const crashReportingAllowed = isCrashReportingConsentAllowed(privIn.crashReporting, consIn.crashReporting);
    base.privacy = {
      analytics: analyticsAllowed,
      crashReporting: crashReportingAllowed,
      personalizedAds: Boolean(privIn.personalizedAds),
    };

    base.consent = {
      essential: true,
      analytics: analyticsAllowed,
      crashReporting: crashReportingAllowed,
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

    const incCamp = (incoming.campaign && typeof incoming.campaign === "object" && !Array.isArray(incoming.campaign)) ? incoming.campaign : {};
    const rawUnlocked = Array.isArray(incCamp.unlockedLevels) ? incCamp.unlockedLevels.map(n => nonNegativeInt(n)).filter(n => n >= 1) : [1];
    if (!rawUnlocked.includes(1)) rawUnlocked.push(1);

    const rawStars = (incCamp.levelStars && typeof incCamp.levelStars === "object" && !Array.isArray(incCamp.levelStars)) ? incCamp.levelStars : {};
    const cleanStars = { 1: Math.min(3, nonNegativeInt(rawStars[1])) };
    Object.keys(rawStars).forEach(lvl => {
      const lvlNum = parseInt(lvl, 10);
      if (!Number.isNaN(lvlNum) && lvlNum >= 1) {
        cleanStars[lvlNum] = Math.min(3, Math.max(0, nonNegativeInt(rawStars[lvl])));
      }
    });

    const rawHighScores = (incCamp.levelHighScores && typeof incCamp.levelHighScores === "object" && !Array.isArray(incCamp.levelHighScores)) ? incCamp.levelHighScores : {};
    const cleanHighScores = { 1: nonNegativeInt(rawHighScores[1]) };
    Object.keys(rawHighScores).forEach(lvl => {
      const lvlNum = parseInt(lvl, 10);
      if (!Number.isNaN(lvlNum) && lvlNum >= 1) {
        cleanHighScores[lvlNum] = nonNegativeInt(rawHighScores[lvl]);
      }
    });

    const rawFastTimes = (incCamp.levelFastestTimes && typeof incCamp.levelFastestTimes === "object" && !Array.isArray(incCamp.levelFastestTimes)) ? incCamp.levelFastestTimes : {};
    const cleanFastTimes = { 1: nonNegativeInt(rawFastTimes[1]) };
    Object.keys(rawFastTimes).forEach(lvl => {
      const lvlNum = parseInt(lvl, 10);
      if (!Number.isNaN(lvlNum) && lvlNum >= 1) {
        cleanFastTimes[lvlNum] = nonNegativeInt(rawFastTimes[lvl]);
      }
    });

    base.campaign = {
      currentChapter: 1,
      unlockedLevels: Array.from(new Set(rawUnlocked)).sort((a, b) => a - b),
      levelStars: cleanStars,
      levelHighScores: cleanHighScores,
      levelFastestTimes: cleanFastTimes
    };

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

  function playTimerTick(remaining, difficultyKey = "easy", tension = 0) {
    if (isMuted) return;
    const isCritical = remaining <= 1.5 || tension >= 0.85;
    const isDanger = remaining <= 3.0 || tension >= 0.65;
    const currentUnit = isCritical ? Math.floor(remaining * 4) : isDanger ? Math.floor(remaining * 2) : Math.floor(remaining);
    if (lastTickUnit === currentUnit) return;
    lastTickUnit = currentUnit;

    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = "sine";
      const diffShift = difficultyKey === "extreme" ? 160 : difficultyKey === "veryHard" ? 110 : difficultyKey === "hard" ? 60 : 0;
      const freq = (isCritical ? 960 : isDanger ? 680 : 480) + diffShift;
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

  function playTimeSlow() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.35);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.38);
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

  function playPhaseComplete() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const notes = [587.33, 880.0];
      notes.forEach((freq, i) => {
        const startTime = ac.currentTime + i * 0.04;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.22, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.09);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    } catch {}
  }

  function playReconfiguration() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.15);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch {}
  }

  function playEventCue(type = "surge") {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(type === "override" ? 620 : 440, now);
      osc.frequency.exponentialRampToValueAtTime(type === "override" ? 880 : 720, now + 0.15);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.18);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
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
    playTimeSlow,
    playTimeFreeze,
    playPhaseComplete,
    playReconfiguration,
    playEventCue,
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
  let slowTimeoutId = null;
  let activeSecondChance = false;
  let isFrozen = false;
  let isSlowed = false;
  let purchasing = false;

  function logPower(action, details = {}) {
    console.log(`[PowerManager] ${action}:`, details);
  }

  function count(id) {
    return (profile && profile.powers) ? (profile.powers[id] || 0) : 0;
  }

  function purchase(id) {
    if (purchasing) return { status: "busy" };
    purchasing = true;
    const def = PowerDefinitions[id];
    if (!def) {
      purchasing = false;
      logPower("PURCHASE_INVALID_ID", { id });
      return { status: "invalid" };
    }
    if (profile.coins < def.price) {
      purchasing = false;
      logPower("PURCHASE_INSUFFICIENT_COINS", { id, price: def.price, coins: profile.coins });
      return { status: "insufficient", price: def.price };
    }
    const oldCount = profile.powers[id] || 0;
    profile.coins -= def.price;
    profile.powers[id] = oldCount + 1;
    SaveManager.save(profile);
    AchievementManager.onCoinsSpent(def.price);
    StatsManager.recordCoinsSpent(def.price);
    logPower("PURCHASE_SUCCESS", { id, oldCount, newCount: profile.powers[id], coinsLeft: profile.coins });
    window.setTimeout(() => { purchasing = false; }, 180);
    return { status: "purchased", count: profile.powers[id], price: def.price };
  }

  function canActivate(id) {
    if (state !== "PLAYING" || !run || run.inputLocked) return false;
    if (count(id) <= 0) return false;
    if (id === "timeFreeze" && isFrozen) return false;
    if (id === "timeSlow" && (isSlowed || isFrozen)) return false;
    if (id === "secondChance" && activeSecondChance) return false;
    return true;
  }

  function activate(id) {
    if (!canActivate(id)) {
      logPower("ACTIVATE_BLOCKED", { id, state, inputLocked: run?.inputLocked, currentCount: count(id), isFrozen, isSlowed, activeSecondChance });
      return false;
    }
    const oldCount = count(id);
    profile.powers[id] = Math.max(0, oldCount - 1);
    SaveManager.save(profile);
    updatePowerUI();

    if (run) run.powerUsedOnRun = true;
    if (run?.analyticsAttemptId) {
      run.analyticsPowerUseCount = (run.analyticsPowerUseCount || 0) + 1;
      AnalyticsManager.logGameplayEvent("power_used", run.analyticsAttemptId, `power-${run.analyticsPowerUseCount}`, {
        power_type: id
      });
    }
    try {
      if (typeof HapticsManager !== "undefined" && typeof HapticsManager.powerActivate === "function") {
        HapticsManager.powerActivate();
      }
    } catch {}

    try {
      AchievementManager.onPowerActivated(id);
      StatsManager.recordPowerUsed(id);
      DailyGoalsManager.onEvent("power", 1);
    } catch (e) {
      console.warn("[PowerManager] Observer event warning:", e);
    }

    logPower("ACTIVATE_SUCCESS", { id, oldCount, remainingCount: profile.powers[id] });

    if (id === "scanner") {
      activateScanner();
    } else if (id === "timeSlow") {
      activateTimeSlow();
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

    const incorrectWires = run.bomb.wires.filter(w => w.index !== run.bomb.challenge.answerIndex && !w.cut);
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

  function activateTimeSlow() {
    clearSlow();
    isSlowed = true;
    AudioManager.playTimeSlow();
    showFloatingText("TIME SLOWED (5s)", "#38bdf8");
    Timer.slow(0.5);
    if (el.timerWrap) el.timerWrap.classList.add("is-slowed");
    if (el.timerBarFill) el.timerBarFill.classList.add("is-slowed");
    if (el.bomb) el.bomb.classList.add("is-slowed");
    setBombStatus("SLOW");
    updatePowerUI();

    slowTimeoutId = setTimeout(() => {
      endSlow();
    }, 5000);
  }

  function endSlow() {
    if (!isSlowed) return;
    isSlowed = false;
    if (slowTimeoutId) {
      clearTimeout(slowTimeoutId);
      slowTimeoutId = null;
    }
    Timer.unslow();
    if (el.timerWrap) el.timerWrap.classList.remove("is-slowed");
    if (el.timerBarFill) el.timerBarFill.classList.remove("is-slowed");
    if (el.bomb) el.bomb.classList.remove("is-slowed");
    if (state === "PLAYING" && !isFrozen) {
      setBombStatus("ARMED");
    }
    updatePowerUI();
  }

  function clearSlow() {
    if (slowTimeoutId) {
      clearTimeout(slowTimeoutId);
      slowTimeoutId = null;
    }
    if (isSlowed) {
      isSlowed = false;
      Timer.unslow();
      if (el.timerWrap) el.timerWrap.classList.remove("is-slowed");
      if (el.timerBarFill) el.timerBarFill.classList.remove("is-slowed");
      if (el.bomb) el.bomb.classList.remove("is-slowed");
    }
  }

  function activateTimeFreeze() {
    clearFreeze();
    isFrozen = true;
    AudioManager.playTimeFreeze();
    showFloatingText("TIME FROZEN (3s)", "#00e5ff");
    Timer.freeze();
    if (el.timerWrap) el.timerWrap.classList.add("is-frozen");
    if (el.timerBarFill) el.timerBarFill.classList.add("is-frozen");
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
    if (el.timerWrap) el.timerWrap.classList.remove("is-frozen");
    if (el.timerBarFill) el.timerBarFill.classList.remove("is-frozen");
    if (state === "PLAYING") {
      if (isSlowed) {
        setBombStatus("SLOW");
      } else {
        setBombStatus("ARMED");
      }
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
    logPower("SECOND_CHANCE_CONSUMED");
    updatePowerUI();
  }

  function cleanup() {
    clearScanner();
    clearSlow();
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
    get isSlowed() { return isSlowed; },
    get activeSecondChance() { return activeSecondChance; }
  };
})();

const Timer = (() => {
  let frameId = null, startedAt = 0, duration = 0, remaining = 0, onTick = null, onExpired = null;
  let isFrozen = false, freezeStartedAt = 0, lastTickTime = 0;
  let timeScale = 1.0;
  let isSlowed = false;

  function tick(now) {
    if (isFrozen) {
      lastTickTime = now;
      frameId = requestAnimationFrame(tick);
      return;
    }
    const deltaSeconds = Math.max(0, (now - lastTickTime) / 1000);
    lastTickTime = now;
    if (deltaSeconds > 0 && deltaSeconds < 1.0) {
      StatsManager.addPlayTime(deltaSeconds);
      remaining = Math.max(0, remaining - deltaSeconds * timeScale);
    }

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
    isSlowed = false;
    timeScale = 1.0;
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
      lastTickTime = performance.now();
    }
  }
  function slow(scale = 0.5) {
    timeScale = scale;
    isSlowed = true;
  }
  function unslow() {
    timeScale = 1.0;
    isSlowed = false;
  }
  function stop() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    isFrozen = false;
    isSlowed = false;
    timeScale = 1.0;
  }
  return {
    start,
    pause,
    resume,
    freeze,
    unfreeze,
    slow,
    unslow,
    stop,
    get duration() { return duration; },
    get remaining() { return remaining; },
    get isFrozen() { return isFrozen; },
    get isSlowed() { return isSlowed; },
    get timeScale() { return timeScale; }
  };
})();

const RuleEngine = {
  definitions: {
    color: bomb => { const target = pick(bomb.wires); return rule("color", `CUT THE ${target.color.toUpperCase()} WIRE`, target.index); },
    onlyColor: bomb => {
      const counts = {};
      bomb.wires.forEach(w => counts[w.color] = (counts[w.color] || 0) + 1);
      const uniqueWires = bomb.wires.filter(w => counts[w.color] === 1);
      if (!uniqueWires.length) return null;
      const target = pick(uniqueWires);
      return rule("onlyColor", `CUT THE ONLY ${target.color.toUpperCase()} WIRE`, target.index);
    },
    position: bomb => pick([
      rule("position", "CUT THE FIRST WIRE FROM THE LEFT", 0),
      rule("position", "CUT THE SECOND WIRE FROM THE RIGHT", bomb.wires.length - 2),
      ...(bomb.wires.length % 2 ? [rule("position", "CUT THE MIDDLE WIRE", Math.floor(bomb.wires.length / 2))] : [])
    ]),
    length: bomb => {
      const ordered = [...bomb.wires].sort((a, b) => b.length - a.length);
      return pick([
        rule("length", "CUT THE LONGEST WIRE", ordered[0].index),
        rule("length", "CUT THE SHORTEST WIRE", ordered.at(-1).index),
        ...(ordered.length >= 4 ? [rule("length", "CUT THE SECOND LONGEST WIRE", ordered[1].index), rule("length", "CUT THE SECOND SHORTEST WIRE", ordered.at(-2).index)] : [])
      ]);
    },
    relation: bomb => {
      if (bomb.wires.length < 3) return null;
      const index = randomInt(1, bomb.wires.length - 2), left = bomb.wires[index - 1], right = bomb.wires[index + 1];
      return rule("relation", `CUT THE WIRE BETWEEN ${left.color.toUpperCase()} AND ${right.color.toUpperCase()}`, index);
    },
    combination: bomb => {
      const ordered = [...bomb.wires].sort((a, b) => b.length - a.length), longest = ordered[0], shortestOther = ordered.filter(wire => wire.index !== longest.index).at(-1);
      const options = [rule("combination", `CUT THE LONGEST ${longest.color.toUpperCase()} WIRE`, longest.index)];
      if (shortestOther) options.push(rule("combination", `CUT THE SHORTEST WIRE THAT IS NOT ${longest.color.toUpperCase()}`, shortestOther.index));
      if (ordered.length >= 4) options.push(rule("combination", `CUT THE SECOND LONGEST ${ordered[1].color.toUpperCase()} WIRE`, ordered[1].index));
      return pick(options);
    },
    memory: (bomb, history) => {
      if (!history || history.lastAnswerIndex === null || history.lastAnswerIndex >= bomb.wires.length) return null;
      const opposite = bomb.wires.length - 1 - history.lastAnswerIndex;
      return pick([
        rule("memory", "CUT THE SAME POSITION AS LAST ROUND", history.lastAnswerIndex),
        rule("memory", "CUT THE POSITION OPPOSITE LAST ROUND", opposite)
      ]);
    },
    signal: bomb => {
      const wiresWithSignals = bomb.wires.filter(w => typeof w.signalNodes === "number");
      if (!wiresWithSignals.length) return null;
      const maxSignal = Math.max(...wiresWithSignals.map(w => w.signalNodes));
      const minSignal = Math.min(...wiresWithSignals.map(w => w.signalNodes));
      const maxWires = wiresWithSignals.filter(w => w.signalNodes === maxSignal);
      const minWires = wiresWithSignals.filter(w => w.signalNodes === minSignal);
      const options = [];
      if (maxWires.length === 1 && maxSignal > minSignal) {
        options.push(rule("signal", "CUT THE WIRE WITH HIGHEST SIGNAL NODES", maxWires[0].index));
      }
      if (minWires.length === 1 && maxSignal > minSignal) {
        options.push(rule("signal", "CUT THE WIRE WITH LOWEST SIGNAL NODES", minWires[0].index));
      }
      const counts = {};
      wiresWithSignals.forEach(w => counts[w.signalNodes] = (counts[w.signalNodes] || 0) + 1);
      wiresWithSignals.forEach(w => {
        if (counts[w.signalNodes] === 1) {
          options.push(rule("signal", `CUT THE WIRE WITH ${w.signalNodes} SIGNAL NODE${w.signalNodes > 1 ? "S" : ""}`, w.index));
        }
      });
      return options.length ? pick(options) : null;
    },
    led: bomb => {
      const ledWires = bomb.wires.filter(w => w.hasWarningLed);
      if (ledWires.length === 1) {
        return rule("led", "CUT THE WIRE WITH THE WARNING LED", ledWires[0].index);
      }
      return null;
    },
    adjacency: bomb => {
      const options = [];
      bomb.wires.forEach((w, idx) => {
        if (idx < bomb.wires.length - 1) {
          const right = bomb.wires[idx + 1];
          options.push(rule("adjacency", `CUT THE WIRE LEFT OF ${right.color.toUpperCase()}`, idx));
        }
        if (idx > 0) {
          const left = bomb.wires[idx - 1];
          options.push(rule("adjacency", `CUT THE WIRE RIGHT OF ${left.color.toUpperCase()}`, idx));
        }
      });
      const ordered = [...bomb.wires].sort((a, b) => b.length - a.length);
      const longestIdx = ordered[0].index;
      if (longestIdx > 0) {
        options.push(rule("adjacency", "CUT THE WIRE LEFT OF THE LONGEST WIRE", longestIdx - 1));
      }
      if (longestIdx < bomb.wires.length - 1) {
        options.push(rule("adjacency", "CUT THE WIRE RIGHT OF THE LONGEST WIRE", longestIdx + 1));
      }
      return options.length ? pick(options) : null;
    },
    order: bomb => {
      const ordered = [...bomb.wires].sort((a, b) => b.length - a.length);
      if (ordered.length >= 4) {
        return pick([
          rule("order", "CUT THE SECOND SHORTEST WIRE", ordered.at(-2).index),
          rule("order", "CUT THE SECOND LONGEST WIRE", ordered[1].index)
        ]);
      }
      return null;
    },
    count: bomb => {
      const idx = randomInt(0, bomb.wires.length - 1);
      return rule("count", `CUT WIRE ${idx + 1}`, idx);
    },
  },
  create(bomb, allowed, history) { return shuffle(allowed).map(type => this.definitions[type] ? this.definitions[type](bomb, history) : null).find(Boolean) || this.definitions.color(bomb); },
};

const BombEventRegistry = {
  powerSurge: {
    id: "powerSurge",
    displayName: "POWER SURGE",
    scoreMultiplier: 1.75,
    minDifficulty: "hard",
    minBomb: 6,
    className: "event-power-surge",
    audioStyle: "surge",
    description: "High-voltage surge detected"
  },
  reconfiguration: {
    id: "reconfiguration",
    displayName: "SYSTEM RECONFIGURATION",
    scoreMultiplier: 1.75,
    minDifficulty: "hard",
    minBomb: 8,
    className: "event-reconfig",
    audioStyle: "reconfig",
    description: "Dynamic circuit reconfiguration"
  },
  emergencyOverride: {
    id: "emergencyOverride",
    displayName: "EMERGENCY OVERRIDE",
    scoreMultiplier: 1.75,
    minDifficulty: "veryHard",
    minBomb: 10,
    className: "event-override",
    audioStyle: "override",
    description: "Urgent two-step safety override"
  }
};

const BombFactory = {
  getPhaseCount(number, difficultyKey, wireCount) {
    if (number === 1) return 1;
    const roll = Math.random();
    let requestedPhases = 1;

    if (number <= 3) {
      requestedPhases = roll < 0.85 ? 1 : 2;
    } else if (number <= 6) {
      requestedPhases = roll < 0.65 ? 1 : 2;
    } else if (number <= 9) {
      if (roll < 0.50) requestedPhases = 1;
      else if (roll < 0.85) requestedPhases = 2;
      else requestedPhases = 3;
    } else if (number <= 14) {
      if (roll < 0.35) requestedPhases = 1;
      else if (roll < 0.75) requestedPhases = 2;
      else requestedPhases = 3;
    } else {
      if (roll < 0.35) requestedPhases = 1;
      else if (roll < 0.65) requestedPhases = 2;
      else requestedPhases = 3;
    }

    if (difficultyKey === "easy" || difficultyKey === "normal") {
      requestedPhases = Math.min(2, requestedPhases);
    }

    const maxSolvablePhases = Math.max(1, wireCount - 1);
    return Math.min(requestedPhases, maxSolvablePhases);
  },

  getEventForBomb(number, difficultyKey) {
    if (number < 4) return null;
    const diffRanks = { easy: 0, normal: 1, hard: 2, veryHard: 3, extreme: 4 };
    const currRank = diffRanks[difficultyKey] || 0;

    let eventChance = 0;
    if (number >= 4 && number <= 6) eventChance = 0.05;
    else if (number >= 7 && number <= 9) eventChance = 0.15;
    else if (number >= 10 && number <= 14) eventChance = 0.05;
    else if (number >= 15) eventChance = 0.10;

    if (Math.random() > eventChance) return null;

    const eligibleEvents = Object.values(BombEventRegistry).filter(evt => {
      return number >= evt.minBomb || currRank >= (diffRanks[evt.minDifficulty] || 0);
    });
    if (!eligibleEvents.length) return null;
    return pick(eligibleEvents);
  },

  create(number, history) {
    if (number === 1) {
      const colors = shuffle(["blue", "red", "green", "yellow"]).slice(0, 3);
      const wires = colors.map((color, index) => ({ color, index, length: 0.72 + index * 0.08, cut: false, signalNodes: index + 1, hasWarningLed: false }));
      const target = pick(wires);
      const bomb = { number: 1, wires, time: getEndlessBaseTime(1) + UpgradeManager.timeBonus() };
      const phase0 = rule("color", `CUT THE ${target.color.toUpperCase()} WIRE`, target.index);
      bomb.phases = [{ phaseIndex: 0, totalPhases: 1, ...phase0 }];
      bomb.currentPhaseIndex = 0;
      bomb.totalPhases = 1;
      bomb.challenge = bomb.phases[0];
      bomb.event = null;
      return bomb;
    }

    const diffKey = getEndlessDifficulty(number);
    const diffCfg = EndlessDifficultyConfig[diffKey];
    const wireRange = diffCfg.wires;
    const count = randomInt(wireRange[0], wireRange[1]);
    const wires = shuffle(GameConfig.wireColors).slice(0, count).map((color, index) => ({ color, index, length: 0, cut: false }));
    const closeness = Math.min(.28, Math.max(0, (number - 6) * .014)), base = .6 + closeness;
    shuffle(wires).forEach((wire, rank) => { wire.length = base + (count - rank) * ((.36 - closeness) / count); });
    
    // Distribute signal nodes (1 to 3) across wires
    const signalChoices = [1, 2, 3];
    wires.forEach((wire, idx) => {
      wire.signalNodes = signalChoices[idx % signalChoices.length];
      wire.hasWarningLed = false;
    });
    // Assign warning LED deterministically on hard+ or randomly
    if (diffKey === "hard" || diffKey === "veryHard" || diffKey === "extreme" || Math.random() < 0.4) {
      const ledTarget = pick(wires);
      if (ledTarget) ledTarget.hasWarningLed = true;
    }

    const bomb = { number, wires, time: getEndlessBaseTime(number) + UpgradeManager.timeBonus() };
    const eventDef = this.getEventForBomb(number, diffKey);
    let totalPhases = this.getPhaseCount(number, diffKey, count);
    if (eventDef && (eventDef.id === "emergencyOverride" || eventDef.id === "reconfiguration")) {
      totalPhases = Math.max(2, Math.min(2, count - 1));
    }

    const phases = [];
    const usedWireIndices = new Set();

    // Phase 1 (index 0)
    const phase0Rule = RuleEngine.create(bomb, diffCfg.rules, history);
    usedWireIndices.add(phase0Rule.answerIndex);
    phases.push({
      phaseIndex: 0,
      totalPhases,
      type: phase0Rule.type,
      text: phase0Rule.text,
      answerIndex: phase0Rule.answerIndex
    });

    // Phase 2 (index 1) if applicable
    if (totalPhases >= 2) {
      const remainingWires = wires.filter(w => !usedWireIndices.has(w.index));
      if (remainingWires.length > 0) {
        const targetWire = pick(remainingWires);
        usedWireIndices.add(targetWire.index);
        
        let phaseText = `CUT THE ${targetWire.color.toUpperCase()} WIRE`;
        let phaseType = "color";
        if (targetWire.index === 0 && Math.random() < 0.4) {
          phaseText = "CUT THE FIRST WIRE FROM THE LEFT";
          phaseType = "position";
        } else if (targetWire.index === wires.length - 1 && Math.random() < 0.4) {
          phaseText = "CUT THE LAST WIRE ON THE RIGHT";
          phaseType = "position";
        } else if (Math.random() < 0.3) {
          phaseText = `CUT WIRE ${targetWire.index + 1}`;
          phaseType = "position";
        }

        phases.push({
          phaseIndex: 1,
          totalPhases,
          type: phaseType,
          text: phaseText,
          answerIndex: targetWire.index
        });
      }
    }

    // Phase 3 (index 2) if applicable
    if (totalPhases >= 3) {
      const remainingWires = wires.filter(w => !usedWireIndices.has(w.index));
      if (remainingWires.length > 0) {
        const targetWire = pick(remainingWires);
        usedWireIndices.add(targetWire.index);
        phases.push({
          phaseIndex: 2,
          totalPhases,
          type: "color",
          text: `CUT WIRE ${targetWire.index + 1} (${targetWire.color.toUpperCase()})`,
          answerIndex: targetWire.index
        });
      }
    }

    const actualTotal = phases.length;
    phases.forEach(p => { p.totalPhases = actualTotal; });

    bomb.phases = phases;
    bomb.currentPhaseIndex = 0;
    bomb.totalPhases = actualTotal;
    bomb.challenge = phases[0];
    bomb.event = eventDef || null;

    return bomb;
  },
};

const Scoring = {
  award: (type, secondsLeft, streak, difficultyKey = "easy", phaseMultiplier = 1.0) => {
    const base = GameConfig.score[type] || 100;
    const speedBonus = Math.round(secondsLeft * GameConfig.speedBonusPerSecond * UpgradeManager.speedMultiplier());
    const diffBonus = EndlessDifficultyConfig[difficultyKey]?.bonus || 0;
    const streakMult = getStreakMultiplier(streak);
    const mult = Number(phaseMultiplier) || 1.0;
    return Math.round((base + speedBonus + diffBonus) * streakMult * mult);
  }
};

const ShopUI = (() => {
  const SHOW_UPGRADES_IN_SHOP = false;
  let purchasing = false;
  function render() {
    el.shopCoins.textContent = profile.coins.toLocaleString();
    el.upgradeList.replaceChildren();
    el.powerList.replaceChildren();

    const catUpgrades = byId("shop-cat-upgrades");
    if (catUpgrades) {
      catUpgrades.style.display = SHOW_UPGRADES_IN_SHOP ? "block" : "none";
    }
    if (el.upgradeList) {
      el.upgradeList.style.display = SHOW_UPGRADES_IN_SHOP ? "grid" : "none";
    }

    if (SHOW_UPGRADES_IN_SHOP) {
      // Upgrades
      Object.entries(UpgradeDefinitions).forEach(([id, item]) => {
        const level = UpgradeManager.level(id), max = UpgradeManager.maxLevel(id), price = UpgradeManager.nextPrice(id), card = document.createElement("article");
        card.className = "upgrade-card"; card.dataset.upgrade = id;
        card.innerHTML = `<div class="upgrade-icon">${item.icon}</div><div class="upgrade-copy"><h2>${item.name}</h2><p>${item.description}</p><span>LEVEL ${level}/${max} · ${item.effect(level)}</span></div><div class="upgrade-action"><strong>${price === null ? "MAX" : `◆ ${price}`}</strong><button class="upgrade-btn ${price === null ? "is-max" : ""}">${price === null ? "MAX LEVEL" : "UPGRADE"}</button></div>`;
        card.querySelector("button").addEventListener("click", () => buyUpgrade(id, card));
        el.upgradeList.appendChild(card);
      });
    }

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
    difficulty: "easy",
    timeBank: 0,
    baseTime: ENDLESS_BASE_TIME,
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
  Object.values(screens).forEach(screen => {
    if (!screen) return;
    screen.classList.remove("active");
    if (screen.hasAttribute("aria-hidden")) {
      screen.setAttribute("aria-hidden", "true");
    }
  });
  const target = screens[name];
  if (target) {
    target.classList.add("active");
    if (target.hasAttribute("aria-hidden")) {
      target.setAttribute("aria-hidden", "false");
    }
  }
  window.BombDefuseAdMobService?.setScreen(name);
}
function later(callback, milliseconds) { const id = setTimeout(() => { pendingTimeouts.delete(id); callback(); }, milliseconds); pendingTimeouts.add(id); return id; }
function clearPendingTransitions() { pendingTimeouts.forEach(id => clearTimeout(id)); pendingTimeouts.clear(); }
function setBombStatus(status) {
  if (el.bomb) {
    el.bomb.dataset.status = status.toLowerCase();
    el.bomb.classList.remove(
      "status-arming", "status-armed", "status-warning", "status-danger", "status-critical",
      "status-success", "status-failure", "status-frozen", "status-slow", "status-timeslow", "status-saved", "status-shielded"
    );
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

const BOMB_DEFUSE_BUILD_CONFIG = (typeof window !== "undefined"
  && window.__BOMB_DEFUSE_BUILD_CONFIG__
  && typeof window.__BOMB_DEFUSE_BUILD_CONFIG__ === "object")
  ? window.__BOMB_DEFUSE_BUILD_CONFIG__
  : null;
const IS_LOCAL_DEVELOPMENT_HOST = location.hostname === "localhost"
  || location.hostname === "127.0.0.1"
  || location.protocol === "file:";

// The Sentry DSN is a public client identifier, not an authentication token.
// Leave empty until the development project's DSN is configured.
const SENTRY_CONFIG = {
  dsn: "https://6d31f9c1f4668513e38c2be99c7a197a@o4512237308870656.ingest.de.sentry.io/4512237325910096",
  release: "",
  environment: BOMB_DEFUSE_BUILD_CONFIG?.sentryEnvironment === "production"
    || BOMB_DEFUSE_BUILD_CONFIG?.sentryEnvironment === "development"
    ? BOMB_DEFUSE_BUILD_CONFIG.sentryEnvironment
    : (IS_LOCAL_DEVELOPMENT_HOST ? "development" : "production"),
  developmentTools: typeof BOMB_DEFUSE_BUILD_CONFIG?.allowDevelopmentTestHelper === "boolean"
    ? BOMB_DEFUSE_BUILD_CONFIG.allowDevelopmentTestHelper
    : IS_LOCAL_DEVELOPMENT_HOST,
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

  async function deleteAccount(expectedUid) {
    const active = auth ? auth.currentUser : currentUser;
    if (!active) {
      return { success: false, reason: "AUTH_SESSION_MISSING", message: "Your Firebase sign-in session is unavailable. Sign in again and retry." };
    }
    if (!expectedUid || active.uid !== expectedUid) {
      return { success: false, reason: "AUTH_USER_CHANGED", message: "The signed-in account changed. No account was deleted." };
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
    getCurrentUser: () => auth ? auth.currentUser : currentUser,
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
  let accountDeletionInProgress = false;
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
      AccountSettingsUI.render();
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
    if (accountDeletionInProgress) {
      return { success: false, stage: "in_progress", message: "Account deletion is already in progress." };
    }
    accountDeletionInProgress = true;
    let deletionLockUid = null;
    try {
      const firebaseUser = FirebaseManager.getCurrentUser();
      const registeredProfile = profile.account?.mode === "registered";
      if (registeredProfile && !firebaseUser?.uid) {
        return { success: false, stage: "auth_session", message: "Your Firebase sign-in session is unavailable. Your account and local data were not deleted. Sign in again and retry." };
      }
      if (firebaseUser?.uid && (!registeredProfile || profile.account?.userId !== firebaseUser.uid)) {
        return { success: false, stage: "auth_session", message: "The signed-in account does not match this local profile. No data was deleted. Reopen the account and retry." };
      }

      const deletionUser = firebaseUser?.uid ? { uid: firebaseUser.uid } : null;
      if (deletionUser) {
        if (!CloudSaveManager.beginAccountDeletion(deletionUser.uid)) {
          return { success: false, stage: "in_progress", message: "Cloud synchronization is already stopping for this account. Retry in a moment." };
        }
        deletionLockUid = deletionUser.uid;
      }
      const localSnapshot = CloudSaveManager.createSnapshot(profile);
      const result = await deleteAccountDataSafely({
        user: deletionUser,
        deleteCloudSave: uid => CloudSaveManager.deleteUserSave(uid),
        deleteAuthAccount: uid => FirebaseManager.deleteAccount(uid),
        restoreCloudSave: uid => CloudSaveManager.uploadSave(localSnapshot, uid, true),
        resetLocal: () => {
          profile = SaveManager.reset();
          AnalyticsManager.refreshConsent();
          SentryCrashReportingManager.refreshConsent();
          void NativeCrashlyticsConsentManager.refreshConsent();
          AudioManager.playLogout();
          HapticsManager.logout();
          refreshPersistentUI();
          updateMenuAccountBadge();
          DailyGoalsManager.updateBadge();
        },
      });

      if (!result.success) return result;
      showToast(result.cloudSaveDeleted
        ? "ACCOUNT, CLOUD SAVE, AND LOCAL DATA DELETED"
        : "LOCAL GAME DATA DELETED", "success", 5000);
      showScreen("menu");
      return result;
    } catch {
      return { success: false, stage: "unexpected", message: "Account deletion did not complete. Your local data was kept when possible; retry or contact support." };
    } finally {
      if (deletionLockUid) CloudSaveManager.endAccountDeletion(deletionLockUid);
      accountDeletionInProgress = false;
    }
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
  const ANALYTICS_SDK_URL = "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics-compat.js";
  const MAX_PENDING_EVENTS = 64;
  const PUZZLE_TYPES = new Set([
    "wire_defusal", "circuit_flow", "signal_memory", "combination",
    "word_puzzle", "circuit_overload", "signal_order", "final_protocol"
  ]);
  const DIFFICULTIES = new Set(["easy", "normal", "hard", "very_hard", "extreme"]);
  const RULE_TYPES = new Set([
    "color", "position", "length", "relation", "combination", "memory", "master",
    "signal", "led", "adjacency", "order", "onlyColor", "count"
  ]);
  const POWER_TYPES = new Set(["scanner", "timeSlow", "timeFreeze", "secondChance"]);
  const EVENT_SCHEMAS = {
    level_started: {
      level_id: value => Number.isInteger(value) && value >= 1 && value <= 10 ? value : null,
      puzzle_type: value => PUZZLE_TYPES.has(value) ? value : null
    },
    level_completed: {
      level_id: value => Number.isInteger(value) && value >= 1 && value <= 10 ? value : null,
      puzzle_type: value => PUZZLE_TYPES.has(value) ? value : null,
      duration_seconds: value => Number.isFinite(value) && value >= 0 && value <= 3600 ? Math.round(value * 10) / 10 : null,
      stars_earned: value => Number.isInteger(value) && value >= 0 && value <= 3 ? value : null
    },
    level_failed: {
      level_id: value => Number.isInteger(value) && value >= 1 && value <= 10 ? value : null,
      puzzle_type: value => PUZZLE_TYPES.has(value) ? value : null,
      duration_seconds: value => Number.isFinite(value) && value >= 0 && value <= 3600 ? Math.round(value * 10) / 10 : null
    },
    power_used: {
      power_type: value => POWER_TYPES.has(value) ? value : null
    },
    bomb_generation_result: {
      difficulty: value => DIFFICULTIES.has(value) ? value : null,
      wire_count: value => Number.isInteger(value) && value >= 3 && value <= 8 ? value : null,
      phase_count: value => Number.isInteger(value) && value >= 1 && value <= 3 ? value : null,
      rule_type: value => RULE_TYPES.has(value) ? value : null
    }
  };

  let analyticsSdkPromise = null;
  let cancelAnalyticsSdkLoad = null;
  let analyticsInstance = null;
  let collectionEnabled = false;
  let initializationPromise = null;
  let initializationGeneration = -1;
  let consentGeneration = 0;
  let consentWasEnabled = false;
  let failedGeneration = -1;
  let nextAttemptId = 0;
  const transitionKeysByAttempt = new WeakMap();
  let pendingEvents = [];

  function isEnabled() {
    return Boolean(ConsentManager && ConsentManager.hasConsent("analytics"));
  }

  function puzzleTypeForLevel(levelDef) {
    const types = {
      FREE_FLOW: "circuit_flow",
      SIGNAL_MEMORY: "signal_memory",
      COMBINATION: "combination",
      WORD_PUZZLE: "word_puzzle",
      CIRCUIT_OVERLOAD: "circuit_overload",
      SIGNAL_ORDER: "signal_order",
      FINAL_PROTOCOL: "final_protocol"
    };
    return types[levelDef?.gameplayType] || "wire_defusal";
  }

  function sanitizeEvent(eventName, params) {
    if (typeof eventName !== "string" || !Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, eventName)) return null;
    const schema = EVENT_SCHEMAS[eventName];
    if (!schema || !params || typeof params !== "object" || Array.isArray(params)) return null;

    const safe = {};
    for (const [key, validate] of Object.entries(schema)) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) return null;
      const value = validate(params[key]);
      if (value === null) return null;
      safe[key] = value;
    }
    return safe;
  }

  function hasDefaultFirebaseApp() {
    return Boolean(window.firebase?.apps?.some(app => app.name === "[DEFAULT]"));
  }

  function loadAnalyticsSdk() {
    if (!isEnabled()) return Promise.resolve(false);
    if (typeof window.firebase?.analytics === "function") return Promise.resolve(true);
    if (analyticsSdkPromise) return analyticsSdkPromise;

    analyticsSdkPromise = new Promise(resolve => {
      const script = document.createElement("script");
      let settled = false;
      let timeoutId = null;

      const finish = loaded => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        cancelAnalyticsSdkLoad = null;
        if (!loaded) {
          script.remove();
          analyticsSdkPromise = null;
        }
        resolve(Boolean(loaded && typeof window.firebase?.analytics === "function"));
      };

      script.id = "firebase-analytics-compat-sdk";
      script.src = ANALYTICS_SDK_URL;
      script.async = true;
      script.onload = () => finish(typeof window.firebase?.analytics === "function");
      script.onerror = () => finish(false);
      cancelAnalyticsSdkLoad = () => finish(false);
      timeoutId = window.setTimeout(() => finish(false), 10000);
      document.head.appendChild(script);
    });

    return analyticsSdkPromise;
  }

  function disableCollection() {
    pendingEvents = [];
    collectionEnabled = false;
    if (cancelAnalyticsSdkLoad) cancelAnalyticsSdkLoad();
    try {
      if (FIREBASE_CONFIG.measurementId) {
        window[`ga-disable-${FIREBASE_CONFIG.measurementId}`] = true;
      }
    } catch {}
    if (!analyticsInstance) return;

    try {
      analyticsInstance.setAnalyticsCollectionEnabled(false);
    } catch {
      // The wrapper remains closed even if the SDK cannot disable itself.
    }
  }

  function sendEvent(eventName, params) {
    if (!isEnabled() || !collectionEnabled || !analyticsInstance) return false;
    try {
      analyticsInstance.logEvent(eventName, params);
      return true;
    } catch {
      return false;
    }
  }

  function flushPendingEvents(generation) {
    const queued = pendingEvents;
    pendingEvents = [];
    queued.forEach(item => {
      if (item.generation === generation && isEnabled()) {
        sendEvent(item.eventName, item.params);
      }
    });
  }

  async function initializeForConsent(generation) {
    try {
      const loaded = await loadAnalyticsSdk();
      if (!loaded) {
        if (isEnabled() && generation === consentGeneration) {
          failedGeneration = generation;
          pendingEvents = [];
        }
        return false;
      }
      if (!isEnabled() || generation !== consentGeneration) return false;
      if (!hasDefaultFirebaseApp()) {
        failedGeneration = generation;
        pendingEvents = [];
        disableCollection();
        return false;
      }

      const analyticsApi = window.firebase.analytics;
      if (typeof analyticsApi.isSupported !== "function" || !await analyticsApi.isSupported()) {
        failedGeneration = generation;
        pendingEvents = [];
        disableCollection();
        return false;
      }
      if (!isEnabled() || generation !== consentGeneration) return false;

      const instance = analyticsApi();
      if (!instance || typeof instance.logEvent !== "function" || typeof instance.setAnalyticsCollectionEnabled !== "function") {
        failedGeneration = generation;
        pendingEvents = [];
        disableCollection();
        return false;
      }

      // SDK startup (including automatic events) occurs only after valid opt-in.
      analyticsInstance = instance;
      instance.setAnalyticsCollectionEnabled(true);
      if (!isEnabled() || generation !== consentGeneration) {
        disableCollection();
        return false;
      }
      collectionEnabled = true;
      flushPendingEvents(generation);
      return true;
    } catch {
      failedGeneration = generation;
      pendingEvents = [];
      disableCollection();
      return false;
    }
  }

  function refreshConsent() {
    if (!isEnabled()) {
      if (consentWasEnabled) consentGeneration += 1;
      consentWasEnabled = false;
      disableCollection();
      return Promise.resolve(false);
    }

    if (!consentWasEnabled) {
      consentGeneration += 1;
      consentWasEnabled = true;
    }
    // The Google tag honors this global kill switch independently of the Firebase
    // wrapper. Clear it only after the authoritative consent check above succeeds.
    try {
      if (FIREBASE_CONFIG.measurementId) {
        window[`ga-disable-${FIREBASE_CONFIG.measurementId}`] = false;
      }
    } catch {}
    const generation = consentGeneration;
    if (analyticsInstance && collectionEnabled) return Promise.resolve(true);
    if (failedGeneration === generation) return Promise.resolve(false);
    if (initializationPromise) {
      if (initializationGeneration === generation) return initializationPromise;
      return initializationPromise.then(() => refreshConsent(), () => refreshConsent());
    }

    initializationGeneration = generation;
    initializationPromise = initializeForConsent(generation);
    const currentPromise = initializationPromise;
    currentPromise.then(() => {
      if (initializationPromise === currentPromise) {
        initializationPromise = null;
        initializationGeneration = -1;
      }
    }, () => {
      if (initializationPromise === currentPromise) {
        initializationPromise = null;
        initializationGeneration = -1;
      }
    });
    return currentPromise;
  }

  function initialize() {
    return refreshConsent();
  }

  function logGameplayEvent(eventName, attempt, transitionKey, params) {
    const safeParams = sanitizeEvent(eventName, params);
    if (!safeParams || !attempt || typeof attempt !== "object" || typeof transitionKey !== "string") return false;

    let transitionKeys = transitionKeysByAttempt.get(attempt);
    if (!transitionKeys) {
      transitionKeys = new Set();
      transitionKeysByAttempt.set(attempt, transitionKeys);
    }
    if (transitionKeys.has(transitionKey)) return false;
    transitionKeys.add(transitionKey);

    // Suppressed transitions are consumed, not queued for a later opt-in.
    if (!isEnabled()) return false;
    if (analyticsInstance && collectionEnabled) return sendEvent(eventName, safeParams);
    if (failedGeneration === consentGeneration || pendingEvents.length >= MAX_PENDING_EVENTS) return false;

    pendingEvents.push({ eventName, params: safeParams, generation: consentGeneration });
    void refreshConsent();
    return true;
  }

  function beginAttempt() {
    nextAttemptId += 1;
    return { analyticsAttemptId: nextAttemptId };
  }

  return { initialize, isEnabled, refreshConsent, beginAttempt, puzzleTypeForLevel, logGameplayEvent };
})();

/* =========================================================
   CONSENT & PRIVACY MANAGERS
========================================================= */
const ConsentManager = (() => {
  function hasConsent(type) {
    if (type === "essential") return true;
    if (type === "analytics") {
      return isAnalyticsConsentAllowed(profile?.privacy?.analytics, profile?.consent?.analytics);
    }
    if (type === "crashReporting") {
      return isCrashReportingConsentAllowed(profile?.privacy?.crashReporting, profile?.consent?.crashReporting);
    }
    return Boolean(profile?.consent?.[type]);
  }

  function setConsent(type, val) {
    if (type === "essential") return;
    if (!profile.consent) profile.consent = { essential: true, analytics: false, crashReporting: false, personalizedAds: false };
    if (!profile.privacy) profile.privacy = { analytics: false, crashReporting: false, personalizedAds: false };
    const allowed = type === "crashReporting" ? val === true : (type === "analytics" ? val === true : Boolean(val));
    profile.consent[type] = allowed;
    profile.privacy[type] = allowed;
    SaveManager.save(profile);
    if (type === "analytics") void AnalyticsManager.refreshConsent();
    if (type === "crashReporting") {
      void SentryCrashReportingManager.refreshConsent();
      return NativeCrashlyticsConsentManager.setExplicitConsent(allowed);
    }
  }

  return { hasConsent, setConsent };
})();

/* =========================================================
   PHASE 2: CONSENT-GATED SENTRY BROWSER REPORTING
========================================================= */
const SentryCrashReportingManager = (() => {
  const SDK_URL = "https://browser.sentry-cdn.com/11.1.0/bundle.min.js";
  const SDK_SCRIPT_ID = "sentry-browser-sdk";
  const LOAD_TIMEOUT_MS = 12000;
  const isDevelopment = SENTRY_CONFIG.developmentTools === true;

  let consentGeneration = 0;
  let consentWasEnabled = false;
  let sdkLoad = null;
  let initialization = null;
  let initializationGeneration = -1;
  let activeSession = null;
  const seenErrors = new WeakSet();

  function diagnostic(level, message) {
    if (!isDevelopment || !/^(info|warn|error)$/.test(level)) return;
    console[level](`[Sentry] ${message}`);
  }

  function hasConsent() {
    return Boolean(ConsentManager && ConsentManager.hasConsent("crashReporting"));
  }

  function hasDsn() {
    return typeof SENTRY_CONFIG.dsn === "string" && SENTRY_CONFIG.dsn.trim().length > 0;
  }

  function isSessionAllowed(session, generation = session?.generation) {
    return Boolean(
      session &&
      session.active &&
      session.generation === generation &&
      consentGeneration === generation &&
      hasConsent() &&
      hasDsn()
    );
  }

  function loadSdk(generation) {
    if (!hasConsent() || !hasDsn() || generation !== consentGeneration) return Promise.resolve(null);
    if (typeof window.Sentry?.init === "function"
      && typeof window.Sentry?.createTransport === "function"
      && typeof window.Sentry?.captureException === "function"
      && typeof window.Sentry?.flush === "function") {
      return Promise.resolve(window.Sentry);
    }
    if (sdkLoad) return sdkLoad.promise;

    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.src = SDK_URL;
    script.async = true;
    script.crossOrigin = "anonymous";

    let resolveLoad;
    let settled = false;
    let timeoutId = null;
    const record = { promise: null, cancel: null };
    const finish = api => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      script.onload = null;
      script.onerror = null;
      if (sdkLoad === record) sdkLoad = null;
      if (!api) script.remove();
      resolveLoad(api);
    };

    record.promise = new Promise(resolve => { resolveLoad = resolve; });
    record.cancel = () => finish(null);
    sdkLoad = record;
    script.onload = () => finish(
      typeof window.Sentry?.init === "function"
      && typeof window.Sentry?.createTransport === "function"
      && typeof window.Sentry?.captureException === "function"
      && typeof window.Sentry?.flush === "function"
        ? window.Sentry
        : null
    );
    script.onerror = () => finish(null);
    timeoutId = window.setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
    return record.promise;
  }

  function cancelSdkLoad() {
    if (sdkLoad) sdkLoad.cancel();
  }

  function errorIdsFromEnvelope(envelope) {
    if (!Array.isArray(envelope) || !Array.isArray(envelope[1])) return [];
    return envelope[1].flatMap(item => {
      const headers = item?.[0];
      const payload = item?.[1];
      return headers?.type === "event" && typeof payload?.event_id === "string"
        ? [payload.event_id]
        : [];
    });
  }

  function createConsentTransport(api, options, session) {
    const inFlight = new Set();
    const pendingTasks = new Set();
    let envelopeContext = null;

    function cancelPending() {
      inFlight.forEach(controller => controller.abort());
      inFlight.clear();
      pendingTasks.clear();
    }

    async function makeRequest(request) {
      const context = session.requestContext;
      if (!context || !isSessionAllowed(session, context.generation)) {
        diagnostic("warn", "Transport request rejected by the consent/event gate.");
        return { statusCode: 204 };
      }

      const controller = new AbortController();
      inFlight.add(controller);
      if (!isSessionAllowed(session, context.generation)) {
        controller.abort();
        inFlight.delete(controller);
        diagnostic("warn", "Transport request canceled before send because consent is inactive.");
        return { statusCode: 204 };
      }

      context.eventIds.forEach(id => {
        const delivery = session.testDeliveries.get(id);
        if (delivery) delivery.requestStarted = true;
      });
      diagnostic("info", "Sentry ingest request started.");

      try {
        const response = await fetch(options.url, {
          method: "POST",
          body: request.body,
          headers: options.headers,
          credentials: "omit",
          referrerPolicy: "strict-origin",
          keepalive: false,
          signal: controller.signal,
        });
        const accepted = response.status >= 200 && response.status < 300;
        context.eventIds.forEach(id => {
          const delivery = session.testDeliveries.get(id);
          if (!delivery) return;
          delivery.httpStatus = response.status;
          delivery.serverAccepted = accepted;
        });
        diagnostic(accepted ? "info" : "warn", `Sentry ingest response status ${response.status}; serverAccepted=${accepted}.`);
        return {
          statusCode: response.status,
          headers: {
            "x-sentry-rate-limits": response.headers.get("X-Sentry-Rate-Limits"),
            "retry-after": response.headers.get("Retry-After"),
          },
        };
      } catch (error) {
        if (!isSessionAllowed(session, context.generation)) {
          diagnostic("warn", "Pending Sentry transport was discarded after consent changed.");
          return { statusCode: 204 };
        }
        context.eventIds.forEach(id => {
          const delivery = session.testDeliveries.get(id);
          if (delivery) delivery.transportError = true;
        });
        diagnostic("error", "Sentry ingest request failed; request and event details were not logged.");
        throw error;
      } finally {
        inFlight.delete(controller);
      }
    }

    // This buffer starts each allowed transport task immediately; it never stores
    // reports for offline delivery or for a future consent decision.
    const noQueueBuffer = {
      add(task) {
        const context = envelopeContext;
        if (!context || !isSessionAllowed(session, context.generation)) {
          diagnostic("warn", "Transport task rejected before request because consent/event context was unavailable.");
          return Promise.resolve({ statusCode: 204 });
        }

        const taskPromise = Promise.resolve().then(() => {
          if (!isSessionAllowed(session, context.generation)) {
            diagnostic("warn", "Transport task discarded before request because consent changed.");
            return { statusCode: 204 };
          }
          diagnostic("info", "Sentry transport task invoked.");
          session.requestContext = context;
          try {
            return task();
          } finally {
            session.requestContext = null;
          }
        });
        pendingTasks.add(taskPromise);
        taskPromise.then(() => pendingTasks.delete(taskPromise), () => pendingTasks.delete(taskPromise));
        return taskPromise;
      },
      drain(timeout) {
        if (!isSessionAllowed(session)) {
          cancelPending();
          return Promise.resolve(true);
        }
        const completed = Promise.all([...pendingTasks]).then(() => true, () => false);
        if (!Number.isFinite(timeout) || timeout < 0) return completed;
        return Promise.race([completed, new Promise(resolve => window.setTimeout(() => resolve(false), timeout))]);
      },
    };

    const innerTransport = api.createTransport(options, makeRequest, noQueueBuffer);
    return {
      send(envelope) {
        const eventIds = errorIdsFromEnvelope(envelope);
        const generation = session.generation;
        diagnostic("info", "Sentry transport send invoked.");
        if (!isSessionAllowed(session, generation)) {
          diagnostic("warn", "Envelope rejected before transport because consent/session is inactive.");
          return Promise.resolve({ statusCode: 204 });
        }
        if (eventIds.length === 0) diagnostic("warn", "Envelope has no correlatable event ID; sending under the active consented session.");

        envelopeContext = { generation, eventIds };
        let result;
        try {
          result = innerTransport.send(envelope);
        } finally {
          envelopeContext = null;
        }
        return Promise.resolve(result).catch(error => {
          diagnostic("error", "Sentry transport rejected the send operation; no event details were logged.");
          throw error;
        }).finally(() => {
          eventIds.forEach(id => session.testDeliveries.delete(id));
        });
      },
      flush(timeout) {
        if (!isSessionAllowed(session)) {
          cancelPending();
          return Promise.resolve(true);
        }
        return innerTransport.flush(timeout);
      },
      dropPending: cancelPending,
    };
  }

  function sanitizeFrame(frame) {
    const safe = {};
    if (typeof frame.filename === "string") {
      try {
        const url = new URL(frame.filename, window.location.href);
        url.search = "";
        url.hash = "";
        safe.filename = url.href;
      } catch {
        safe.filename = frame.filename.split(/[?#]/, 1)[0];
      }
    }
    if (Number.isInteger(frame.lineno)) safe.lineno = frame.lineno;
    if (Number.isInteger(frame.colno)) safe.colno = frame.colno;
    if (typeof frame.in_app === "boolean") safe.in_app = frame.in_app;
    return safe;
  }

  function sanitizeEvent(event, session, hint) {
    const testDelivery = session.testDeliveries.get(event.event_id)
      || session.testErrors.get(hint?.originalException);
    if (testDelivery) session.testDeliveries.set(event.event_id, testDelivery);
    if (!isSessionAllowed(session)) {
      if (testDelivery) testDelivery.rejectedByBeforeSend = true;
      diagnostic("warn", "Event rejected by the consent/session gate.");
      return null;
    }

    delete event.user;
    delete event.request;
    delete event.extra;
    delete event.logentry;
    event.tags = {};
    event.message = undefined;
    event.breadcrumbs = [];

    const allowedContexts = {};
    for (const key of ["browser", "os", "app"]) {
      const context = event.contexts?.[key];
      if (!context || typeof context !== "object") continue;
      const safeContext = {};
      for (const field of ["name", "version", "app_version", "build_type"]) {
        if (typeof context[field] === "string" && context[field].length <= 80) safeContext[field] = context[field];
      }
      if (Object.keys(safeContext).length > 0) allowedContexts[key] = safeContext;
    }
    event.contexts = allowedContexts;

    for (const exception of event.exception?.values || []) {
      exception.value = typeof exception.type === "string" ? exception.type.slice(0, 80) : "JavaScript error";
      if (exception.stacktrace?.frames) {
        exception.stacktrace.frames = exception.stacktrace.frames.map(sanitizeFrame);
      }
    }
    if (testDelivery) testDelivery.passedBeforeSend = true;
    if (testDelivery) diagnostic("info", "Test event passed beforeSend consent and privacy filtering.");
    return event;
  }

  function isFirstPartySource(filename) {
    if (typeof filename !== "string" || filename.length === 0) return false;
    try {
      const sourceUrl = new URL(filename, window.location.href);
      const pageUrl = new URL(window.location.href);
      if (sourceUrl.protocol === "file:" && pageUrl.protocol === "file:") {
        return sourceUrl.pathname.startsWith(new URL(".", pageUrl).pathname);
      }
      return sourceUrl.origin === pageUrl.origin;
    } catch {
      return false;
    }
  }

  function stackContainsFirstPartySource(error) {
    if (!(error instanceof Error) || typeof error.stack !== "string") return false;
    return error.stack.split("\n").some(line => {
      const match = line.match(/(?:https?|file):\/\/[^\s)]+/i);
      return match ? isFirstPartySource(match[0]) : line.includes("script.js");
    });
  }

  function captureError(session, error) {
    if (!isSessionAllowed(session) || !(error instanceof Error)) return null;
    if (seenErrors.has(error)) return null;
    seenErrors.add(error);
    try {
      const eventId = session.api.captureException(error);
      if (typeof eventId === "string" && isSessionAllowed(session)) {
        return eventId;
      }
      diagnostic("warn", "SDK capture returned no event ID or consent changed during capture.");
    } catch {
      // Diagnostics must never interrupt game behavior.
      diagnostic("error", "SDK capture call failed; no error details were logged.");
    }
    return null;
  }

  function installErrorListeners(session) {
    const onError = event => {
      if (!isSessionAllowed(session)) return;
      if (!isFirstPartySource(event.filename)) {
        diagnostic("warn", "Global error ignored because its source was not first-party.");
        return;
      }
      if (event.error instanceof Error) captureError(session, event.error);
      else captureError(session, new Error("Uncaught JavaScript error"));
    };
    const onUnhandledRejection = event => {
      if (!isSessionAllowed(session)) return;
      const reason = event.reason;
      if (reason instanceof Error) {
        if (stackContainsFirstPartySource(reason)) captureError(session, reason);
        return;
      }
      // Never copy a primitive rejection value into a report; it may contain user input.
      captureError(session, new Error("Unhandled promise rejection"));
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    session.removeListeners = () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      session.removeListeners = null;
    };
  }

  function disableSession(session) {
    if (!session) return;
    session.active = false;
    if (session.removeListeners) session.removeListeners();
    if (session.transport) session.transport.dropPending();
    session.testDeliveries.clear();
    session.testErrors = new WeakMap();
  }

  async function initializeForConsent(generation) {
    const api = await loadSdk(generation);
    if (!api) {
      if (generation === consentGeneration && hasConsent()) {
        diagnostic("error", "SDK load failed or required SDK APIs are unavailable.");
      }
      return false;
    }
    if (generation !== consentGeneration || !hasConsent() || !hasDsn()) return false;

    const session = {
      api,
      generation,
      active: true,
      testDeliveries: new Map(),
      testErrors: new WeakMap(),
      removeListeners: null,
      transport: null,
      requestContext: null,
    };
    activeSession = session;

    try {
      api.init({
        dsn: SENTRY_CONFIG.dsn.trim(),
        release: SENTRY_CONFIG.release || undefined,
        environment: SENTRY_CONFIG.environment || "production",
        defaultIntegrations: false,
        integrations: typeof api.dedupeIntegration === "function" ? [api.dedupeIntegration()] : [],
        maxBreadcrumbs: 0,
        sendClientReports: false,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          stackFrameVariables: false,
          frameContextLines: 0,
          graphQL: { document: false, variables: false },
          genAI: { inputs: false, outputs: false },
          databaseQueryData: false,
          queues: false,
        },
        beforeBreadcrumb: () => null,
        beforeSend: (event, hint) => sanitizeEvent(event, session, hint),
        transport: options => {
          session.transport = createConsentTransport(api, options, session);
          return session.transport;
        },
      });

      if (!isSessionAllowed(session, generation)) {
        disableSession(session);
        if (activeSession === session) activeSession = null;
        return false;
      }
      installErrorListeners(session);
      diagnostic("info", "Sentry initialized for the consented development session.");
      return true;
    } catch {
      disableSession(session);
      if (activeSession === session) activeSession = null;
      diagnostic("error", "SDK initialization failed; no error details were logged.");
      return false;
    }
  }

  async function sendDevelopmentTestEvent() {
    if (!isDevelopment) return false;
    if (!hasConsent()) {
      diagnostic("warn", "Test event not sent: Crash Diagnostics consent is OFF.");
      return false;
    }

    const initialized = await refreshConsent();
    const session = activeSession;
    if (!initialized || !isSessionAllowed(session)) {
      diagnostic("error", "Test event not sent: consented SDK session is unavailable.");
      return false;
    }
    if (typeof session.api.captureException !== "function" || typeof session.api.flush !== "function") {
      diagnostic("error", "Test event not sent: required SDK capture/flush API is unavailable.");
      return { captured: false, sent: false, serverAccepted: false, httpStatus: null, flushCompleted: false };
    }

    const delivery = {
      requestStarted: false,
      serverAccepted: null,
      httpStatus: null,
      transportError: false,
      passedBeforeSend: false,
      rejectedByBeforeSend: false,
    };
    let eventId;
    const testError = new Error("Bomb Defuse Sentry delivery verification");
    session.testErrors.set(testError, delivery);
    try {
      eventId = session.api.captureException(testError);
    } catch {
      diagnostic("error", "SDK capture API failed; no event details were logged.");
      return { captured: false, sent: false, serverAccepted: false, httpStatus: null, flushCompleted: false };
    }
    if (typeof eventId !== "string" || !isSessionAllowed(session)) {
      diagnostic("warn", "SDK did not accept the test event, or consent changed during capture.");
      return { captured: false, sent: false, serverAccepted: false, httpStatus: null, flushCompleted: false };
    }

    delivery.captured = true;
    session.testDeliveries.set(eventId, delivery);
    diagnostic("info", "Test event accepted by the SDK capture API.");

    let flushCompleted = false;
    try {
      // This flush is explicit and test-only. Consent revocation never calls it.
      if (isSessionAllowed(session)) flushCompleted = await session.api.flush(6000);
    } catch {
      diagnostic("error", "Test-only SDK flush failed; no event details were logged.");
    } finally {
      session.testDeliveries.delete(eventId);
    }

    const result = {
      captured: delivery.captured,
      sent: delivery.requestStarted,
      serverAccepted: delivery.serverAccepted,
      httpStatus: delivery.httpStatus,
      flushCompleted: flushCompleted === true,
      beforeSendPassed: delivery.passedBeforeSend,
      rejectedByBeforeSend: delivery.rejectedByBeforeSend,
      transportError: delivery.transportError,
    };
    diagnostic("info", `Test delivery result: captured=${result.captured}, sent=${result.sent}, serverAccepted=${result.serverAccepted}, httpStatus=${result.httpStatus ?? "none"}.`);
    return result;
  }

  function refreshConsent() {
    if (!hasConsent()) {
      if (consentWasEnabled) consentGeneration += 1;
      consentWasEnabled = false;
      cancelSdkLoad();
      if (activeSession) {
        disableSession(activeSession);
        activeSession = null;
      }
      initialization = null;
      initializationGeneration = -1;
      return Promise.resolve(false);
    }

    if (!hasDsn()) {
      diagnostic("error", "Sentry DSN is not configured; initialization was skipped.");
      return Promise.resolve(false);
    }
    if (!consentWasEnabled) {
      consentGeneration += 1;
      consentWasEnabled = true;
    }
    const generation = consentGeneration;
    if (activeSession && isSessionAllowed(activeSession, generation)) return Promise.resolve(true);
    if (initialization && initializationGeneration === generation) return initialization;

    initializationGeneration = generation;
    const task = initializeForConsent(generation).catch(() => false);
    initialization = task;
    task.finally(() => {
      if (initialization === task) {
        initialization = null;
        initializationGeneration = -1;
      }
    });
    return task;
  }

  function initialize() {
    return refreshConsent();
  }

  function isEnabled() {
    return Boolean(activeSession && isSessionAllowed(activeSession));
  }

  if (isDevelopment) {
    Object.defineProperty(window, "_bombDefuseSendSentryTestEvent", {
      configurable: true,
      value: sendDevelopmentTestEvent,
    });
    Object.defineProperty(window, "__bombDefuseSendSentryTestEvent", {
      configurable: true,
      value: sendDevelopmentTestEvent,
    });
    diagnostic("info", "Development test helper available; it requires Crash Diagnostics consent.");
  }

  return { initialize, refreshConsent, isEnabled };
})();

/* =========================================================
   NATIVE ANDROID CRASHLYTICS CONSENT BRIDGE
========================================================= */
const NativeCrashlyticsConsentManager = (() => {
  let transitionQueue = Promise.resolve(false);
  let transitionGeneration = 0;

  function getNativeBridge() {
    const bridge = window.BombDefuseNativeCrashlytics;
    if (typeof bridge?.isNativePlatform !== "function" || !bridge.isNativePlatform()) return null;
    if (typeof bridge.setEnabled !== "function" || typeof bridge.deleteUnsentReports !== "function") return null;
    return bridge;
  }

  function applyConsent({ deleteBeforeEnable = false } = {}) {
    const generation = ++transitionGeneration;
    const allowed = ConsentManager.hasConsent("crashReporting");
    const bridge = getNativeBridge();
    if (!bridge) return Promise.resolve(false);

    const transition = async () => {
      if (generation !== transitionGeneration) return false;
      try {
        if (!allowed) {
          // Native collection changes take effect on the next app launch.
          await bridge.setEnabled(false);
          await bridge.deleteUnsentReports();
          return false;
        }

        if (deleteBeforeEnable) {
          // Never carry reports collected while consent was OFF into an ON period.
          await bridge.deleteUnsentReports();
          if (generation !== transitionGeneration || !ConsentManager.hasConsent("crashReporting")) {
            await bridge.setEnabled(false);
            await bridge.deleteUnsentReports();
            return false;
          }
        }

        await bridge.setEnabled(true);
        if (generation !== transitionGeneration || !ConsentManager.hasConsent("crashReporting")) {
          return false;
        }
        return true;
      } catch {
        // Fail closed if deleting old reports or updating native consent fails.
        if (allowed) {
          try { await bridge.setEnabled(false); } catch { /* Preserve fail-closed behavior best-effort. */ }
        }
        console.warn("[Crashlytics] Native consent update failed; no report details were logged.");
        return false;
      }
    };

    const result = transitionQueue.then(transition, transition);
    transitionQueue = result.catch(() => false);
    return result;
  }

  function refreshConsent() {
    return applyConsent();
  }

  function setExplicitConsent(allowed) {
    const effectiveConsent = ConsentManager.hasConsent("crashReporting");
    if (allowed !== effectiveConsent) return Promise.resolve(false);
    return applyConsent({ deleteBeforeEnable: allowed === true });
  }

  return { initialize: refreshConsent, refreshConsent, setExplicitConsent };
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
   CAMPAIGN CONFIGURATION & MANAGER (CHAPTER 1 / LEVELS 1-2)
========================================================= */
const CampaignConfig = {
  chapter: 1,
  chapterTitle: "FIRST PROTOCOL",
  levels: {
    1: {
      chapter: 1,
      level: 1,
      title: "FIRST CUT",
      subtitle: "LEVEL 01",
      briefing: "Your first defusal. Identify and cut the target wire before the countdown reaches zero.",
      timer: 10.0,
      wireCount: 3,
      wires: [
        { color: "red", index: 0, length: 0.85, hasWarningLed: false, signalNodes: 0 },
        { color: "blue", index: 1, length: 0.95, hasWarningLed: false, signalNodes: 0 },
        { color: "green", index: 2, length: 0.88, hasWarningLed: false, signalNodes: 0 }
      ],
      rule: {
        type: "color",
        text: "CUT THE BLUE WIRE",
        answerIndex: 1
      },
      phases: [
        { phaseIndex: 0, totalPhases: 1, type: "color", text: "CUT THE BLUE WIRE", answerIndex: 1 }
      ],
      rulesInfo: [
        { icon: "⚡", label: "3-WIRE ARRAY", desc: "Standard terminal bus with three active conductors." },
        { icon: "🎯", label: "OBJECTIVE: BLUE WIRE", desc: "Sever the Blue wire to disarm the circuit core safely." },
        { icon: "⏱", label: "10.0 SECONDS", desc: "Finish with 3.0+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Defuse the bomb", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 3.0s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 3.0 },
        { star: 3, desc: "Complete without using powers", test: ctx => ctx.completed && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    2: {
      chapter: 1,
      level: 2,
      title: "DUAL PATH",
      subtitle: "LEVEL 02",
      briefing: "Two systems are active. Cut both target wires in the correct sequence before the countdown reaches zero.",
      timer: 10.0,
      wireCount: 4,
      wires: [
        { color: "red", index: 0, length: 0.85, hasWarningLed: false, signalNodes: 0 },
        { color: "blue", index: 1, length: 0.95, hasWarningLed: false, signalNodes: 0 },
        { color: "green", index: 2, length: 0.88, hasWarningLed: false, signalNodes: 0 },
        { color: "yellow", index: 3, length: 0.92, hasWarningLed: false, signalNodes: 0 }
      ],
      rule: {
        type: "color",
        text: "CUT THE BLUE WIRE",
        answerIndex: 1
      },
      phases: [
        { phaseIndex: 0, totalPhases: 2, type: "color", text: "CUT THE BLUE WIRE", answerIndex: 1 },
        { phaseIndex: 1, totalPhases: 2, type: "color", text: "CUT THE YELLOW WIRE", answerIndex: 3 }
      ],
      rulesInfo: [
        { icon: "⚡", label: "4-WIRE ARRAY", desc: "Four active conductors (Red, Blue, Green, Yellow)." },
        { icon: "🎯", label: "TARGET SEQUENCE: BLUE → YELLOW", desc: "Cut Blue in Phase 1, then Yellow in Phase 2." },
        { icon: "⏱", label: "10.0 SECONDS", desc: "Finish with 4.0+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Defuse the bomb", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 4.0s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 4.0 },
        { star: 3, desc: "Finish with >= 4.0s remaining and no powers used", test: ctx => ctx.completed && ctx.secondsLeft >= 4.0 && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    3: {
      chapter: 1,
      level: 3,
      title: "TRI-SPLIT",
      subtitle: "LEVEL 03",
      briefing: "Three systems are linked to the same circuit. Cut the target wires in the correct sequence before the countdown reaches zero.",
      timer: 10.0,
      wireCount: 5,
      wires: [
        { color: "red", index: 0, length: 0.85, hasWarningLed: false, signalNodes: 0 },
        { color: "blue", index: 1, length: 0.95, hasWarningLed: false, signalNodes: 0 },
        { color: "green", index: 2, length: 0.88, hasWarningLed: false, signalNodes: 0 },
        { color: "yellow", index: 3, length: 0.92, hasWarningLed: false, signalNodes: 0 },
        { color: "white", index: 4, length: 0.86, hasWarningLed: false, signalNodes: 0 }
      ],
      rule: {
        type: "color",
        text: "CUT THE GREEN WIRE",
        answerIndex: 2
      },
      phases: [
        { phaseIndex: 0, totalPhases: 3, type: "color", text: "CUT THE GREEN WIRE", answerIndex: 2 },
        { phaseIndex: 1, totalPhases: 3, type: "color", text: "CUT THE BLUE WIRE", answerIndex: 1 },
        { phaseIndex: 2, totalPhases: 3, type: "color", text: "CUT THE YELLOW WIRE", answerIndex: 3 }
      ],
      rulesInfo: [
        { icon: "⚡", label: "5-WIRE ARRAY", desc: "Five active conductors (Red, Blue, Green, Yellow, White)." },
        { icon: "🎯", label: "SEQUENCE: GREEN → BLUE → YELLOW", desc: "Cut Green in Phase 1, Blue in Phase 2, Yellow in Phase 3." },
        { icon: "⏱", label: "10.0 SECONDS", desc: "Finish with 4.5+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Defuse the bomb", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 4.5s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 4.5 },
        { star: 3, desc: "Finish with >= 4.5s remaining and no powers used", test: ctx => ctx.completed && ctx.secondsLeft >= 4.5 && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    4: {
      chapter: 1,
      level: 4,
      gameplayType: "FREE_FLOW",
      title: "CIRCUIT FLOW",
      subtitle: "LEVEL 04",
      briefing: "The primary circuits have been severed. Restore the system by routing each signal to its matching terminal.",
      timer: 15.0,
      circuitConfig: {
        grid: { rows: 5, cols: 5 },
        terminals: {
          red: [[0, 0], [4, 1]],
          blue: [[0, 4], [4, 4]],
          green: [[1, 2], [3, 2]]
        },
        obstacles: [[1, 1], [2, 3], [3, 1]]
      },
      rulesInfo: [
        { icon: "⚡", label: "5×5 CIRCUIT GRID", desc: "Five-by-five terminal routing matrix." },
        { icon: "🔗", label: "CONNECT 3 MATCHING PAIRS", desc: "Route Red, Blue, and Green signals without crossing." },
        { icon: "⏱", label: "15.0 SECONDS", desc: "Finish with 6.0+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Restore all circuits", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 6.0s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 6.0 },
        { star: 3, desc: "Finish with >= 6.0s remaining and no powers used", test: ctx => ctx.completed && ctx.secondsLeft >= 6.0 && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    5: {
      chapter: 1,
      level: 5,
      gameplayType: "SIGNAL_MEMORY",
      title: "SIGNAL TRACE",
      subtitle: "LEVEL 05",
      briefing: "The circuit is unstable. A signal pattern has been recorded. Memorize the sequence, then reproduce it before the system collapses.",
      timer: 12.0,
      memoryConfig: {
        grid: { rows: 3, cols: 3 },
        sequenceLength: 4,
        sequence: [
          [0, 0],
          [1, 1],
          [0, 2],
          [2, 1]
        ],
        revealActiveMs: 450,
        revealGapMs: 180
      },
      rulesInfo: [
        { icon: "⚡", label: "3×3 SIGNAL GRID", desc: "Three-by-three neural signal matrix." },
        { icon: "🧠", label: "MEMORIZE 4 NODES", desc: "Observe the active pattern, then repeat in exact order." },
        { icon: "⏱", label: "12.0 SECONDS", desc: "Finish with 5.0+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Complete the signal sequence", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 5.0s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 5.0 },
        { star: 3, desc: "Finish with >= 5.0s remaining and no powers used", test: ctx => ctx.completed && ctx.secondsLeft >= 5.0 && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    6: {
      chapter: 1,
      level: 6,
      gameplayType: "COMBINATION",
      title: "COMBINATION PROTOCOL",
      subtitle: "REMEMBER. IDENTIFY. DEFUSE.",
      briefing: "The signal contains the key to the final circuit. Memorize the pattern, reproduce it, then use the result to complete the defusal.",
      timer: 14.0,
      wireCount: 4,
      wires: [
        { color: "red", index: 0, length: 0.85, hasWarningLed: false, signalNodes: 0 },
        { color: "blue", index: 1, length: 0.95, hasWarningLed: false, signalNodes: 0 },
        { color: "green", index: 2, length: 0.88, hasWarningLed: false, signalNodes: 0 },
        { color: "yellow", index: 3, length: 0.92, hasWarningLed: false, signalNodes: 0 }
      ],
      memoryConfig: {
        grid: { rows: 3, cols: 3 },
        sequenceLength: 3,
        sequence: [
          [0, 0],
          [1, 2],
          [2, 1]
        ],
        revealActiveMs: 450,
        revealGapMs: 180
      },
      targetMapping: {
        node: [2, 1],
        wireIndex: 3,
        wireColor: "yellow"
      },
      rulesInfo: [
        { icon: "🧠", label: "MEMORIZE 3 SIGNALS", desc: "Observe the 3-node sequence, then reproduce it." },
        { icon: "⚡", label: "4-WIRE DEFUSAL", desc: "The final signal indicates the target wire." },
        { icon: "⏱", label: "14.0 SECONDS", desc: "Finish with 5.5+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Defuse the bomb", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 5.5s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 5.5 },
        { star: 3, desc: "Finish with >= 5.5s remaining and no powers used", test: ctx => ctx.completed && ctx.secondsLeft >= 5.5 && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    7: {
      chapter: 1,
      level: 7,
      gameplayType: "WORD_PUZZLE",
      title: "CODE WORD",
      subtitle: "LEVEL 07",
      briefing: "The circuit lock is encrypted. Reconstruct the code word, then use the decoded signal to identify the final wire.",
      timer: 15.0,
      wordConfig: {
        word: "RELAY",
        clue: "A device or system that passes a signal from one point to another.",
        scrambledLetters: ["A", "L", "Y", "R", "E"],
        targetMapping: {
          wireColor: "blue",
          wireIndex: 1
        }
      },
      wireCount: 4,
      wires: [
        { color: "red", index: 0, length: 0.85, hasWarningLed: false, signalNodes: 0 },
        { color: "blue", index: 1, length: 0.95, hasWarningLed: false, signalNodes: 0 },
        { color: "green", index: 2, length: 0.88, hasWarningLed: false, signalNodes: 0 },
        { color: "yellow", index: 3, length: 0.92, hasWarningLed: false, signalNodes: 0 }
      ],
      rulesInfo: [
        { icon: "🔤", label: "5-LETTER CODE", desc: "Reconstruct the encrypted code word." },
        { icon: "⚡", label: "4-WIRE ARRAY", desc: "The decoded signal reveals the target wire." },
        { icon: "⏱", label: "15.0 SECONDS", desc: "Finish with 6.0+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Defuse the bomb", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 6.0s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 6.0 },
        { star: 3, desc: "Finish with >= 6.0s remaining and no powers used", test: ctx => ctx.completed && ctx.secondsLeft >= 6.0 && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    8: {
      chapter: 1,
      level: 8,
      gameplayType: "CIRCUIT_OVERLOAD",
      title: "CIRCUIT OVERLOAD",
      subtitle: "LEVEL 08",
      briefing: "Critical power surge detected. Route the overload bypass circuits across the capacitor grid, then sever the disarm wire.",
      timer: 18.0,
      circuitConfig: {
        grid: { rows: 5, cols: 5 },
        terminals: {
          red: [[0, 0], [4, 2]],
          yellow: [[0, 1], [2, 4]],
          blue: [[1, 1], [4, 4]]
        },
        obstacles: [[2, 1], [3, 1], [2, 2], [3, 2], [3, 4]],
        instructionText: "PHASE 1/2 · ROUTE OVERLOAD BYPASS"
      },
      targetMapping: {
        wireColor: "green",
        wireIndex: 2
      },
      wireCount: 5,
      wires: [
        { color: "red", index: 0, length: 0.85, hasWarningLed: false, signalNodes: 0 },
        { color: "blue", index: 1, length: 0.95, hasWarningLed: false, signalNodes: 0 },
        { color: "green", index: 2, length: 0.88, hasWarningLed: false, signalNodes: 0 },
        { color: "yellow", index: 3, length: 0.92, hasWarningLed: false, signalNodes: 0 },
        { color: "white", index: 4, length: 0.86, hasWarningLed: false, signalNodes: 0 }
      ],
      rulesInfo: [
        { icon: "⚡", label: "OVERLOAD BYPASS", desc: "Route Red, Yellow, and Blue traces around overloaded capacitors." },
        { icon: "🎯", label: "DISARM TARGET: GREEN WIRE", desc: "Once stabilized, sever the Green wire to discharge the core." },
        { icon: "⏱", label: "18.0 SECONDS", desc: "Finish with 7.0+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Defuse the bomb", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 7.0s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 7.0 },
        { star: 3, desc: "Finish with >= 7.0s remaining and no powers used", test: ctx => ctx.completed && ctx.secondsLeft >= 7.0 && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    9: {
      chapter: 1,
      level: 9,
      gameplayType: "SIGNAL_ORDER",
      title: "CORE OVERRIDE",
      subtitle: "LEVEL 09",
      briefing: "The core is overloading. Signal frequencies are scrambled. Tap each terminal in ascending frequency order to stabilize the core, then sever the final wire.",
      timer: 20.0,
      signalOrderConfig: {
        values: [7, 2, 9, 4],
        correctOrder: [2, 4, 7, 9]
      },
      wireCount: 5,
      wires: [
        { color: "red",    index: 0, length: 0.82, hasWarningLed: false, signalNodes: 0 },
        { color: "blue",   index: 1, length: 0.95, hasWarningLed: false, signalNodes: 0 },
        { color: "green",  index: 2, length: 0.88, hasWarningLed: false, signalNodes: 0 },
        { color: "yellow", index: 3, length: 0.92, hasWarningLed: false, signalNodes: 0 },
        { color: "white",  index: 4, length: 0.86, hasWarningLed: false, signalNodes: 0 }
      ],
      targetMapping: {
        wireColor: "white",
        wireIndex: 4
      },
      rulesInfo: [
        { icon: "📡", label: "4 SIGNAL TERMINALS", desc: "Tap terminals in ascending numeric frequency order." },
        { icon: "🔌", label: "CORE DEFUSAL: WHITE WIRE", desc: "Once ordered, sever the White wire to discharge the core." },
        { icon: "⏱", label: "20.0 SECONDS", desc: "Finish with 6.0+ seconds left for maximum star rating." }
      ],
      starConditions: [
        { star: 1, desc: "Defuse the bomb",                             test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 6.0s remaining",               test: ctx => ctx.completed && ctx.secondsLeft >= 6.0 },
        { star: 3, desc: "Finish with >= 6.0s remaining, no power used", test: ctx => ctx.completed && ctx.secondsLeft >= 6.0 && !ctx.powerUsed }
      ],
      baseReward: {
        coins: 50,
        score: 100
      }
    },
    10: {
      chapter: 1,
      level: 10,
      gameplayType: "FINAL_PROTOCOL",
      title: "FINAL PROTOCOL",
      subtitle: "LEVEL 10",
      briefing: "The final protocol is active. Complete all three defusal phases before the shared countdown reaches zero.",
      timer: 30.0,
      memoryConfig: {
        grid: { rows: 3, cols: 3 },
        sequenceLength: 5,
        sequence: [
          [2, 0],
          [0, 1],
          [0, 0],
          [0, 1],
          [2, 0]
        ],
        revealActiveMs: 450,
        revealGapMs: 180,
        allowRepeatedNodes: true
      },
      circuitConfig: {
        grid: { rows: 5, cols: 5 },
        terminals: {
          red: [[0, 0], [4, 1]],
          blue: [[0, 4], [4, 3]],
          green: [[1, 2], [3, 2]]
        },
        obstacles: [[0, 2], [1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3], [4, 2]],
        instructionText: "PHASE 2/3 · RESTORE THE CIRCUIT"
      },
      wireCount: 6,
      wires: [
        { color: "red", index: 0, length: 0.84, hasWarningLed: false, signalNodes: 0 },
        { color: "blue", index: 1, length: 0.95, hasWarningLed: false, signalNodes: 0 },
        { color: "yellow", index: 2, length: 0.92, hasWarningLed: false, signalNodes: 0 },
        { color: "green", index: 3, length: 0.88, hasWarningLed: false, signalNodes: 0 },
        { color: "white", index: 4, length: 0.86, hasWarningLed: false, signalNodes: 0 },
        { color: "black", index: 5, length: 0.90, hasWarningLed: false, signalNodes: 0 }
      ],
      targetMapping: {
        wireColor: "red",
        wireIndex: 0
      },
      rulesInfo: [
        { icon: "⚡", label: "PHASE 1 - SIGNAL MEMORY", desc: "GREEN -> BLUE -> RED -> BLUE -> GREEN" },
        { icon: "🔄", label: "PHASE 2 - CIRCUIT BYPASS", desc: "CONNECT START -> END" },
        { icon: "✂️", label: "PHASE 3 - FINAL DEFUSAL", desc: "CUT THE RED WIRE" },
        { icon: "⏱", label: "30 SECONDS TOTAL", desc: "It never resets between phases." }
      ],
      starConditions: [
        { star: 1, desc: "Complete before the timer reaches zero", test: ctx => ctx.completed },
        { star: 2, desc: "Finish with >= 5.0s remaining", test: ctx => ctx.completed && ctx.secondsLeft >= 5.0 },
        { star: 3, desc: "Finish with >= 10.0s remaining and no failure", test: ctx => ctx.completed && ctx.secondsLeft >= 10.0 }
      ],
      baseReward: {
        coins: 100,
        score: 200
      }
    }
  }
};

let campaignCurrentLevel = 1;

/* =========================================================
   FREE FLOW CIRCUIT MANAGER (CAMPAIGN LEVEL 4+)
========================================================= */
const CircuitFlowManager = (() => {
  let activeConfig = null;
  let activeColor = null;
  let activePath = [];
  let completedPaths = {};
  let cachedRect = null;
  let cellWidth = 0;
  let cellHeight = 0;
  let isPointerDown = false;
  let currentPointerId = null;

  function init(config, onComplete) {
    activeConfig = config;
    activeColor = null;
    activePath = [];
    completedPaths = {};
    isPointerDown = false;
    currentPointerId = null;

    if (!el.circuitFlowGrid || !el.circuitFlowBoard || !el.circuitFlowSvg) return;

    el.circuitFlowContainer.style.display = "flex";
    if (el.wiresContainer) el.wiresContainer.style.display = "none";
    if (el.instruction) el.instruction.textContent = config?.instructionText || "RESTORE ALL CIRCUITS";
    updateProgress();

    renderGrid();
    bindEvents(onComplete);
  }

  function cleanup() {
    activeConfig = null;
    activeColor = null;
    activePath = [];
    completedPaths = {};
    isPointerDown = false;
    currentPointerId = null;
    if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
    if (el.wiresContainer) el.wiresContainer.style.display = "flex";
  }

  function updateProgress() {
    const total = Object.keys(activeConfig?.terminals || {}).length || 3;
    const done = Object.keys(completedPaths).length;
    if (el.circuitProgressChip) {
      el.circuitProgressChip.textContent = `${done} / ${total} CIRCUITS RESTORED`;
    }
  }

  function renderGrid() {
    if (!activeConfig || !el.circuitFlowGrid) return;
    el.circuitFlowGrid.replaceChildren();

    const { rows, cols } = activeConfig.grid;
    const termMap = {};
    Object.entries(activeConfig.terminals).forEach(([color, pairs]) => {
      pairs.forEach(([r, c], idx) => {
        termMap[`${r},${c}`] = { color, idx };
      });
    });

    const obstacleSet = new Set(activeConfig.obstacles.map(([r, c]) => `${r},${c}`));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement("div");
        cell.className = "circuit-cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        const key = `${r},${c}`;

        if (obstacleSet.has(key)) {
          cell.classList.add("cell-obstacle");
          cell.setAttribute("aria-label", `Blocked cell row ${r + 1}, col ${c + 1}`);
        } else if (termMap[key]) {
          const { color, idx } = termMap[key];
          cell.classList.add("cell-terminal", `terminal-${color}`);
          cell.dataset.terminalColor = color;
          cell.setAttribute("aria-label", `${color.toUpperCase()} Terminal ${idx + 1}, row ${r + 1}, col ${c + 1}`);
          const node = document.createElement("span");
          node.className = "terminal-node";
          node.textContent = color[0].toUpperCase();
          cell.appendChild(node);
        } else {
          cell.setAttribute("aria-label", `Circuit cell row ${r + 1}, col ${c + 1}`);
        }

        el.circuitFlowGrid.appendChild(cell);
      }
    }

    renderSvgTraces();
  }

  function renderSvgTraces() {
    if (!el.circuitFlowSvg || !el.circuitFlowBoard) return;
    el.circuitFlowSvg.replaceChildren();

    const rect = el.circuitFlowBoard.getBoundingClientRect();
    const w = rect.width || 250;
    const h = rect.height || 250;
    const padding = 6;
    const gridW = w - padding * 2;
    const gridH = h - padding * 2;
    const cols = activeConfig?.grid.cols || 5;
    const rows = activeConfig?.grid.rows || 5;
    const cellW = gridW / cols;
    const cellH = gridH / rows;

    function getCenter(r, c) {
      return {
        x: padding + (c + 0.5) * cellW,
        y: padding + (r + 0.5) * cellH
      };
    }

    // Render completed paths
    Object.entries(completedPaths).forEach(([color, path]) => {
      if (path.length < 2) return;
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      const pts = path.map(({ r, c }) => {
        const pt = getCenter(r, c);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join(" ");
      poly.setAttribute("points", pts);
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", `var(--wire-${color})`);
      poly.setAttribute("stroke-width", "8");
      poly.setAttribute("stroke-linecap", "round");
      poly.setAttribute("stroke-linejoin", "round");
      poly.setAttribute("opacity", "0.95");
      poly.style.filter = `drop-shadow(0 0 6px var(--wire-${color}))`;
      el.circuitFlowSvg.appendChild(poly);
    });

    // Render active dragging path
    if (activeColor && activePath.length > 1) {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      const pts = activePath.map(({ r, c }) => {
        const pt = getCenter(r, c);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join(" ");
      poly.setAttribute("points", pts);
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", `var(--wire-${activeColor})`);
      poly.setAttribute("stroke-width", "8");
      poly.setAttribute("stroke-linecap", "round");
      poly.setAttribute("stroke-linejoin", "round");
      poly.setAttribute("opacity", "0.85");
      poly.style.filter = `drop-shadow(0 0 8px var(--wire-${activeColor}))`;
      el.circuitFlowSvg.appendChild(poly);
    }
  }

  function updateCellClasses() {
    if (!el.circuitFlowGrid) return;
    const cells = el.circuitFlowGrid.querySelectorAll(".circuit-cell");
    cells.forEach(cell => {
      const r = parseInt(cell.dataset.r, 10);
      const c = parseInt(cell.dataset.c, 10);

      // Remove previous active classes
      cell.classList.remove(
        "path-active-red", "path-active-blue", "path-active-green",
        "path-active-yellow", "path-active-white"
      );

      // Check if in completed path
      let inCompleted = false;
      Object.entries(completedPaths).forEach(([color, path]) => {
        if (path.some(p => p.r === r && p.c === c)) {
          inCompleted = true;
          cell.classList.add(`path-connected-${color}`);
        }
      });

      // Check if in active path
      if (!inCompleted && activeColor && activePath.some(p => p.r === r && p.c === c)) {
        cell.classList.add(`path-active-${activeColor}`);
      }
    });
  }

  function getCellFromCoords(clientX, clientY) {
    if (!cachedRect || cellWidth <= 0 || cellHeight <= 0) return null;
    const x = clientX - cachedRect.left - 6; // 6px padding
    const y = clientY - cachedRect.top - 6;
    if (x < 0 || y < 0) return null;
    const c = Math.floor(x / cellWidth);
    const r = Math.floor(y / cellHeight);
    if (r >= 0 && r < activeConfig.grid.rows && c >= 0 && c < activeConfig.grid.cols) {
      return { r, c };
    }
    return null;
  }

  function bindEvents(onComplete) {
    const board = el.circuitFlowBoard;
    if (!board) return;

    function handlePointerDown(e) {
      if (state !== "PLAYING" || run.inputLocked) return;
      e.preventDefault();

      cachedRect = board.getBoundingClientRect();
      const padding = 6;
      cellWidth = (cachedRect.width - padding * 2) / activeConfig.grid.cols;
      cellHeight = (cachedRect.height - padding * 2) / activeConfig.grid.rows;

      const cellCoord = getCellFromCoords(e.clientX, e.clientY);
      if (!cellCoord) return;

      const { r, c } = cellCoord;

      // Check if cell is a terminal
      let matchedColor = null;
      Object.entries(activeConfig.terminals).forEach(([color, pairs]) => {
        if (pairs.some(([tr, tc]) => tr === r && tc === c)) {
          matchedColor = color;
        }
      });

      if (matchedColor && !completedPaths[matchedColor]) {
        isPointerDown = true;
        currentPointerId = e.pointerId;
        activeColor = matchedColor;
        activePath = [{ r, c }];
        AudioManager.playWireCut();
        updateCellClasses();
        renderSvgTraces();
        try { board.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }

    function handlePointerMove(e) {
      if (!isPointerDown || !activeColor || state !== "PLAYING") return;
      e.preventDefault();

      const cellCoord = getCellFromCoords(e.clientX, e.clientY);
      if (!cellCoord) return;

      const { r, c } = cellCoord;
      const last = activePath[activePath.length - 1];
      if (last.r === r && last.c === c) return; // same cell

      // Backtracking: if dragging to 2nd to last cell, pop last
      if (activePath.length > 1) {
        const prev = activePath[activePath.length - 2];
        if (prev.r === r && prev.c === c) {
          activePath.pop();
          updateCellClasses();
          renderSvgTraces();
          return;
        }
      }

      // Orthogonal adjacency check: abs(dr) + abs(dc) === 1
      const dist = Math.abs(last.r - r) + Math.abs(last.c - c);
      if (dist !== 1) return;

      // Obstacle check
      const isObstacle = activeConfig.obstacles.some(([or, oc]) => or === r && oc === c);
      if (isObstacle) return;

      // Completed path collision check
      let inOtherCompleted = false;
      Object.entries(completedPaths).forEach(([color, path]) => {
        if (path.some(p => p.r === r && p.c === c)) {
          inOtherCompleted = true;
        }
      });
      if (inOtherCompleted) return;

      // Self-intersection check
      if (activePath.some(p => p.r === r && p.c === c)) return;

      // Other terminal collision check
      let isOtherTerminal = false;
      Object.entries(activeConfig.terminals).forEach(([color, pairs]) => {
        if (color !== activeColor && pairs.some(([tr, tc]) => tr === r && tc === c)) {
          isOtherTerminal = true;
        }
      });
      if (isOtherTerminal) return;

      // Add valid cell to activePath
      activePath.push({ r, c });
      updateCellClasses();
      renderSvgTraces();
    }

    function handlePointerUp(e) {
      if (!isPointerDown || !activeColor) return;
      isPointerDown = false;
      try { board.releasePointerCapture(currentPointerId); } catch (_) {}
      currentPointerId = null;

      const last = activePath[activePath.length - 1];
      const terminals = activeConfig.terminals[activeColor];
      const startTerm = activePath[0];

      // Check if last cell is the matching terminal (and not the starting terminal)
      const isTarget = terminals.some(([tr, tc]) => tr === last.r && tc === last.c && (tr !== startTerm.r || tc !== startTerm.c));

      if (isTarget && activePath.length > 1) {
        // Connection complete!
        completedPaths[activeColor] = [...activePath];
        AudioManager.playPhaseComplete();
        HapticsManager.cutSuccess();
        showFloatingText(`${activeColor.toUpperCase()} LINKED!`, `var(--wire-${activeColor})`);
        updateProgress();

        const totalPairs = Object.keys(activeConfig.terminals).length;
        if (Object.keys(completedPaths).length === totalPairs) {
          // All circuits restored!
          activeColor = null;
          activePath = [];
          updateCellClasses();
          renderSvgTraces();
          if (typeof onComplete === "function") {
            onComplete();
          }
          return;
        }
      }

      // Clear current uncompleted path
      activeColor = null;
      activePath = [];
      updateCellClasses();
      renderSvgTraces();
    }

    board.onpointerdown = handlePointerDown;
    board.onpointermove = handlePointerMove;
    board.onpointerup = handlePointerUp;
    board.onpointercancel = handlePointerUp;
  }

  return { init, cleanup };
})();

/* =========================================================
   SIGNAL MEMORY MANAGER (CAMPAIGN LEVEL 5: SIGNAL TRACE)
========================================================= */
const SignalMemoryManager = (() => {
  let activeConfig = null;
  let isRevealing = false;
  let playerInputEnabled = false;
  let playerSequence = [];
  let revealTimeouts = [];
  let onCompleteCallback = null;
  let onFailCallback = null;
  let onStartPlayableTimerCallback = null;

  function init(config, onStartPlayableTimer, onComplete, onFail) {
    cleanup();
    activeConfig = config;
    onStartPlayableTimerCallback = onStartPlayableTimer;
    onCompleteCallback = onComplete;
    onFailCallback = onFail;
    playerSequence = [];
    isRevealing = false;
    playerInputEnabled = false;

    if (!el.signalMemoryContainer || !el.signalMemoryBoard || !el.signalMemoryGrid) return;

    el.signalMemoryContainer.style.display = "flex";
    if (el.wiresContainer) el.wiresContainer.style.display = "none";
    if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";

    renderGrid();
    startReveal();
  }

  function cleanup() {
    revealTimeouts.forEach(t => clearTimeout(t));
    revealTimeouts = [];
    activeConfig = null;
    isRevealing = false;
    playerInputEnabled = false;
    playerSequence = [];
    onCompleteCallback = null;
    onFailCallback = null;
    onStartPlayableTimerCallback = null;

    if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";
  }

  function renderGrid() {
    if (!activeConfig || !el.signalMemoryGrid) return;
    el.signalMemoryGrid.replaceChildren();

    const { rows, cols } = activeConfig.grid;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "signal-node node-idle";
        node.dataset.r = String(r);
        node.dataset.c = String(c);
        node.setAttribute("aria-label", `Signal Node row ${r + 1}, column ${c + 1}`);

        const core = document.createElement("span");
        core.className = "signal-node-core";
        core.setAttribute("aria-hidden", "true");
        node.appendChild(core);

        const badge = document.createElement("span");
        badge.className = "signal-node-badge";
        badge.setAttribute("aria-hidden", "true");
        node.appendChild(badge);

        node.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          handleNodeClick(r, c, node);
        });

        el.signalMemoryGrid.appendChild(node);
      }
    }

    updateProgressUI(0);
  }

  function getNodeEl(r, c) {
    if (!el.signalMemoryGrid) return null;
    return el.signalMemoryGrid.querySelector(`.signal-node[data-r="${r}"][data-c="${c}"]`);
  }

  function updateProgressUI(count) {
    const total = activeConfig?.sequenceLength || 4;
    if (el.signalProgressChip) {
      el.signalProgressChip.textContent = `SEQUENCE ${count} / ${total}`;
    }
  }

  function startReveal() {
    if (!activeConfig) return;
    isRevealing = true;
    playerInputEnabled = false;
    if (el.instruction) el.instruction.textContent = "WATCH THE SIGNAL";
    if (el.signalProgressChip) el.signalProgressChip.textContent = "MEMORIZING PATTERN...";

    const seq = activeConfig.sequence;
    const activeMs = activeConfig.revealActiveMs || 450;
    const gapMs = activeConfig.revealGapMs || 180;
    const stepDuration = activeMs + gapMs;

    setNodesDisabled(true);

    seq.forEach(([r, c], idx) => {
      // Illuminate node
      const t1 = setTimeout(() => {
        if (!isRevealing) return;
        const nodeEl = getNodeEl(r, c);
        if (nodeEl) {
          nodeEl.classList.remove("node-idle");
          nodeEl.classList.add("node-reveal-active");
          AudioManager.playWireCut();
        }
      }, idx * stepDuration + 200);
      revealTimeouts.push(t1);

      // De-illuminate node
      const t2 = setTimeout(() => {
        if (!isRevealing) return;
        const nodeEl = getNodeEl(r, c);
        if (nodeEl) {
          nodeEl.classList.remove("node-reveal-active");
          nodeEl.classList.add("node-idle");
        }
      }, idx * stepDuration + 200 + activeMs);
      revealTimeouts.push(t2);
    });

    // Reveal finish
    const totalRevealTime = seq.length * stepDuration + 200 + activeMs + 200;
    const tEnd = setTimeout(() => {
      if (!isRevealing) return;
      isRevealing = false;
      showFloatingText("SEQUENCE LOCKED", "var(--accent)");
      setBombStatus("ARMED");
      if (el.instruction) el.instruction.textContent = "REPEAT THE SIGNAL";
      updateProgressUI(0);

      playerInputEnabled = true;
      setNodesDisabled(false);

      if (typeof onStartPlayableTimerCallback === "function") {
        onStartPlayableTimerCallback();
      }
    }, totalRevealTime);
    revealTimeouts.push(tEnd);
  }

  function setNodesDisabled(disabled) {
    if (!el.signalMemoryGrid) return;
    const nodes = el.signalMemoryGrid.querySelectorAll(".signal-node");
    nodes.forEach(n => {
      n.disabled = disabled;
      n.classList.toggle("node-disabled", disabled);
    });
  }

  function handleNodeClick(r, c, nodeEl) {
    if (!playerInputEnabled || isRevealing || state !== "PLAYING" || run.inputLocked) return;

    const currentStep = playerSequence.length;
    const expected = activeConfig.sequence[currentStep];

    if (!expected) return;

    if (expected[0] === r && expected[1] === c) {
      // Correct node tapped!
      playerSequence.push([r, c]);
      const stepNumber = playerSequence.length;

      nodeEl.classList.remove("node-idle", "node-reveal-active");
      nodeEl.classList.add("node-player-selected", "node-correct");
      nodeEl.disabled = !activeConfig.allowRepeatedNodes;

      const badge = nodeEl.querySelector(".signal-node-badge");
      if (badge) badge.textContent = `[${stepNumber}]`;

      AudioManager.playWireCut();
      AudioManager.playPhaseComplete();
      HapticsManager.cutSuccess();
      updateProgressUI(stepNumber);

      if (playerSequence.length === activeConfig.sequence.length) {
        // Full sequence completed!
        playerInputEnabled = false;
        setNodesDisabled(true);
        if (typeof onCompleteCallback === "function") {
          onCompleteCallback();
        }
      }
    } else {
      // Incorrect node!
      playerInputEnabled = false;
      nodeEl.classList.remove("node-idle");
      nodeEl.classList.add("node-wrong");
      AudioManager.playWrongWire();
      HapticsManager.cutFailure();

      if (typeof onFailCallback === "function") {
        onFailCallback("SIGNAL MISMATCH");
      }
    }
  }

  return { init, cleanup };
})();

/* =========================================================
   WORD PUZZLE MANAGER (CAMPAIGN LEVEL 7: CODE WORD)
========================================================= */
const WordPuzzleManager = (() => {
  let activeConfig = null;
  let selectedIndices = [];
  let isSubmitting = false;
  let isResolved = false;
  let onCompleteCallback = null;
  let onFailCallback = null;

  function init(config, onComplete, onFail) {
    cleanup();
    activeConfig = config;
    selectedIndices = [];
    isSubmitting = false;
    isResolved = false;
    onCompleteCallback = onComplete;
    onFailCallback = onFail;

    if (!el.wordPuzzleContainer || !el.wordTilesGrid || !el.wordAnswerRow) return;

    if (el.wordPuzzleClueText && config?.clue) {
      el.wordPuzzleClueText.textContent = config.clue;
    }

    el.wordPuzzleContainer.style.display = "flex";
    if (el.wiresContainer) el.wiresContainer.style.display = "none";
    if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
    if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";

    render();
    bindEvents();
  }

  function cleanup() {
    activeConfig = null;
    selectedIndices = [];
    isSubmitting = false;
    isResolved = false;
    onCompleteCallback = null;
    onFailCallback = null;

    if (el.wordPuzzleContainer) el.wordPuzzleContainer.style.display = "none";
    if (el.wordAnswerRow) {
      el.wordAnswerRow.className = "word-answer-row";
    }
    if (el.wordPuzzleStatus) {
      el.wordPuzzleStatus.textContent = "CODE INPUT";
      el.wordPuzzleStatus.className = "word-puzzle-status";
    }
  }

  function isActive() {
    return Boolean(activeConfig && el.wordPuzzleContainer && el.wordPuzzleContainer.style.display !== "none" && !isResolved);
  }

  function render() {
    if (!activeConfig || !el.wordTilesGrid) return;
    el.wordTilesGrid.replaceChildren();

    const letters = activeConfig.scrambledLetters || ["A", "L", "Y", "R", "E"];
    letters.forEach((letter, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "word-tile";
      btn.dataset.index = String(idx);
      btn.dataset.letter = letter;
      btn.textContent = letter;
      btn.setAttribute("aria-label", `Letter ${letter}`);

      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        selectLetter(idx);
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        selectLetter(idx);
      });

      el.wordTilesGrid.appendChild(btn);
    });

    updateUI();
  }

  function selectLetter(tileIndex) {
    if (!activeConfig || isSubmitting || isResolved || state !== "PLAYING" || run?.inputLocked) return;
    if (selectedIndices.includes(tileIndex)) return;
    if (selectedIndices.length >= (activeConfig.word?.length || 5)) return;

    selectedIndices.push(tileIndex);
    if (typeof AudioManager?.playWireCut === "function") {
      AudioManager.playWireCut();
    }
    updateUI();
  }

  function clearAnswer() {
    if (!activeConfig || isSubmitting || isResolved || state !== "PLAYING" || run?.inputLocked) return;
    if (selectedIndices.length === 0) return;

    selectedIndices = [];
    if (typeof AudioManager?.playWireCut === "function") {
      AudioManager.playWireCut();
    }
    updateUI();
  }

  function submitAnswer() {
    if (!activeConfig || isSubmitting || isResolved || state !== "PLAYING" || run?.inputLocked) return;
    const wordTarget = activeConfig.word || "RELAY";
    if (selectedIndices.length !== wordTarget.length) return;

    const currentWord = selectedIndices.map(idx => activeConfig.scrambledLetters[idx]).join("");
    isSubmitting = true;

    if (currentWord === wordTarget) {
      // Correct Code Word!
      isResolved = true;
      if (el.wordPuzzleStatus) {
        el.wordPuzzleStatus.textContent = "CODE ACCEPTED";
        el.wordPuzzleStatus.className = "word-puzzle-status status-accepted";
      }
      if (el.wordAnswerRow) {
        el.wordAnswerRow.className = "word-answer-row row-accepted";
      }
      if (el.btnWordSubmit) el.btnWordSubmit.disabled = true;
      if (el.btnWordClear) el.btnWordClear.disabled = true;

      if (typeof AudioManager?.playPhaseComplete === "function") {
        AudioManager.playPhaseComplete();
      }
      if (typeof HapticsManager?.cutSuccess === "function") {
        HapticsManager.cutSuccess();
      }

      showFloatingText("CODE ACCEPTED", "var(--accent)");

      later(() => {
        if (typeof onCompleteCallback === "function") {
          onCompleteCallback();
        }
      }, 280);
    } else {
      // Incorrect Code Word
      if (el.wordPuzzleStatus) {
        el.wordPuzzleStatus.textContent = "CODE REJECTED";
        el.wordPuzzleStatus.className = "word-puzzle-status status-rejected";
      }
      if (el.wordAnswerRow) {
        el.wordAnswerRow.className = "word-answer-row row-rejected";
      }
      if (el.btnWordSubmit) el.btnWordSubmit.disabled = true;

      if (typeof AudioManager?.playWrongWire === "function") {
        AudioManager.playWrongWire();
      }
      if (typeof HapticsManager?.cutFailure === "function") {
        HapticsManager.cutFailure();
      }

      later(() => {
        if (state !== "PLAYING" || isResolved) return;
        selectedIndices = [];
        isSubmitting = false;
        if (el.wordPuzzleStatus) {
          el.wordPuzzleStatus.textContent = "CODE INPUT";
          el.wordPuzzleStatus.className = "word-puzzle-status";
        }
        if (el.wordAnswerRow) {
          el.wordAnswerRow.className = "word-answer-row";
        }
        updateUI();
      }, 480);
    }
  }

  function updateUI() {
    if (!activeConfig || !el.wordAnswerRow || !el.wordTilesGrid) return;

    const targetLength = activeConfig.word?.length || 5;
    const currentLetters = selectedIndices.map(idx => activeConfig.scrambledLetters[idx]);

    // Update Answer Slots
    for (let i = 0; i < targetLength; i++) {
      const slotEl = el.wordAnswerRow.querySelector(`#word-slot-${i}`) || el.wordAnswerRow.children[i];
      if (slotEl) {
        const charSpan = slotEl.querySelector(".word-slot-char") || slotEl;
        if (i < currentLetters.length) {
          charSpan.textContent = currentLetters[i];
          slotEl.classList.add("filled");
        } else {
          charSpan.textContent = "_";
          slotEl.classList.remove("filled");
        }
      }
    }

    // Update Letter Tiles
    const tileBtns = el.wordTilesGrid.querySelectorAll(".word-tile");
    tileBtns.forEach((btn) => {
      const idx = parseInt(btn.dataset.index, 10);
      const isSelected = selectedIndices.includes(idx);
      btn.disabled = isSelected || isSubmitting || isResolved;
      btn.classList.toggle("tile-selected", isSelected);
      btn.setAttribute("aria-disabled", isSelected ? "true" : "false");
    });

    // Update Submit & Clear Buttons
    if (el.btnWordSubmit) {
      const canSubmit = selectedIndices.length === targetLength && !isSubmitting && !isResolved;
      el.btnWordSubmit.disabled = !canSubmit;
      el.btnWordSubmit.setAttribute("aria-disabled", canSubmit ? "false" : "true");
    }

    if (el.btnWordClear) {
      const canClear = selectedIndices.length > 0 && !isSubmitting && !isResolved;
      el.btnWordClear.disabled = !canClear;
      el.btnWordClear.setAttribute("aria-disabled", canClear ? "false" : "true");
    }

    if (el.wordPuzzleChip) {
      el.wordPuzzleChip.textContent = `${currentLetters.length} / ${targetLength} LETTERS`;
    }
  }

  function bindEvents() {
    if (el.btnWordClear) {
      el.btnWordClear.onclick = (e) => {
        e.preventDefault();
        clearAnswer();
      };
    }
    if (el.btnWordSubmit) {
      el.btnWordSubmit.onclick = (e) => {
        e.preventDefault();
        submitAnswer();
      };
    }
  }

  return { init, cleanup, isActive, selectLetter, clearAnswer, submitAnswer };
})();

/* =========================================================
   SIGNAL ORDER MANAGER (CAMPAIGN LEVEL 9 — CORE OVERRIDE)
========================================================= */
const SignalOrderManager = (() => {
  let _config = null;
  let _onComplete = null;
  let _onFail = null;
  let _correctOrder = [];
  let _selectedValues = [];
  let _locked = false;
  let _done = false;

  function init(config, onComplete, onFail) {
    _config = config;
    _onComplete = onComplete;
    _onFail = onFail;
    _correctOrder = config.correctOrder.slice();
    _selectedValues = [];
    _locked = false;
    _done = false;

    if (!el.signalOrderTerminals) return;
    el.signalOrderTerminals.innerHTML = "";
    if (el.signalOrderChip) el.signalOrderChip.textContent = "0 / 4 SIGNALS ORDERED";

    // Render terminals in the display order of config.values (shuffled presentation)
    config.values.forEach((val, i) => {
      const btn = document.createElement("button");
      btn.className = "signal-terminal-btn";
      btn.id = `signal-terminal-${i}`;
      btn.dataset.value = val;
      btn.setAttribute("aria-label", `Signal terminal ${val} MHz`);
      btn.setAttribute("type", "button");

      btn.innerHTML = `
        <span class="signal-terminal-freq" aria-hidden="true">${val}</span>
        <span class="signal-terminal-unit">MHz</span>
        <span class="signal-terminal-badge" id="signal-badge-${i}" style="display:none;"></span>
      `;

      btn.addEventListener("click", () => handleTap(val, btn, i));
      el.signalOrderTerminals.appendChild(btn);
    });
  }

  function handleTap(val, btn, idx) {
    if (_locked || _done) return;
    if (btn.classList.contains("signal-terminal-selected")) return;

    const expectedValue = _correctOrder[_selectedValues.length];

    if (val !== expectedValue) {
      // Wrong order — fail immediately
      _locked = true;
      _done = true;
      btn.classList.add("signal-terminal-wrong");
      if (_onFail) _onFail("SIGNAL ORDER ERROR");
      return;
    }

    // Correct selection
    _selectedValues.push(val);
    btn.classList.add("signal-terminal-selected");
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");

    const badge = byId(`signal-badge-${idx}`);
    if (badge) {
      badge.textContent = _selectedValues.length;
      badge.style.display = "flex";
    }

    // Update progress chip
    if (el.signalOrderChip) {
      el.signalOrderChip.textContent = `${_selectedValues.length} / 4 SIGNALS ORDERED`;
    }

    // Play audio feedback if available
    if (typeof AudioManager !== "undefined" && AudioManager.playWireCut) {
      AudioManager.playWireCut();
    }

    if (_selectedValues.length === _correctOrder.length) {
      _locked = true;
      _done = true;
      if (_onComplete) _onComplete();
    }
  }

  function cleanup() {
    _config = null;
    _onComplete = null;
    _onFail = null;
    _selectedValues = [];
    _locked = false;
    _done = false;
    if (el.signalOrderTerminals) el.signalOrderTerminals.innerHTML = "";
    if (el.signalOrderChip) el.signalOrderChip.textContent = "0 / 4 SIGNALS ORDERED";
  }

  return { init, cleanup };
})();

const CampaignManager = (() => {
  function renderLevelSelect() {
    if (!profile.campaign) {
      profile.campaign = {
        currentChapter: 1,
        unlockedLevels: [1],
        levelStars: { 1: 0, 2: 0, 3: 0, 4: 0 },
        levelHighScores: { 1: 0, 2: 0, 3: 0, 4: 0 },
        levelFastestTimes: { 1: 0, 2: 0, 3: 0, 4: 0 }
      };
    }

    const camp = profile.campaign;
    const l1Stars = Math.min(3, Math.max(0, camp.levelStars?.[1] || 0));
    const l2Stars = Math.min(3, Math.max(0, camp.levelStars?.[2] || 0));
    const l3Stars = Math.min(3, Math.max(0, camp.levelStars?.[3] || 0));
    const l4Stars = Math.min(3, Math.max(0, camp.levelStars?.[4] || 0));
    const l5Stars = Math.min(3, Math.max(0, camp.levelStars?.[5] || 0));
    const l6Stars = Math.min(3, Math.max(0, camp.levelStars?.[6] || 0));
    const l7Stars = Math.min(3, Math.max(0, camp.levelStars?.[7] || 0));
    const l8Stars = Math.min(3, Math.max(0, camp.levelStars?.[8] || 0));
    const l9Stars = Math.min(3, Math.max(0, camp.levelStars?.[9] || 0));
    const l10Stars = Math.min(3, Math.max(0, camp.levelStars?.[10] || 0));
    const isL10Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(10);
    const isChapter1Complete = l10Stars > 0;
    if (el.campaignChapterStatus) {
      el.campaignChapterStatus.hidden = !isChapter1Complete;
      el.campaignChapterStatus.textContent = isChapter1Complete ? "CHAPTER 1 COMPLETE" : "";
    }

    // Update Level 1 Card
    if (el.starsLevel1) {
      const starSpans = el.starsLevel1.querySelectorAll(".star-icon");
      starSpans.forEach((span, idx) => {
        const isActive = idx < l1Stars;
        span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
      });
      el.starsLevel1.setAttribute("aria-label", `Stars: ${l1Stars} of 3`);
    }

    // Update Level 2 Card
    const isL2Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(2);
    if (el.levelCard2) {
      if (isL2Unlocked) {
        el.levelCard2.classList.remove("level-card-locked");
        el.levelCard2.classList.add("level-card-active");
        if (el.descLevel2) el.descLevel2.textContent = "Two targets. One sequence.";
        if (el.lockIcon2) {
          el.lockIcon2.style.display = "none";
        }
        if (el.starsLevel2) {
          el.starsLevel2.style.display = "flex";
          const starSpans = el.starsLevel2.querySelectorAll(".star-icon");
          starSpans.forEach((span, idx) => {
            const isActive = idx < l2Stars;
            span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
          });
          el.starsLevel2.setAttribute("aria-label", `Stars: ${l2Stars} of 3`);
        }
        if (el.btnPlayLevel2) {
          el.btnPlayLevel2.textContent = "PLAY";
          el.btnPlayLevel2.className = "btn btn-primary btn-play-level";
          el.btnPlayLevel2.disabled = false;
          el.btnPlayLevel2.setAttribute("aria-disabled", "false");
        }
      } else {
        el.levelCard2.classList.add("level-card-locked");
        el.levelCard2.classList.remove("level-card-active");
        if (el.descLevel2) el.descLevel2.textContent = "Protocol locked.";
        if (el.lockIcon2) {
          el.lockIcon2.style.display = "inline-block";
          el.lockIcon2.textContent = "🔒";
          el.lockIcon2.setAttribute("aria-label", "Locked");
        }
        if (el.starsLevel2) {
          el.starsLevel2.style.display = "none";
        }
        if (el.btnPlayLevel2) {
          el.btnPlayLevel2.textContent = "LOCKED";
          el.btnPlayLevel2.className = "btn btn-secondary btn-play-level";
          el.btnPlayLevel2.disabled = true;
          el.btnPlayLevel2.setAttribute("aria-disabled", "true");
        }
      }
    }

    // Update Level 3 Card
    const isL3Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(3);
    if (el.levelCard3) {
      if (isL3Unlocked) {
        el.levelCard3.classList.remove("level-card-locked");
        el.levelCard3.classList.add("level-card-active");
        if (el.descLevel3) el.descLevel3.textContent = "Three targets. One sequence.";
        if (el.lockIcon3) {
          el.lockIcon3.style.display = "none";
        }
        if (el.starsLevel3) {
          el.starsLevel3.style.display = "flex";
          const starSpans = el.starsLevel3.querySelectorAll(".star-icon");
          starSpans.forEach((span, idx) => {
            const isActive = idx < l3Stars;
            span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
          });
          el.starsLevel3.setAttribute("aria-label", `Stars: ${l3Stars} of 3`);
        }
        if (el.btnPlayLevel3) {
          el.btnPlayLevel3.textContent = "PLAY";
          el.btnPlayLevel3.className = "btn btn-primary btn-play-level";
          el.btnPlayLevel3.disabled = false;
          el.btnPlayLevel3.setAttribute("aria-disabled", "false");
        }
      } else {
        el.levelCard3.classList.add("level-card-locked");
        el.levelCard3.classList.remove("level-card-active");
        if (el.descLevel3) el.descLevel3.textContent = "Protocol locked.";
        if (el.lockIcon3) {
          el.lockIcon3.style.display = "inline-block";
          el.lockIcon3.textContent = "🔒";
          el.lockIcon3.setAttribute("aria-label", "Locked");
        }
        if (el.starsLevel3) {
          el.starsLevel3.style.display = "none";
        }
        if (el.btnPlayLevel3) {
          el.btnPlayLevel3.textContent = "LOCKED";
          el.btnPlayLevel3.className = "btn btn-secondary btn-play-level";
          el.btnPlayLevel3.disabled = true;
          el.btnPlayLevel3.setAttribute("aria-disabled", "true");
        }
      }
    }

    // Update Level 4 Card
    const isL4Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(4);
    if (el.levelCard4) {
      if (isL4Unlocked) {
        el.levelCard4.classList.remove("level-card-locked");
        el.levelCard4.classList.add("level-card-active");
        if (el.descLevel4) el.descLevel4.textContent = "Restore the severed circuits.";
        if (el.lockIcon4) {
          el.lockIcon4.style.display = "none";
        }
        if (el.starsLevel4) {
          el.starsLevel4.style.display = "flex";
          const starSpans = el.starsLevel4.querySelectorAll(".star-icon");
          starSpans.forEach((span, idx) => {
            const isActive = idx < l4Stars;
            span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
          });
          el.starsLevel4.setAttribute("aria-label", `Stars: ${l4Stars} of 3`);
        }
        if (el.btnPlayLevel4) {
          el.btnPlayLevel4.textContent = "PLAY";
          el.btnPlayLevel4.className = "btn btn-primary btn-play-level";
          el.btnPlayLevel4.disabled = false;
          el.btnPlayLevel4.setAttribute("aria-disabled", "false");
        }
      } else {
        el.levelCard4.classList.add("level-card-locked");
        el.levelCard4.classList.remove("level-card-active");
        if (el.descLevel4) el.descLevel4.textContent = "Protocol locked.";
        if (el.lockIcon4) {
          el.lockIcon4.style.display = "inline-block";
          el.lockIcon4.textContent = "🔒";
          el.lockIcon4.setAttribute("aria-label", "Locked");
        }
        if (el.starsLevel4) {
          el.starsLevel4.style.display = "none";
        }
        if (el.btnPlayLevel4) {
          el.btnPlayLevel4.textContent = "LOCKED";
          el.btnPlayLevel4.className = "btn btn-secondary btn-play-level";
          el.btnPlayLevel4.disabled = true;
          el.btnPlayLevel4.setAttribute("aria-disabled", "true");
        }
      }
    }

    // Update Level 5 Card
    const isL5Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(5);
    if (el.levelCard5) {
      if (isL5Unlocked) {
        el.levelCard5.classList.remove("level-card-locked");
        el.levelCard5.classList.add("level-card-active");
        if (el.descLevel5) el.descLevel5.textContent = "Remember the signal.";
        if (el.lockIcon5) {
          el.lockIcon5.style.display = "none";
        }
        if (el.starsLevel5) {
          el.starsLevel5.style.display = "flex";
          const starSpans = el.starsLevel5.querySelectorAll(".star-icon");
          starSpans.forEach((span, idx) => {
            const isActive = idx < l5Stars;
            span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
          });
          el.starsLevel5.setAttribute("aria-label", `Stars: ${l5Stars} of 3`);
        }
        if (el.btnPlayLevel5) {
          el.btnPlayLevel5.textContent = "PLAY";
          el.btnPlayLevel5.className = "btn btn-primary btn-play-level";
          el.btnPlayLevel5.disabled = false;
          el.btnPlayLevel5.setAttribute("aria-disabled", "false");
        }
      } else {
        el.levelCard5.classList.add("level-card-locked");
        el.levelCard5.classList.remove("level-card-active");
        if (el.descLevel5) el.descLevel5.textContent = "Protocol locked.";
        if (el.lockIcon5) {
          el.lockIcon5.style.display = "inline-block";
          el.lockIcon5.textContent = "🔒";
          el.lockIcon5.setAttribute("aria-label", "Locked");
        }
        if (el.starsLevel5) {
          el.starsLevel5.style.display = "none";
        }
        if (el.btnPlayLevel5) {
          el.btnPlayLevel5.textContent = "LOCKED";
          el.btnPlayLevel5.className = "btn btn-secondary btn-play-level";
          el.btnPlayLevel5.disabled = true;
          el.btnPlayLevel5.setAttribute("aria-disabled", "true");
        }
      }
    }

    // Update Level 6 Card
    const isL6Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(6);
    if (el.levelCard6) {
      if (isL6Unlocked) {
        el.levelCard6.classList.remove("level-card-locked");
        el.levelCard6.classList.add("level-card-active");
        if (el.descLevel6) el.descLevel6.textContent = "Remember. Identify. Defuse.";
        if (el.lockIcon6) {
          el.lockIcon6.style.display = "none";
        }
        if (el.starsLevel6) {
          el.starsLevel6.style.display = "flex";
          const starSpans = el.starsLevel6.querySelectorAll(".star-icon");
          starSpans.forEach((span, idx) => {
            const isActive = idx < l6Stars;
            span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
          });
          el.starsLevel6.setAttribute("aria-label", `Stars: ${l6Stars} of 3`);
        }
        if (el.btnPlayLevel6) {
          el.btnPlayLevel6.textContent = "PLAY";
          el.btnPlayLevel6.className = "btn btn-primary btn-play-level";
          el.btnPlayLevel6.disabled = false;
          el.btnPlayLevel6.setAttribute("aria-disabled", "false");
        }
      } else {
        el.levelCard6.classList.add("level-card-locked");
        el.levelCard6.classList.remove("level-card-active");
        if (el.descLevel6) el.descLevel6.textContent = "Protocol locked.";
        if (el.lockIcon6) {
          el.lockIcon6.style.display = "inline-block";
          el.lockIcon6.textContent = "🔒";
          el.lockIcon6.setAttribute("aria-label", "Locked");
        }
        if (el.starsLevel6) {
          el.starsLevel6.style.display = "none";
        }
        if (el.btnPlayLevel6) {
          el.btnPlayLevel6.textContent = "LOCKED";
          el.btnPlayLevel6.className = "btn btn-secondary btn-play-level";
          el.btnPlayLevel6.disabled = true;
          el.btnPlayLevel6.setAttribute("aria-disabled", "true");
        }
      }
    }

    // Update Level 7 Card
    const isL7Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(7);
    if (el.levelCard7) {
      if (isL7Unlocked) {
        el.levelCard7.classList.remove("level-card-locked");
        el.levelCard7.classList.add("level-card-active");
        if (el.descLevel7) el.descLevel7.textContent = "Decode the circuit.";
        if (el.lockIcon7) {
          el.lockIcon7.style.display = "none";
        }
        if (el.starsLevel7) {
          el.starsLevel7.style.display = "flex";
          const starSpans = el.starsLevel7.querySelectorAll(".star-icon");
          starSpans.forEach((span, idx) => {
            const isActive = idx < l7Stars;
            span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
          });
          el.starsLevel7.setAttribute("aria-label", `Stars: ${l7Stars} of 3`);
        }
        if (el.btnPlayLevel7) {
          el.btnPlayLevel7.textContent = "PLAY";
          el.btnPlayLevel7.className = "btn btn-primary btn-play-level";
          el.btnPlayLevel7.disabled = false;
          el.btnPlayLevel7.setAttribute("aria-disabled", "false");
        }
      } else {
        el.levelCard7.classList.add("level-card-locked");
        el.levelCard7.classList.remove("level-card-active");
        if (el.descLevel7) el.descLevel7.textContent = "Protocol locked.";
        if (el.lockIcon7) {
          el.lockIcon7.style.display = "inline-block";
          el.lockIcon7.textContent = "🔒";
          el.lockIcon7.setAttribute("aria-label", "Locked");
        }
        if (el.starsLevel7) {
          el.starsLevel7.style.display = "none";
        }
        if (el.btnPlayLevel7) {
          el.btnPlayLevel7.textContent = "LOCKED";
          el.btnPlayLevel7.className = "btn btn-secondary btn-play-level";
          el.btnPlayLevel7.disabled = true;
          el.btnPlayLevel7.setAttribute("aria-disabled", "true");
        }
      }
    }

    // Update Level 8 Card
    const isL8Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(8);
    if (el.levelCard8) {
      if (isL8Unlocked) {
        el.levelCard8.classList.remove("level-card-locked");
        el.levelCard8.classList.add("level-card-active");
        if (el.descLevel8) el.descLevel8.textContent = "Route the overload bypass.";
        if (el.lockIcon8) {
          el.lockIcon8.style.display = "none";
        }
        if (el.starsLevel8) {
          el.starsLevel8.style.display = "flex";
          const starSpans = el.starsLevel8.querySelectorAll(".star-icon");
          starSpans.forEach((span, idx) => {
            const isActive = idx < l8Stars;
            span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
          });
          el.starsLevel8.setAttribute("aria-label", `Stars: ${l8Stars} of 3`);
        }
        if (el.btnPlayLevel8) {
          el.btnPlayLevel8.textContent = "PLAY";
          el.btnPlayLevel8.className = "btn btn-primary btn-play-level";
          el.btnPlayLevel8.disabled = false;
          el.btnPlayLevel8.setAttribute("aria-disabled", "false");
        }
      } else {
        el.levelCard8.classList.add("level-card-locked");
        el.levelCard8.classList.remove("level-card-active");
        if (el.descLevel8) el.descLevel8.textContent = "Protocol locked.";
        if (el.lockIcon8) {
          el.lockIcon8.style.display = "inline-block";
          el.lockIcon8.textContent = "🔒";
          el.lockIcon8.setAttribute("aria-label", "Locked");
        }
        if (el.starsLevel8) {
          el.starsLevel8.style.display = "none";
        }
        if (el.btnPlayLevel8) {
          el.btnPlayLevel8.textContent = "LOCKED";
          el.btnPlayLevel8.className = "btn btn-secondary btn-play-level";
          el.btnPlayLevel8.disabled = true;
          el.btnPlayLevel8.setAttribute("aria-disabled", "true");
        }
      }
    }

    // Update Level 9 Card
    const isL9Unlocked = Array.isArray(camp.unlockedLevels) && camp.unlockedLevels.includes(9);
    if (el.levelCard9) {
      if (isL9Unlocked) {
        el.levelCard9.classList.remove("level-card-locked");
        el.levelCard9.classList.add("level-card-active");
        if (el.descLevel9) el.descLevel9.textContent = "Order the signals. Sever the core.";
        if (el.lockIcon9) {
          el.lockIcon9.style.display = "none";
        }
        if (el.starsLevel9) {
          el.starsLevel9.style.display = "flex";
          const starSpans = el.starsLevel9.querySelectorAll(".star-icon");
          starSpans.forEach((span, idx) => {
            const isActive = idx < l9Stars;
            span.className = `star-icon ${isActive ? "star-active" : "star-inactive"}`;
          });
          el.starsLevel9.setAttribute("aria-label", `Stars: ${l9Stars} of 3`);
        }
        if (el.btnPlayLevel9) {
          el.btnPlayLevel9.textContent = "PLAY";
          el.btnPlayLevel9.className = "btn btn-primary btn-play-level";
          el.btnPlayLevel9.disabled = false;
          el.btnPlayLevel9.setAttribute("aria-disabled", "false");
        }
      } else {
        el.levelCard9.classList.add("level-card-locked");
        el.levelCard9.classList.remove("level-card-active");
        if (el.descLevel9) el.descLevel9.textContent = "Protocol locked.";
        if (el.lockIcon9) {
          el.lockIcon9.style.display = "inline-block";
          el.lockIcon9.textContent = "🔒";
          el.lockIcon9.setAttribute("aria-label", "Locked");
        }
        if (el.starsLevel9) {
          el.starsLevel9.style.display = "none";
        }
        if (el.btnPlayLevel9) {
          el.btnPlayLevel9.textContent = "LOCKED";
          el.btnPlayLevel9.className = "btn btn-secondary btn-play-level";
          el.btnPlayLevel9.disabled = true;
          el.btnPlayLevel9.setAttribute("aria-disabled", "true");
        }
      }
    }

    // Update Level 10 Card using the same locked/playable pattern as Level 9
    if (el.levelCard10) {
      el.levelCard10.classList.add("level-card-locked");
      el.levelCard10.classList.remove("level-card-coming-soon");
      el.levelCard10.classList.remove("level-card-active");
      if (el.lockIcon10) {
        el.lockIcon10.style.display = "inline-block";
        el.lockIcon10.textContent = "🔒";
        el.lockIcon10.setAttribute("aria-label", "Locked");
      }
      if (el.descLevel10) el.descLevel10.textContent = "Protocol locked.";
      if (el.btnPlayLevel10) {
        el.btnPlayLevel10.textContent = "LOCKED";
        el.btnPlayLevel10.className = "btn btn-secondary btn-play-level";
        el.btnPlayLevel10.disabled = true;
        el.btnPlayLevel10.setAttribute("aria-disabled", "true");
      }
    }

    if (el.levelCard10 && isL10Unlocked) {
      el.levelCard10.classList.remove("level-card-locked", "level-card-coming-soon");
      el.levelCard10.classList.add("level-card-active");
      if (el.lockIcon10) el.lockIcon10.style.display = "none";
      if (el.descLevel10) el.descLevel10.textContent = "Complete the final Chapter 1 protocol.";
      if (el.starsLevel10) {
        el.starsLevel10.style.display = "flex";
        el.starsLevel10.querySelectorAll(".star-icon").forEach((span, idx) => {
          span.className = `star-icon ${idx < l10Stars ? "star-active" : "star-inactive"}`;
        });
        el.starsLevel10.setAttribute("aria-label", `Stars: ${l10Stars} of 3`);
      }
      if (el.btnPlayLevel10) {
        el.btnPlayLevel10.textContent = "PLAY";
        el.btnPlayLevel10.className = "btn btn-primary btn-play-level";
        el.btnPlayLevel10.disabled = false;
        el.btnPlayLevel10.setAttribute("aria-disabled", "false");
      }
    }
  }

  function openLevelSelect() {
    renderLevelSelect();
    state = "CAMPAIGN_SELECT";
    showScreen("campaign-select");
  }

  function openBriefing(levelNum = 1) {
    const levelDef = CampaignConfig.levels[levelNum];
    if (!levelDef) return;
    campaignCurrentLevel = levelNum;

    if (el.campaignBriefingBadge) {
      el.campaignBriefingBadge.textContent = `CHAPTER ${levelDef.chapter} · ${levelDef.subtitle}`;
    }
    if (el.campaignBriefingTitle) {
      el.campaignBriefingTitle.textContent = levelDef.title;
    }
    if (el.campaignBriefingDesc) {
      el.campaignBriefingDesc.textContent = `"${levelDef.briefing}"`;
    }

    if (el.campaignBriefingRules && Array.isArray(levelDef.rulesInfo)) {
      el.campaignBriefingRules.replaceChildren();
      levelDef.rulesInfo.forEach(r => {
        const item = document.createElement("div");
        item.className = "briefing-rule-item";
        item.innerHTML = `
          <span class="briefing-rule-icon" aria-hidden="true">${r.icon}</span>
          <div class="briefing-rule-text">
            <strong>${r.label}</strong>
            <span>${r.desc}</span>
          </div>
        `;
        el.campaignBriefingRules.appendChild(item);
      });
    }

    state = "CAMPAIGN_BRIEFING";
    showScreen("campaign-briefing");
  }

  function startLevel(levelNum = 1) {
    const levelDef = CampaignConfig.levels[levelNum];
    if (!levelDef) return;

    clearPendingTransitions();
    Timer.stop();
    PowerManager.cleanup();
    AudioManager.init();

    gameMode = "CAMPAIGN";
    campaignCurrentLevel = levelNum;

    run = newRun();
    run.bombNumber = 1;
    run.isCampaign = true;
    run.campaignLevel = levelNum;
    run.powerUsedOnRun = false;
    run.analyticsAttemptId = AnalyticsManager.beginAttempt();
    AnalyticsManager.logGameplayEvent("level_started", run.analyticsAttemptId, "start", {
      level_id: levelNum,
      puzzle_type: AnalyticsManager.puzzleTypeForLevel(levelDef)
    });

    state = "PLAYING";
    if (screens.game) {
      screens.game.style.setProperty("--danger-level", "0");
      screens.game.classList.remove(
        "danger-warning", "danger-danger", "danger-critical",
        "difficulty-easy", "difficulty-normal", "difficulty-hard", "difficulty-veryhard", "difficulty-extreme"
      );
      screens.game.classList.add("danger-safe", "difficulty-easy");
    }
    if (el.dailyHudBanner) el.dailyHudBanner.style.display = "none";
    if (el.hudTimeBank) el.hudTimeBank.style.display = "none";

    showScreen("game");

    if (el.hudScore) el.hudScore.textContent = "0";
    if (el.hudBombLabel) el.hudBombLabel.textContent = `LEVEL ${String(levelDef.level).padStart(2, "0")}`;
    if (el.hudStreak) el.hudStreak.textContent = `CH ${levelDef.chapter}`;
    if (el.hudBest) el.hudBest.textContent = String(profile.campaign?.levelHighScores?.[levelNum] || 0);
    const bestLabel = byId("hud-best-label");
    if (bestLabel) bestLabel.textContent = "BEST";

    if (el.bomb) {
      el.bomb.classList.toggle("word-puzzle-mode", levelDef.gameplayType === "WORD_PUZZLE");
      BombVisualVariants.forEach(v => el.bomb.classList.remove(v.className));
      Object.values(BombEventRegistry).forEach(evt => el.bomb.classList.remove(evt.className));
      el.bomb.classList.remove("exploding", "shaking", "success-pulse", "failure-pulse", "pcb-pulse-phase");
      const sysCodeEl = el.bomb.querySelector(".bomb-sys-code");
      if (sysCodeEl) {
        sysCodeEl.textContent = `CH1-LVL${levelDef.level}`;
      }
    }

    setBombStatus("ARMING");

    if (levelDef.gameplayType === "FINAL_PROTOCOL") {
      // Level 10 uses one timer for all three puzzle phases.
      CircuitFlowManager.cleanup();
      SignalMemoryManager.cleanup();
      WordPuzzleManager.cleanup();
      SignalOrderManager.cleanup();
      if (el.wordPuzzleContainer) el.wordPuzzleContainer.style.display = "none";
      if (el.signalOrderContainer) el.signalOrderContainer.style.display = "none";
      if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
      if (el.wiresContainer) {
        el.wiresContainer.replaceChildren();
        el.wiresContainer.style.display = "none";
      }
      if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "flex";

      run.bomb = {
        number: 1,
        wires: [],
        time: levelDef.timer,
        challenge: { text: "REPEAT THE SIGNAL SEQUENCE", type: "memory", answerIndex: 0 },
        phases: [],
        currentPhaseIndex: 0,
        totalPhases: 3,
        event: null
      };

      if (el.instruction) el.instruction.textContent = "PHASE 1/3 · REPEAT THE SIGNAL SEQUENCE";
      renderTimer(levelDef.timer, levelDef.timer);
      setBombStatus("RECORDING");

      const failFinalProtocol = reason => {
        Timer.stop();
        SignalMemoryManager.cleanup();
        CircuitFlowManager.cleanup();
        explode(reason || "FINAL PROTOCOL FAILURE");
      };

      Timer.start(levelDef.timer, renderTimer, () => failFinalProtocol("TIME'S UP!"));

      SignalMemoryManager.init(
        levelDef.memoryConfig,
        () => {},
        () => {
          if (state !== "PLAYING") return;
          SignalMemoryManager.cleanup();
          run.inputLocked = true;
          if (el.instruction) el.instruction.textContent = "PHASE 1/3 COMPLETE";
          setBombStatus("ARMED");
          if (el.bomb) {
            el.bomb.classList.add("pcb-pulse-phase");
            later(() => el.bomb?.classList.remove("pcb-pulse-phase"), 350);
          }

          later(() => {
            if (state !== "PLAYING") return;
            if (el.instruction) el.instruction.textContent = "PHASE 2/3 · RESTORE THE CIRCUIT";
            if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";
            if (el.wiresContainer) el.wiresContainer.style.display = "none";
            if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "flex";
            run.bomb.currentPhaseIndex = 1;
            run.bomb.challenge = { text: "RESTORE THE CIRCUIT", type: "circuit", answerIndex: 0 };
            run.inputLocked = false;

            CircuitFlowManager.init(levelDef.circuitConfig, () => {
              if (state !== "PLAYING") return;
              CircuitFlowManager.cleanup();
              run.inputLocked = true;
              if (el.instruction) el.instruction.textContent = "PHASE 2/3 COMPLETE";
              setBombStatus("ARMED");
              if (el.bomb) {
                el.bomb.classList.add("pcb-pulse-phase");
                later(() => el.bomb?.classList.remove("pcb-pulse-phase"), 350);
              }

              later(() => {
                if (state !== "PLAYING") return;
                const wires = levelDef.wires.map(w => ({ ...w, cut: false }));
                const phase3 = {
                  phaseIndex: 2,
                  totalPhases: 3,
                  type: "color",
                  text: "CUT THE RED WIRE",
                  answerIndex: levelDef.targetMapping.wireIndex
                };
                run.bomb.wires = wires;
                run.bomb.phases = [phase3];
                run.bomb.challenge = { ...phase3 };
                run.bomb.currentPhaseIndex = 0;
                run.bomb.totalPhases = 1;
                if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
                if (el.wiresContainer) el.wiresContainer.style.display = "flex";
                if (el.instruction) el.instruction.textContent = "PHASE 3/3 · CUT THE RED WIRE";
                renderWires(run.bomb.wires);
                run.inputLocked = false;
              }, 320);
            });
          }, 420);
        },
        failFinalProtocol
      );
    } else if (levelDef.gameplayType === "SIGNAL_MEMORY") {
      CircuitFlowManager.cleanup();
      run.bomb = {
        number: 1,
        wires: [],
        time: levelDef.timer,
        challenge: { text: "MEMORIZE THE SIGNAL" },
        phases: [],
        currentPhaseIndex: 0,
        totalPhases: 1,
        event: null
      };

      if (el.instruction) el.instruction.textContent = "WATCH THE SIGNAL";
      if (el.wiresContainer) el.wiresContainer.style.display = "none";
      if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
      if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "flex";

      renderTimer(levelDef.timer, levelDef.timer);
      setBombStatus("RECORDING");

      SignalMemoryManager.init(
        levelDef.memoryConfig,
        () => {
          Timer.start(levelDef.timer, renderTimer, () => {
            SignalMemoryManager.cleanup();
            failLevel(levelNum, "TIME'S UP!");
          });
        },
        () => {
          const remaining = Timer.remaining;
          Timer.stop();
          setBombStatus("DEFUSED");
          completeLevel(levelNum, {
            completed: true,
            secondsLeft: remaining,
            timeElapsed: Math.max(0, levelDef.timer - remaining),
            powerUsed: Boolean(run.powerUsedOnRun)
          });
        },
        (failReason) => {
          Timer.stop();
          SignalMemoryManager.cleanup();
          explode(failReason || "SIGNAL MISMATCH");
        }
      );
    } else if (levelDef.gameplayType === "COMBINATION") {
      // COMBINATION: Phase 1 = Signal Memory, Phase 2 = Wire Defusal
      CircuitFlowManager.cleanup();
      if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
      if (el.wiresContainer) el.wiresContainer.style.display = "none";
      if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "flex";

      run.bomb = {
        number: 1,
        wires: [],
        time: levelDef.timer,
        challenge: { text: "MEMORIZE THE SIGNAL" },
        phases: [],
        currentPhaseIndex: 0,
        totalPhases: 2,
        event: null
      };

      if (el.instruction) el.instruction.textContent = "PHASE 1/2 · WATCH THE SIGNAL";
      renderTimer(levelDef.timer, levelDef.timer);
      setBombStatus("RECORDING");

      SignalMemoryManager.init(
        levelDef.memoryConfig,
        // onStartPlayableTimer: called after reveal, start the countdown
        () => {
          Timer.start(levelDef.timer, renderTimer, () => {
            SignalMemoryManager.cleanup();
            CampaignManager.failLevel(levelNum, "TIME'S UP!");
          });
        },
        // onComplete: Phase 1 success — transition to Phase 2 (wire defusal)
        () => {
          if (state !== "PLAYING") return;
          SignalMemoryManager.cleanup();

          // Short transition lock
          run.inputLocked = true;
          if (el.instruction) el.instruction.textContent = "PHASE 1/2 · SIGNAL LOCKED";
          setBombStatus("ARMED");
          AudioManager.playPhaseComplete ? AudioManager.playPhaseComplete() : null;
          if (el.bomb) {
            el.bomb.classList.add("pcb-pulse-phase");
            later(() => el.bomb?.classList.remove("pcb-pulse-phase"), 350);
          }

          later(() => {
            if (state !== "PLAYING") return;

            // Build Phase 2: wire defusal
            const targetMapping = levelDef.targetMapping;
            const wires = levelDef.wires.map(w => ({ ...w, cut: false }));
            const phase2 = {
              phaseIndex: 1,
              totalPhases: 2,
              type: "color",
              text: `CUT THE ${(targetMapping.wireColor || "yellow").toUpperCase()} WIRE`,
              answerIndex: targetMapping.wireIndex
            };

            run.bomb.wires = wires;
            run.bomb.phases = [phase2];
            run.bomb.challenge = { ...phase2 };
            run.bomb.currentPhaseIndex = 0;
            run.bomb.totalPhases = 1;

            if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";
            if (el.wiresContainer) el.wiresContainer.style.display = "flex";

            if (el.instruction) el.instruction.textContent = `PHASE 2/2 · ${phase2.text}`;
            renderWires(run.bomb.wires);
            run.inputLocked = false;
          }, 480);
        },
        // onFail: Phase 1 wrong node
        (failReason) => {
          Timer.stop();
          SignalMemoryManager.cleanup();
          explode(failReason || "SIGNAL MISMATCH");
        }
      );
    } else if (levelDef.gameplayType === "WORD_PUZZLE") {
      CircuitFlowManager.cleanup();
      SignalMemoryManager.cleanup();
      if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
      if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";
      if (el.wiresContainer) el.wiresContainer.style.display = "none";
      if (el.wordPuzzleContainer) el.wordPuzzleContainer.style.display = "flex";

      run.bomb = {
        number: 1,
        wires: [],
        time: levelDef.timer,
        challenge: { text: "DECODE THE CODE WORD" },
        phases: [],
        currentPhaseIndex: 0,
        totalPhases: 2,
        event: null
      };

      if (el.instruction) el.instruction.textContent = "DECODE THE CODE WORD";
      renderTimer(levelDef.timer, levelDef.timer);
      setBombStatus("ARMED");

      WordPuzzleManager.init(
        levelDef.wordConfig,
        // onComplete: Phase 1 success -> transition to Phase 2 (wire defusal)
        () => {
          if (state !== "PLAYING") return;
          WordPuzzleManager.cleanup();

          run.inputLocked = true;
          if (el.instruction) el.instruction.textContent = "CODE ACCEPTED";
          setBombStatus("ARMED");

          if (el.bomb) {
            el.bomb.classList.add("pcb-pulse-phase");
            later(() => el.bomb?.classList.remove("pcb-pulse-phase"), 350);
          }

          later(() => {
            if (state !== "PLAYING") return;

            const targetMapping = levelDef.wordConfig.targetMapping;
            const wires = levelDef.wires.map(w => ({ ...w, cut: false }));
            const phase2 = {
              phaseIndex: 1,
              totalPhases: 2,
              type: "color",
              text: `CUT THE ${(targetMapping.wireColor || "blue").toUpperCase()} WIRE`,
              answerIndex: targetMapping.wireIndex
            };

            run.bomb.wires = wires;
            run.bomb.phases = [phase2];
            run.bomb.challenge = { ...phase2 };
            run.bomb.currentPhaseIndex = 0;
            run.bomb.totalPhases = 1;

            if (el.wordPuzzleContainer) el.wordPuzzleContainer.style.display = "none";
            if (el.wiresContainer) el.wiresContainer.style.display = "flex";

            if (el.instruction) el.instruction.textContent = `PHASE 2/2 · ${phase2.text}`;
            renderWires(run.bomb.wires);
            run.inputLocked = false;
          }, 260);
        },
        // onFail
        (failReason) => {
          Timer.stop();
          WordPuzzleManager.cleanup();
          explode(failReason || "CODE REJECTED");
        }
      );
    } else if (levelDef.gameplayType === "FREE_FLOW") {
      CircuitFlowManager.cleanup();
      SignalMemoryManager.cleanup();
      WordPuzzleManager.cleanup();
      SignalOrderManager.cleanup();
      if (el.wordPuzzleContainer) el.wordPuzzleContainer.style.display = "none";
      if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";
      if (el.signalOrderContainer) el.signalOrderContainer.style.display = "none";

      run.bomb = {
        number: 1,
        wires: [],
        time: levelDef.timer,
        challenge: { text: "RESTORE ALL CIRCUITS" },
        phases: [],
        currentPhaseIndex: 0,
        totalPhases: 1,
        event: null
      };

      if (el.instruction) el.instruction.textContent = "RESTORE ALL CIRCUITS";
      if (el.wiresContainer) el.wiresContainer.style.display = "none";
      if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "flex";

      CircuitFlowManager.init(levelDef.circuitConfig, () => {
        const remaining = Timer.remaining;
        Timer.stop();
        setBombStatus("DEFUSED");
        completeLevel(levelNum, {
          completed: true,
          secondsLeft: remaining,
          timeElapsed: Math.max(0, levelDef.timer - remaining),
          powerUsed: Boolean(run.powerUsedOnRun)
        });
      });
    } else if (levelDef.gameplayType === "CIRCUIT_OVERLOAD") {
      CircuitFlowManager.cleanup();
      SignalMemoryManager.cleanup();
      WordPuzzleManager.cleanup();
      SignalOrderManager.cleanup();
      if (el.wordPuzzleContainer) el.wordPuzzleContainer.style.display = "none";
      if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";
      if (el.signalOrderContainer) el.signalOrderContainer.style.display = "none";
      if (el.wiresContainer) el.wiresContainer.style.display = "none";
      if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "flex";

      run.bomb = {
        number: 1,
        wires: [],
        time: levelDef.timer,
        challenge: { text: "ROUTE OVERLOAD BYPASS" },
        phases: [],
        currentPhaseIndex: 0,
        totalPhases: 2,
        event: null
      };

      if (el.instruction) el.instruction.textContent = "PHASE 1/2 · ROUTE OVERLOAD BYPASS";
      renderTimer(levelDef.timer, levelDef.timer);
      setBombStatus("ARMED");

      CircuitFlowManager.init(levelDef.circuitConfig, () => {
        if (state !== "PLAYING") return;
        CircuitFlowManager.cleanup();

        run.inputLocked = true;
        if (el.instruction) el.instruction.textContent = "OVERLOAD STABILIZED";
        setBombStatus("ARMED");

        if (AudioManager.playPhaseComplete) AudioManager.playPhaseComplete();
        if (el.bomb) {
          el.bomb.classList.add("pcb-pulse-phase");
          later(() => el.bomb?.classList.remove("pcb-pulse-phase"), 350);
        }

        later(() => {
          if (state !== "PLAYING") return;

          const targetMapping = levelDef.targetMapping;
          const wires = levelDef.wires.map(w => ({ ...w, cut: false }));
          const phase2 = {
            phaseIndex: 1,
            totalPhases: 2,
            type: "color",
            text: `CUT THE ${(targetMapping.wireColor || "green").toUpperCase()} WIRE`,
            answerIndex: targetMapping.wireIndex
          };

          run.bomb.wires = wires;
          run.bomb.phases = [phase2];
          run.bomb.challenge = { ...phase2 };
          run.bomb.currentPhaseIndex = 0;
          run.bomb.totalPhases = 1;

          if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
          if (el.wiresContainer) el.wiresContainer.style.display = "flex";

          if (el.instruction) el.instruction.textContent = `PHASE 2/2 · ${phase2.text}`;
          renderWires(run.bomb.wires);
          run.inputLocked = false;
        }, 320);
      });
    } else if (levelDef.gameplayType === "SIGNAL_ORDER") {
      CircuitFlowManager.cleanup();
      SignalMemoryManager.cleanup();
      WordPuzzleManager.cleanup();
      if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
      if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";
      if (el.wordPuzzleContainer) el.wordPuzzleContainer.style.display = "none";
      if (el.wiresContainer) el.wiresContainer.style.display = "none";
      if (el.signalOrderContainer) el.signalOrderContainer.style.display = "flex";

      run.bomb = {
        number: 1,
        wires: [],
        time: levelDef.timer,
        challenge: { text: "ORDER SIGNALS: LOWEST TO HIGHEST" },
        phases: [],
        currentPhaseIndex: 0,
        totalPhases: 2,
        event: null
      };

      if (el.instruction) el.instruction.textContent = "ORDER SIGNALS: LOWEST TO HIGHEST";
      renderTimer(levelDef.timer, levelDef.timer);
      setBombStatus("ARMED");

      SignalOrderManager.init(
        levelDef.signalOrderConfig,
        // onComplete: all 4 terminals tapped in order → Phase 2
        () => {
          if (state !== "PLAYING") return;
          run.inputLocked = true;
          if (el.instruction) el.instruction.textContent = "SIGNALS STABILIZED";
          setBombStatus("ARMED");

          if (AudioManager && AudioManager.playPhaseComplete) AudioManager.playPhaseComplete();
          if (el.bomb) {
            el.bomb.classList.add("pcb-pulse-phase");
            later(() => el.bomb?.classList.remove("pcb-pulse-phase"), 350);
          }

          later(() => {
            if (state !== "PLAYING") return;

            const targetMapping = levelDef.targetMapping;
            const wires = levelDef.wires.map(w => ({ ...w, cut: false }));
            const phase2 = {
              phaseIndex: 1,
              totalPhases: 2,
              type: "color",
              text: `CUT THE ${(targetMapping.wireColor || "white").toUpperCase()} WIRE`,
              answerIndex: targetMapping.wireIndex
            };

            run.bomb.wires = wires;
            run.bomb.phases = [phase2];
            run.bomb.challenge = { ...phase2 };
            run.bomb.currentPhaseIndex = 0;
            run.bomb.totalPhases = 1;

            if (el.signalOrderContainer) el.signalOrderContainer.style.display = "none";
            if (el.wiresContainer) el.wiresContainer.style.display = "flex";

            if (el.instruction) el.instruction.textContent = `PHASE 2/2 · ${phase2.text}`;
            renderWires(run.bomb.wires);
            run.inputLocked = false;
          }, 320);
        },
        // onFail: wrong terminal order
        (failReason) => {
          Timer.stop();
          SignalOrderManager.cleanup();
          explode(failReason || "SIGNAL ORDER ERROR");
        }
      );
    } else {
      CircuitFlowManager.cleanup();
      SignalMemoryManager.cleanup();
      WordPuzzleManager.cleanup();
      SignalOrderManager.cleanup();
      if (el.wordPuzzleContainer) el.wordPuzzleContainer.style.display = "none";
      if (el.signalMemoryContainer) el.signalMemoryContainer.style.display = "none";
      if (el.circuitFlowContainer) el.circuitFlowContainer.style.display = "none";
      if (el.signalOrderContainer) el.signalOrderContainer.style.display = "none";
      if (el.wiresContainer) el.wiresContainer.style.display = "flex";


      const wires = levelDef.wires.map(w => ({ ...w, cut: false }));
      const phases = levelDef.phases ? levelDef.phases.map(p => ({ ...p })) : [{ phaseIndex: 0, totalPhases: 1, ...levelDef.rule }];
      const totalPhases = phases.length;
      const initialChallenge = { ...phases[0] };

      run.bomb = {
        number: 1,
        wires: wires,
        time: levelDef.timer,
        challenge: initialChallenge,
        phases: phases,
        currentPhaseIndex: 0,
        totalPhases: totalPhases,
        event: null
      };

      if (el.instruction) {
        if (totalPhases > 1) {
          el.instruction.textContent = `PHASE 1/${totalPhases} · ${initialChallenge.text}`;
        } else {
          el.instruction.textContent = initialChallenge.text;
        }
      }

      renderWires(run.bomb.wires);
    }

    AudioManager.resetTickTracker();
    PowerManager.clearScanner();
    updatePowerUI();

    if (levelDef.gameplayType !== "SIGNAL_MEMORY" && levelDef.gameplayType !== "COMBINATION" && levelDef.gameplayType !== "FINAL_PROTOCOL") {
      later(() => {
        if (state === "PLAYING" && !PowerManager.isFrozen && !PowerManager.isSlowed) {
          setBombStatus("ARMED");
        }
      }, 180);

      Timer.start(levelDef.timer, renderTimer, () => {
        if (levelDef.gameplayType === "FREE_FLOW" || levelDef.gameplayType === "CIRCUIT_OVERLOAD") {
          CircuitFlowManager.cleanup();
          failLevel(levelNum, "TIME'S UP!");
        } else if (levelDef.gameplayType === "WORD_PUZZLE") {
          WordPuzzleManager.cleanup();
          failLevel(levelNum, "TIME'S UP!");
        } else if (levelDef.gameplayType === "SIGNAL_ORDER") {
          SignalOrderManager.cleanup();
          failLevel(levelNum, "TIME'S UP!");
        } else {
          explode("TIME'S UP!");
        }
      });
    }
  }

  function completeLevel(levelNum, ctx) {
    const levelDef = CampaignConfig.levels[levelNum];
    if (!levelDef) return;

    if (!profile.campaign) {
      profile.campaign = {
        currentChapter: 1,
        unlockedLevels: [1],
        levelStars: { 1: 0 },
        levelHighScores: { 1: 0 },
        levelFastestTimes: { 1: 0 }
      };
    }

    const { secondsLeft, timeElapsed, powerUsed } = ctx;

    // Evaluate star conditions dynamically for this level
    let starsEarned = 0;
    if (Array.isArray(levelDef.starConditions)) {
      levelDef.starConditions.forEach(cond => {
        const passed = Boolean(cond.test(ctx));
        if (passed) starsEarned += 1;
      });
    } else {
      starsEarned = 1;
    }

    AnalyticsManager.logGameplayEvent("level_completed", run?.analyticsAttemptId, "terminal", {
      level_id: levelNum,
      puzzle_type: AnalyticsManager.puzzleTypeForLevel(levelDef),
      duration_seconds: timeElapsed,
      stars_earned: starsEarned
    });

    const baseScore = levelDef.baseReward?.score || 100;
    const timeBonus = Math.round(secondsLeft * 20);
    const starBonus = starsEarned * 50;
    const finalScore = baseScore + timeBonus + starBonus;

    const prevStars = profile.campaign.levelStars?.[levelNum] || 0;
    const isFirstClear = prevStars === 0;
    const coinsReward = isFirstClear ? (levelDef.baseReward?.coins || 50) : 15;

    // Progression save: unlock next level
    const nextLevelNum = levelNum + 1;
    if (!profile.campaign.unlockedLevels.includes(nextLevelNum)) {
      profile.campaign.unlockedLevels.push(nextLevelNum);
      profile.campaign.unlockedLevels.sort((a, b) => a - b);
    }
    profile.campaign.levelStars[levelNum] = Math.max(prevStars, starsEarned);
    profile.campaign.levelHighScores[levelNum] = Math.max(profile.campaign.levelHighScores?.[levelNum] || 0, finalScore);
    const prevFastest = profile.campaign.levelFastestTimes?.[levelNum] || 0;
    if (prevFastest === 0 || timeElapsed < prevFastest) {
      profile.campaign.levelFastestTimes[levelNum] = Number(timeElapsed.toFixed(2));
    }

    profile.coins += coinsReward;
    profile.stats.totalCoinsEarned = (profile.stats.totalCoinsEarned || 0) + coinsReward;
    profile.stats.totalBombsDefused = (profile.stats.totalBombsDefused || 0) + 1;
    profile.stats.totalScore = (profile.stats.totalScore || 0) + finalScore;

    SaveManager.save(profile);
    refreshPersistentUI();
    if (levelNum === 10) {
      AchievementManager.unlock("protocol_breaker");
    }

    const isChapterComplete = levelNum === 10;
    const chapterStars = Object.values(profile.campaign.levelStars || {}).reduce((sum, value) => sum + Math.min(3, Math.max(0, Number(value) || 0)), 0);
    const chapterScore = Object.values(profile.campaign.levelHighScores || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);

    // Result UI Population
    if (el.campaignResultTitle) {
      el.campaignResultTitle.textContent = isChapterComplete ? "CHAPTER 1 COMPLETE" : "LEVEL COMPLETE";
      el.campaignResultTitle.style.color = "var(--accent)";
    }
    if (el.campaignResultSubtitle) {
      el.campaignResultSubtitle.textContent = levelDef.title;
    }

    // Set 3 stars
    [el.resultStar1, el.resultStar2, el.resultStar3].forEach((starEl, idx) => {
      if (!starEl) return;
      starEl.classList.toggle("star-active", idx < starsEarned);
    });

    if (el.campaignResultScore) el.campaignResultScore.textContent = finalScore.toLocaleString();
    if (el.campaignResultTime) el.campaignResultTime.textContent = `${timeElapsed.toFixed(1)}s`;
    if (el.campaignResultCoins) el.campaignResultCoins.textContent = `+${coinsReward} COINS`;
    if (el.btnCampaignNextLevel) {
      el.btnCampaignNextLevel.style.display = "block";
      el.btnCampaignNextLevel.textContent = isChapterComplete ? "LEVEL SELECT" : "NEXT LEVEL";
    }
    if (el.btnCampaignLevelSelect) {
      el.btnCampaignLevelSelect.style.display = isChapterComplete ? "none" : "block";
    }
    if (el.campaignChapterSummary) {
      el.campaignChapterSummary.style.display = isChapterComplete ? "grid" : "none";
      if (isChapterComplete) {
        if (el.campaignChapterSummaryTitle) el.campaignChapterSummaryTitle.textContent = "CHAPTER 1 COMPLETE";
        if (el.campaignChapterSummaryStats) el.campaignChapterSummaryStats.textContent = `${chapterStars} / 30 STARS · ${chapterScore.toLocaleString()} SCORE`;
        if (el.campaignChapterSummaryLevel) el.campaignChapterSummaryLevel.textContent = "LEVEL 10 COMPLETE";
      }
    }

    later(() => {
      state = "CAMPAIGN_RESULT";
      showScreen("campaign-result");
      window.BombDefuseAdMobService?.onCampaignLevelCompleted(levelNum < 10);
    }, 480);
  }

  function failLevel(levelNum, reason = "WRONG WIRE") {
    const levelDef = CampaignConfig.levels[levelNum] || { title: "FIRST CUT" };
    const durationSeconds = levelDef.timer ? Math.max(0, levelDef.timer - (Number(Timer.remaining) || 0)) : 0;
    AnalyticsManager.logGameplayEvent("level_failed", run?.analyticsAttemptId, "terminal", {
      level_id: levelNum,
      puzzle_type: AnalyticsManager.puzzleTypeForLevel(levelDef),
      duration_seconds: durationSeconds
    });
    CircuitFlowManager.cleanup();
    SignalMemoryManager.cleanup();
    WordPuzzleManager.cleanup();
    SignalOrderManager.cleanup();

    profile.stats.totalBombsFailed = (profile.stats.totalBombsFailed || 0) + 1;
    SaveManager.save(profile);
    refreshPersistentUI();

    if (el.campaignResultTitle) {
      el.campaignResultTitle.textContent = "LEVEL FAILED";
      el.campaignResultTitle.style.color = "var(--danger)";
    }
    if (el.campaignResultSubtitle) {
      el.campaignResultSubtitle.textContent = reason === "TIME'S UP!" ? "TIME EXPIRED" : (reason === "SIGNAL MISMATCH" ? "SIGNAL MISMATCH" : (reason === "WRONG WIRE" ? "WRONG WIRE CUT" : reason));
    }

    // Reset stars to inactive
    [el.resultStar1, el.resultStar2, el.resultStar3].forEach(starEl => {
      if (starEl) starEl.classList.remove("star-active");
    });

    if (el.campaignResultScore) el.campaignResultScore.textContent = "0";
    if (el.campaignResultTime) el.campaignResultTime.textContent = "FAILED";
    if (el.campaignResultCoins) el.campaignResultCoins.textContent = "+0 COINS";
    if (el.btnCampaignNextLevel) {
      el.btnCampaignNextLevel.style.display = "none";
      el.btnCampaignNextLevel.textContent = "NEXT LEVEL";
    }
    if (el.btnCampaignLevelSelect) el.btnCampaignLevelSelect.style.display = "block";
    if (el.campaignChapterSummary) el.campaignChapterSummary.style.display = "none";

    state = "CAMPAIGN_RESULT";
    showScreen("campaign-result");
  }

  return {
    renderLevelSelect,
    openLevelSelect,
    openBriefing,
    startLevel,
    completeLevel,
    failLevel
  };
})();

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
    el.popupEmail.textContent = isRegistered ? (acc.email || `${acc.provider.toUpperCase()} • ${netText}`) : "GUEST • LOCAL";
  }
  if (el.popupStatusText) {
    el.popupStatusText.textContent = netText;
  }
  if (el.popupStatusDot) {
    el.popupStatusDot.textContent = isOnline ? "●" : "○";
  }
  if (el.popupStatus) {
    el.popupStatus.style.display = isRegistered ? "flex" : "none";
  }
  if (el.menuCoins) {
    el.menuCoins.textContent = profile.coins.toLocaleString();
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
    btnPlay.textContent = "ENDLESS RUN";
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
    AccountSettingsUI.render();
    showScreen("profile");
    showToast("AVATAR UPDATED", "success");
  },
};

const GameSettingsUI = {
  render() {
    if (el.btnSettingsToggleSound) {
      const soundOn = Boolean(profile.soundEnabled);
      el.btnSettingsToggleSound.textContent = soundOn ? "ON" : "OFF";
      el.btnSettingsToggleSound.classList.toggle("on", soundOn);
      el.btnSettingsToggleSound.classList.toggle("off", !soundOn);
    }
    if (byId("btn-settings-toggle-haptics")) {
      const hapticsBtn = byId("btn-settings-toggle-haptics");
      const hapticsOn = profile.hapticsEnabled !== false;
      hapticsBtn.textContent = hapticsOn ? "ON" : "OFF";
      hapticsBtn.classList.toggle("on", hapticsOn);
      hapticsBtn.classList.toggle("off", !hapticsOn);
    }
    if (el.btnSettingsToggleMotion) {
      const prefersReduced = Boolean(profile.reducedMotion || document.body.classList.contains("reduced-motion-override"));
      el.btnSettingsToggleMotion.textContent = prefersReduced ? "ON" : "OFF";
      el.btnSettingsToggleMotion.classList.toggle("on", prefersReduced);
      el.btnSettingsToggleMotion.classList.toggle("off", !prefersReduced);
    }
  },
};

const AccountSettingsUI = {
  render() {
    const acc = profile.account;
    const avatarDef = AuthManager.getAvatarDef(acc.avatar);
    const isRegistered = Boolean(acc.mode === "registered" && acc.userId);

    if (el.settingsDisplayNameVal) el.settingsDisplayNameVal.textContent = acc.displayName || "Guest";
    if (el.settingsAvatarVal) el.settingsAvatarVal.textContent = `${avatarDef.name} (${avatarDef.icon})`;
    if (el.settingsProviderVal) {
      el.settingsProviderVal.textContent = isRegistered ? `${acc.provider.toUpperCase()}` : "Guest (Local Save)";
    }
    if (el.settingsCloudBadge) {
      el.settingsCloudBadge.textContent = isRegistered ? "CLOUD SYNC" : "LOCAL ONLY";
    }
    if (el.settingsStatusVal) el.settingsStatusVal.textContent = "Active";

    if (el.btnToggleAnalytics) {
      const active = ConsentManager.hasConsent("analytics");
      el.btnToggleAnalytics.textContent = active ? "ON" : "OFF";
      el.btnToggleAnalytics.classList.toggle("on", active);
      el.btnToggleAnalytics.classList.toggle("off", !active);
    }
    if (el.btnToggleCrashReporting) {
      const active = ConsentManager.hasConsent("crashReporting");
      el.btnToggleCrashReporting.textContent = active ? "ON" : "OFF";
      el.btnToggleCrashReporting.classList.toggle("on", active);
      el.btnToggleCrashReporting.classList.toggle("off", !active);
    }
    if (el.btnToggleAds) {
      const active = Boolean(profile.privacy?.personalizedAds);
      el.btnToggleAds.textContent = active ? "ON" : "OFF";
      el.btnToggleAds.classList.toggle("on", active);
      el.btnToggleAds.classList.toggle("off", !active);
    }
    if (el.btnLogout) {
      el.btnLogout.style.display = isRegistered ? "block" : "none";
    }
  },
};

const SettingsUI = {
  render() {
    GameSettingsUI.render();
    AccountSettingsUI.render();
  },
};

/* =========================================================
   GAME CONTROLLER & LOOP
========================================================= */
function startGame() {
  clearPendingTransitions();
  Timer.stop();
  PowerManager.cleanup();
  el.bomb?.classList.remove("word-puzzle-mode");
  AudioManager.init();
  gameMode = "NORMAL";
  run = newRun();
  run.analyticsAttemptId = AnalyticsManager.beginAttempt();
  state = "PLAYING";
  if (screens.game) {
    screens.game.style.setProperty("--danger-level", "0");
    screens.game.classList.remove("danger-warning", "danger-danger", "danger-critical");
    screens.game.classList.add("danger-safe");
  }
  if (el.dailyHudBanner) el.dailyHudBanner.style.display = "none";
  if (el.hudTimeBank) el.hudTimeBank.style.display = "none";
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
  el.bomb?.classList.remove("word-puzzle-mode");
  AudioManager.init();
  gameMode = "DAILY";

  if (!cachedDailyChallenge) {
    cachedDailyChallenge = DailyChallengeManager.generateDailyChallenge();
  }

  run = newRun();
  run.analyticsAttemptId = AnalyticsManager.beginAttempt();
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
  if (screens.game) {
    screens.game.style.setProperty("--danger-level", "0");
    screens.game.classList.remove("danger-warning", "danger-danger", "danger-critical");
    screens.game.classList.add("danger-safe");
  }
  if (el.hudTimeBank) el.hudTimeBank.style.display = "none";
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
  if (el.hudTimeBank) el.hudTimeBank.style.display = "none";

  if (gameMode === "DAILY") {
    if (!cachedDailyChallenge) {
      cachedDailyChallenge = DailyChallengeManager.generateDailyChallenge();
    }
    const stageIndex = Math.min(GameConfig.daily.bombCount - 1, Math.max(0, run.bombNumber - 1));
    const bombDef = cachedDailyChallenge[stageIndex];
    const wires = bombDef.wires.map(w => ({ ...w, cut: false }));
    run.bomb = {
      number: run.bombNumber,
      wires,
      time: bombDef.time + UpgradeManager.timeBonus(),
      challenge: bombDef.challenge,
      phases: [{ phaseIndex: 0, totalPhases: 1, ...bombDef.challenge }],
      currentPhaseIndex: 0,
      totalPhases: 1,
      event: null,
    };
    el.hudBombLabel.textContent = `BOMB ${run.bomb.number} / 7`;
    updateDailyTrackerUI();
  } else {
    const diffKey = getEndlessDifficulty(run.bombNumber);
    run.difficulty = diffKey;
    const diffCfg = EndlessDifficultyConfig[diffKey];
    run.bomb = BombFactory.create(run.bombNumber, run);
    AnalyticsManager.logGameplayEvent("bomb_generation_result", run.analyticsAttemptId, `generation-${run.bombNumber}`, {
      difficulty: diffKey === "veryHard" ? "very_hard" : diffKey,
      wire_count: run.bomb.wires.length,
      phase_count: run.bomb.totalPhases || run.bomb.phases?.length || 1,
      rule_type: run.bomb.challenge?.type
    });
    const startBank = run.timeBank || 0;
    const baseTime = getEndlessBaseTime(run.bombNumber);
    const totalStartTime = Math.max(EndlessTimerConfig.minTime, baseTime + UpgradeManager.timeBonus() + startBank);
    run.bomb.time = totalStartTime;
    run.timeBank = 0; // consumed immediately for active bomb

    el.hudBombLabel.textContent = `BOMB ${run.bomb.number}`;

    if (screens.game) {
      screens.game.classList.remove("difficulty-easy", "difficulty-normal", "difficulty-hard", "difficulty-veryhard", "difficulty-extreme");
      screens.game.classList.add(`difficulty-${diffKey.toLowerCase()}`);
    }
  }

  const variantIndex = (run.bombNumber - 1) % BombVisualVariants.length;
  const currentVariant = BombVisualVariants[variantIndex];
  if (el.bomb) {
    BombVisualVariants.forEach(v => el.bomb.classList.remove(v.className));
    Object.values(BombEventRegistry).forEach(evt => el.bomb.classList.remove(evt.className));
    el.bomb.classList.add(currentVariant.className);
    if (run.bomb.event) {
      el.bomb.classList.add(run.bomb.event.className);
    }
    const sysCodeEl = el.bomb.querySelector(".bomb-sys-code");
    if (sysCodeEl) {
      sysCodeEl.textContent = run.bomb.event ? `[${run.bomb.event.displayName}]` : currentVariant.label;
    }
  }

  el.bomb.classList.remove("exploding", "shaking", "success-pulse", "failure-pulse", "pcb-pulse-phase");
  setBombStatus("ARMING");
  
  const evtPrefix = run.bomb.event ? `[${run.bomb.event.displayName}] ` : "";
  if (run.bomb.totalPhases > 1) {
    el.instruction.textContent = `${evtPrefix}PHASE 1/${run.bomb.totalPhases} · ${run.bomb.challenge.text}`;
  } else {
    el.instruction.textContent = `${evtPrefix}${run.bomb.challenge.text}`;
  }

  renderWires(run.bomb.wires);
  AudioManager.resetTickTracker();
  PowerManager.clearScanner();
  updatePowerUI();

  if (run.bomb.event) {
    AudioManager.playEventCue(run.bomb.event.audioStyle);
  }

  later(() => { if (state === "PLAYING" && !PowerManager.isFrozen && !PowerManager.isSlowed) setBombStatus("ARMED"); }, 180);
  Timer.start(run.bomb.time, renderTimer, () => explode("TIME'S UP!"));
}

function renderWires(wires) {
  el.wiresContainer.replaceChildren();
  wires.forEach(wire => {
    const wireEl = document.createElement("button");
    wireEl.type = "button";
    wireEl.className = `wire wire-color-${wire.color}`;
    if (wire.cut) wireEl.classList.add("cut", "phase-cut");
    if (wire.hasWarningLed) wireEl.classList.add("has-warning-led");
    wireEl.dataset.index = String(wire.index);
    wireEl.style.animationDelay = `${wire.index * 0.03}s`;
    wireEl.setAttribute("aria-label", `Wire ${wire.index + 1}, ${wire.color.toUpperCase()}, position ${wire.index + 1} of ${wires.length}`);

    let signalDotsHtml = "";
    if (wire.signalNodes) {
      signalDotsHtml = `<span class="wire-signal-dots">${'<span class="wire-node-dot"></span>'.repeat(wire.signalNodes)}</span>`;
    }
    let ledHtml = "";
    if (wire.hasWarningLed) {
      ledHtml = `<span class="wire-warning-led" aria-label="Warning LED"></span>`;
    }

    wireEl.innerHTML = `
      <span class="wire-hit-area">
        ${ledHtml}
        <span class="wire-cable" style="height:${Math.round(wire.length * 100)}%">
          <span class="wire-segment wire-top"></span>
          <span class="wire-spark-burst" aria-hidden="true"></span>
          <span class="wire-segment wire-bottom"></span>
          <span class="wire-connector">
            <span class="wire-tag">${wire.index + 1}</span>
          </span>
        </span>
        ${signalDotsHtml}
      </span>
    `;
    wireEl.addEventListener("pointerdown", event => { event.preventDefault(); cutWire(wire.index, wireEl); }, { passive: false });
    wireEl.addEventListener("click", event => { if (event.detail === 0) cutWire(wire.index, wireEl); });
    el.wiresContainer.appendChild(wireEl);
  });
}

function cutWire(index, wireEl) {
  if (state !== "PLAYING" || run.inputLocked) return;
  if (wireEl.classList.contains("cut") || run.bomb.wires[index]?.cut) return;

  // Compute spatial coordinates before mutating element classes to prevent layout thrashing
  const rect = wireEl.getBoundingClientRect();
  const stage = byId("bomb-stage")?.getBoundingClientRect() || { left: 0, top: 0 };
  const x = rect.left + rect.width / 2 - stage.left;
  const y = rect.top + rect.height * 0.42 - stage.top;

  PowerManager.clearScanner();
  run.inputLocked = true;
  wireEl.classList.add("pressed", "cut");
  run.bomb.wires[index].cut = true;
  AudioManager.playWireCut();

  if (index === run.bomb.challenge.answerIndex) {
    if (run.bomb.currentPhaseIndex < run.bomb.totalPhases - 1) {
      // Intermediate Phase Complete!
      wireEl.classList.add("phase-cut", "correct-flash");
      AudioManager.playPhaseComplete();
      HapticsManager.cutSuccess();
      showFloatingText(`PHASE ${run.bomb.currentPhaseIndex + 1} CLEAR!`, "var(--accent)");

      if (el.bomb) {
        el.bomb.classList.add("pcb-pulse-phase");
        later(() => el.bomb?.classList.remove("pcb-pulse-phase"), 350);
      }

      if (run.bomb.event && run.bomb.event.id === "reconfiguration") {
        AudioManager.playReconfiguration();
      }

      run.bomb.currentPhaseIndex += 1;
      run.bomb.challenge = run.bomb.phases[run.bomb.currentPhaseIndex];

      const evtPrefix = run.bomb.event ? `[${run.bomb.event.displayName}] ` : "";
      el.instruction.textContent = `${evtPrefix}PHASE ${run.bomb.currentPhaseIndex + 1}/${run.bomb.totalPhases} · ${run.bomb.challenge.text}`;

      later(() => {
        if (state === "PLAYING") {
          run.inputLocked = false;
        }
      }, 240);
    } else {
      // Final Phase Complete -> Defuse Bomb!
      defuse(wireEl, x, y);
    }
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

  const remainingSeconds = Timer.remaining;

  if (gameMode === "CAMPAIGN") {
    const timeElapsed = Math.max(0.1, (run?.bomb?.time || 10.0) - remainingSeconds);
    const powerUsed = Boolean(run?.powerUsedOnRun);

    const ansWire = run.bomb.wires[run.bomb.challenge.answerIndex];
    const wireColor = ansWire ? (WIRE_COLOR_MAP[ansWire.color] || "#00e5ff") : "#00e5ff";
    createParticles(x, y, wireColor, 14, 74);
    createParticles(x, y, "#f8ffff", 6, 46);
    flashScreen("white");
    showFloatingText("LEVEL COMPLETE!", "var(--accent)");

    CampaignManager.completeLevel(campaignCurrentLevel || 1, {
      completed: true,
      secondsLeft: remainingSeconds,
      timeElapsed: timeElapsed,
      powerUsed: powerUsed
    });
    return;
  }

  run.streak += 1;
  run.bestStreak = Math.max(run.bestStreak, run.streak);
  run.bombsDefused += 1;
  run.totalTimeRemaining = (run.totalTimeRemaining || 0) + remainingSeconds;

  let timeBankGained = 0;
  if (gameMode === "NORMAL") {
    const diffKey = run.difficulty || getEndlessDifficulty(run.bombNumber);
    const carryoverRate = TimeBankCarryover[diffKey] !== undefined ? TimeBankCarryover[diffKey] : 1.0;
    timeBankGained = Number(Math.min(EndlessTimerConfig.maxTimeBank, remainingSeconds * carryoverRate).toFixed(2));
    run.timeBank = timeBankGained;
  }

  // Quick Defuse Bonus Check (< 35% time elapsed)
  const timeUsed = run.bomb.time - remainingSeconds;
  const isQuickDefuse = timeUsed < (run.bomb.time * 0.35);
  const quickBonus = isQuickDefuse ? 50 : 0;

  const phaseMultiplier = run.bomb.event
    ? (run.bomb.event.scoreMultiplier || 1.75)
    : (run.bomb.totalPhases === 3 ? 1.5 : (run.bomb.totalPhases === 2 ? 1.25 : 1.0));

  let points = Scoring.award(run.bomb.challenge.type, remainingSeconds, run.streak, run.difficulty, phaseMultiplier);
  if (isQuickDefuse) {
    points += quickBonus;
  }
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
  if (isQuickDefuse) {
    later(() => showFloatingText("QUICK DEFUSE! +50", "#00e5ff"), 180);
  }
  if (timeBankGained > 0) {
    showTimeBankFeedback(timeBankGained);
  }
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
  } else if (gameMode === "CAMPAIGN") {
    later(() => CampaignManager.failLevel(campaignCurrentLevel || 1, reason), 820);
  } else {
    later(() => endGame(reason), 820);
  }
}

function endGame(reason) {
  const prevBest = profile.bestScore;
  profile.bestScore = Math.max(profile.bestScore, run.score);
  profile.bestStreak = Math.max(profile.bestStreak, run.bestStreak);
  const isNewRecord = run.score > prevBest && prevBest > 0;
  
  const { recordText } = PersonalBestsManager.checkNormalRun(run);

  SaveManager.save(profile);
  refreshPersistentUI();
  el.resultTitle.textContent = `💥 ${reason}`;
  el.resultMessage.textContent = isNewRecord ? "🌟 NEW BEST SCORE ACHIEVED!" : (run.bombsDefused ? "GREAT RUN! DEFUSE SMARTER NEXT TIME!" : "CUT SMARTER NEXT TIME!");
  el.resultScore.textContent = run.score.toLocaleString();
  el.resultBest.textContent = profile.bestScore.toLocaleString();
  el.resultBombs.textContent = String(run.bombsDefused);
  el.resultStreak.textContent = String(run.bestStreak);
  el.resultCoinsEarned.textContent = `+${run.coinsEarned}`;
  if (el.resultCurrentCoins) el.resultCurrentCoins.textContent = profile.coins.toLocaleString();
  
  if (el.resultDifficulty) {
    const diffCfg = EndlessDifficultyConfig[run.difficulty || "easy"];
    el.resultDifficulty.textContent = diffCfg ? diffCfg.label : "EASY";
  }

  // Dynamic comparison message
  if (el.resultComparisonText) {
    if (isNewRecord) {
      el.resultComparisonText.textContent = `🌟 NEW ALL-TIME BEST! (+${run.score.toLocaleString()} PTS)`;
    } else if (run.score > profile.bestScore * 0.8 && profile.bestScore > 0) {
      const pct = Math.round((run.score / profile.bestScore) * 100);
      el.resultComparisonText.textContent = `🔥 SO CLOSE! ${pct}% OF YOUR ALL-TIME BEST!`;
    } else {
      const diffCfg = EndlessDifficultyConfig[run.difficulty || "easy"];
      el.resultComparisonText.textContent = `🏆 SURVIVED ${run.bombsDefused} BOMBS · REACHED ${diffCfg?.label || "EASY"} · LIFETIME BEST: ${profile.bestScore.toLocaleString()} PTS`;
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

function renderTimer(remaining, duration) {
  const total = duration || Timer.duration || run?.bomb?.time || 10.0;
  const formatted = remaining.toFixed(1);
  if (formatted !== lastRenderedTimerSec) {
    el.timerValue.textContent = formatted;
    lastRenderedTimerSec = formatted;
  }
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  el.timerBarFill.style.transform = `scaleX(${ratio})`;

  // Unified Danger Calculation: Safe (70-100%), Warning (40-70%), Danger (15-40%), Critical (0-15%)
  const pct = total > 0 ? (remaining / total) : 0;
  let alertState = "safe";
  let dangerVal = 0.0;
  let defaultStatus = "ARMED";

  if (pct <= 0.15 || remaining <= 1.5) {
    alertState = "critical";
    dangerVal = 1.0;
    defaultStatus = "CRITICAL";
  } else if (pct <= 0.40 || remaining <= 3.0) {
    alertState = "danger";
    dangerVal = 0.70;
    defaultStatus = "DANGER";
  } else if (pct <= 0.70 || remaining <= 5.0) {
    alertState = "warning";
    dangerVal = 0.35;
    defaultStatus = "WARNING";
  } else {
    alertState = "safe";
    dangerVal = 0.0;
    defaultStatus = "ARMED";
  }

  // Update dynamic CSS custom properties on game screen for atmospheric reactivity
  const phaseBonus = (run?.bomb?.currentPhaseIndex || 0) * 0.04;
  const eventBonus = run?.bomb?.event ? 0.08 : 0;
  const tension = calculateTension(remaining, total, run?.difficulty || "easy", run?.streak || 0, run?.bombNumber || 1, phaseBonus, eventBonus);
  if (screens.game) {
    screens.game.style.setProperty("--danger-level", String(dangerVal));
    screens.game.style.setProperty("--tension-level", String(tension));
  }

  if (alertState !== lastTimerAlertState) {
    lastTimerAlertState = alertState;
    const isSafe = alertState === "safe";
    const isWarning = alertState === "warning";
    const isDanger = alertState === "danger";
    const isCritical = alertState === "critical";

    if (screens.game) {
      screens.game.classList.toggle("danger-safe", isSafe);
      screens.game.classList.toggle("danger-warning", isWarning);
      screens.game.classList.toggle("danger-danger", isDanger);
      screens.game.classList.toggle("danger-critical", isCritical);
    }

    if (el.timerWrap) {
      el.timerWrap.classList.toggle("safe", isSafe);
      el.timerWrap.classList.toggle("warning", isWarning);
      el.timerWrap.classList.toggle("danger", isDanger);
      el.timerWrap.classList.toggle("critical", isCritical);
    }
    if (el.timerValue) {
      el.timerValue.classList.toggle("urgent", isDanger);
      el.timerValue.classList.toggle("critical", isCritical);
    }
    if (el.timerBarFill) {
      el.timerBarFill.classList.toggle("warn", isWarning);
      el.timerBarFill.classList.toggle("danger", isDanger || isCritical);
      el.timerBarFill.classList.toggle("critical", isCritical);
    }

    if (state === "PLAYING" && !PowerManager.isFrozen && !PowerManager.isSlowed && !PowerManager.hasActiveSecondChance()) {
      setBombStatus(defaultStatus);
    }
  }

  if (remaining <= 5.0 && !PowerManager.isFrozen) {
    AudioManager.playTimerTick(remaining, run?.difficulty || "easy", tension);
  }
}

function updateHud() {
  if (el.hudScore) el.hudScore.textContent = run.score.toLocaleString();
  const currentBest = gameMode === "DAILY" ? profile.bestDailyScore : profile.bestScore;
  if (el.hudBest) el.hudBest.textContent = Math.max(currentBest || 0, run.score).toLocaleString();
  const bestLabel = byId("hud-best-label");
  if (bestLabel) bestLabel.textContent = gameMode === "DAILY" ? "DAILY BEST" : "BEST";
  if (el.hudStreak) el.hudStreak.textContent = `🔥 ${run.streak}`;
  if (el.hudCoins) el.hudCoins.textContent = profile.coins.toLocaleString();
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
    const def = PowerDefinitions[id];
    if (badge) badge.textContent = String(count);
    if (btn) {
      btn.disabled = !isPlaying || count <= 0;
      btn.classList.toggle("is-disabled", !isPlaying || count <= 0);
      const isChanceActive = id === "secondChance" && PowerManager.hasActiveSecondChance();
      const isFreezeActive = id === "timeFreeze" && PowerManager.isFrozen;
      const isSlowActive = id === "timeSlow" && PowerManager.isSlowed;
      btn.classList.toggle("is-active", isChanceActive || isFreezeActive || isSlowActive);

      const countLabel = count > 0 ? `${count} available` : "0 (Depleted)";
      if (def) {
        btn.setAttribute("aria-label", `${def.name}: ${def.effect} · ${countLabel}`);
        btn.setAttribute("title", `${def.name} [${count}] · ${def.effect}`);
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
  if (el.menuCoins) el.menuCoins.textContent = profile.coins.toLocaleString();
  el.shopCoins.textContent = profile.coins.toLocaleString();
  if (run && el.hudCoins) el.hudCoins.textContent = profile.coins.toLocaleString();
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

let timeBankFeedbackTimeout = null;
function showTimeBankFeedback(seconds) {
  if (el.hudTimeBank) {
    if (timeBankFeedbackTimeout) {
      clearTimeout(timeBankFeedbackTimeout);
      timeBankFeedbackTimeout = null;
    }
    el.hudTimeBank.textContent = `+${seconds.toFixed(1)}s`;
    el.hudTimeBank.style.display = "inline-flex";
    timeBankFeedbackTimeout = setTimeout(() => {
      if (el.hudTimeBank) {
        el.hudTimeBank.style.display = "none";
      }
      timeBankFeedbackTimeout = null;
    }, 1400);
  }
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
  if (screens.game) {
    screens.game.style.setProperty("--danger-level", "0");
    screens.game.classList.remove("danger-warning", "danger-danger", "danger-critical");
    screens.game.classList.add("danger-safe");
  }
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

function showEndlessBriefing() {
  showScreen("endless-briefing");
}

byId("btn-play").addEventListener("click", () => {
  showEndlessBriefing();
});

if (byId("btn-start-endless-run")) {
  byId("btn-start-endless-run").addEventListener("click", () => {
    startGame();
  });
}

if (byId("btn-close-endless-briefing")) {
  byId("btn-close-endless-briefing").addEventListener("click", () => {
    returnToMenu();
  });
}

if (byId("btn-tutorial-next")) byId("btn-tutorial-next").addEventListener("click", () => TutorialManager.next());
if (byId("btn-tutorial-skip")) byId("btn-tutorial-skip").addEventListener("click", () => TutorialManager.complete());

if (byId("btn-daily-play")) byId("btn-daily-play").addEventListener("click", startDailyChallenge);
if (byId("btn-daily-play-normal")) byId("btn-daily-play-normal").addEventListener("click", startGame);
if (byId("btn-daily-menu")) byId("btn-daily-menu").addEventListener("click", returnToMenu);

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

if (byId("btn-back-shop")) byId("btn-back-shop").addEventListener("click", returnToMenu);
let resetInProgress = false;
byId("btn-reset-progress").addEventListener("click", () => {
  if (resetInProgress) return;
  byId("btn-confirm-reset").disabled = false;
  showScreen("reset");
});

byId("btn-confirm-reset").addEventListener("click", () => {
  if (resetInProgress) return;
  resetInProgress = true;
  byId("btn-confirm-reset").disabled = true;
  clearPendingTransitions();
  Timer.stop();
  PowerManager.cleanup();
  AchievementToastManager.reset();
  profile = SaveManager.reset();
  AnalyticsManager.refreshConsent();
  SentryCrashReportingManager.refreshConsent();
  void NativeCrashlyticsConsentManager.refreshConsent();
  AudioManager.setSoundEnabled(profile.soundEnabled);
  run = null;
  cachedDailyChallenge = null;
  refreshPersistentUI();
  ShopUI.render();
  returnToMenu();
  showToast("ALL PROGRESS RESET", "danger");
  later(() => { resetInProgress = false; }, 300);
});

byId("btn-cancel-reset").addEventListener("click", () => showScreen("settings"));
byId("btn-pause").addEventListener("click", pauseGame);
byId("btn-resume").addEventListener("click", resumeGame);
byId("btn-restart-pause").addEventListener("click", () => {
  if (gameMode === "DAILY") startDailyChallenge();
  else if (gameMode === "CAMPAIGN") CampaignManager.startLevel(campaignCurrentLevel || 1);
  else startGame();
});
byId("btn-menu-pause").addEventListener("click", returnToMenu);
byId("btn-play-again").addEventListener("click", startGame);
byId("btn-menu-result").addEventListener("click", returnToMenu);

// Campaign event listeners
if (byId("btn-campaign")) {
  byId("btn-campaign").addEventListener("click", () => {
    CampaignManager.openLevelSelect();
  });
}

if (byId("btn-back-campaign-select")) {
  byId("btn-back-campaign-select").addEventListener("click", () => {
    returnToMenu();
  });
}

if (byId("btn-play-level-1")) {
  byId("btn-play-level-1").addEventListener("click", () => {
    CampaignManager.openBriefing(1);
  });
}

if (byId("btn-play-level-2")) {
  byId("btn-play-level-2").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(2)) {
      CampaignManager.openBriefing(2);
    }
  });
}

if (byId("btn-play-level-3")) {
  byId("btn-play-level-3").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(3)) {
      CampaignManager.openBriefing(3);
    }
  });
}

if (byId("btn-play-level-4")) {
  byId("btn-play-level-4").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(4)) {
      CampaignManager.openBriefing(4);
    }
  });
}

if (byId("btn-play-level-5")) {
  byId("btn-play-level-5").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(5)) {
      CampaignManager.openBriefing(5);
    }
  });
}

if (byId("btn-play-level-6")) {
  byId("btn-play-level-6").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(6)) {
      CampaignManager.openBriefing(6);
    }
  });
}

if (byId("btn-play-level-7")) {
  byId("btn-play-level-7").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(7)) {
      CampaignManager.openBriefing(7);
    }
  });
}

if (byId("btn-play-level-8")) {
  byId("btn-play-level-8").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(8)) {
      CampaignManager.openBriefing(8);
    }
  });
}

if (byId("btn-play-level-9")) {
  byId("btn-play-level-9").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(9)) {
      CampaignManager.openBriefing(9);
    }
  });
}

if (byId("btn-play-level-10")) {
  byId("btn-play-level-10").addEventListener("click", () => {
    if (profile.campaign?.unlockedLevels?.includes(10)) {
      CampaignManager.openBriefing(10);
    }
  });
}

if (byId("btn-close-campaign-briefing")) {
  byId("btn-close-campaign-briefing").addEventListener("click", () => {
    CampaignManager.openLevelSelect();
  });
}

if (byId("btn-start-campaign-level")) {
  byId("btn-start-campaign-level").addEventListener("click", () => {
    CampaignManager.startLevel(campaignCurrentLevel || 1);
  });
}

if (byId("btn-campaign-next-level")) {
  byId("btn-campaign-next-level").addEventListener("click", async () => {
    const nextLevel = (campaignCurrentLevel || 1) + 1;
    if (CampaignConfig.levels[nextLevel] && profile.campaign?.unlockedLevels?.includes(nextLevel)) {
      await window.BombDefuseAdMobService?.showInterstitialAtTransition();
      CampaignManager.openBriefing(nextLevel);
    } else {
      CampaignManager.openLevelSelect();
    }
  });
}

if (byId("btn-campaign-replay")) {
  byId("btn-campaign-replay").addEventListener("click", () => {
    CampaignManager.startLevel(campaignCurrentLevel || 1);
  });
}

if (byId("btn-campaign-level-select")) {
  byId("btn-campaign-level-select").addEventListener("click", () => {
    CampaignManager.openLevelSelect();
  });
}

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
  window.BombDefuseAdMobService?.onVisibilityChanged(!document.hidden);
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
        AccountSettingsUI.render();
        showScreen("account-settings");
        break;
      case "account-settings":
        ProfileUI.render();
        showScreen("profile");
        break;
      case "settings":
        returnToMenu();
        break;
      case "register":
      case "forgot-password":
        showScreen("login");
        break;
      case "campaign-briefing":
        CampaignManager.openLevelSelect();
        break;
      case "campaign-select":
      case "campaign-result":
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
if (byId("btn-back-stats")) {
  byId("btn-back-stats").addEventListener("click", returnToMenu);
}

if (byId("btn-daily-goals")) {
  byId("btn-daily-goals").addEventListener("click", () => {
    DailyGoalsManager.render();
    showScreen("daily-goals");
  });
}
if (byId("btn-shop")) {
  byId("btn-shop").addEventListener("click", () => {
    ShopUI.render();
    showScreen("shop");
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
let lastScreenBeforeSettings = "menu";

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

if (el.btnPopupProfile) {
  el.btnPopupProfile.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPopup();
    ProfileUI.render();
    showScreen("profile");
  });
}

if (el.btnPopupStats) {
  el.btnPopupStats.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPopup();
    StatsManager.renderStats();
    showScreen("stats");
  });
}

if (el.btnPopupAchievements) {
  el.btnPopupAchievements.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPopup();
    AchievementUI.render();
    showScreen("achievements");
  });
}

if (el.btnPopupSettings) {
  el.btnPopupSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPopup();
    lastScreenBeforeSettings = "menu";
    SettingsUI.render();
    showScreen("settings");
  });
}

if (el.btnPopupGuestSettings) {
  el.btnPopupGuestSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPopup();
    lastScreenBeforeSettings = "menu";
    SettingsUI.render();
    showScreen("settings");
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
    AccountSettingsUI.render();
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
        AccountSettingsUI.render();
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
    const current = ConsentManager.hasConsent("analytics");
    ConsentManager.setConsent("analytics", !current);
    AccountSettingsUI.render();
    showToast(`ANALYTICS ${!current ? "ENABLED" : "DISABLED"}`, "neutral");
  });
}

if (byId("btn-toggle-crash-reporting")) {
  byId("btn-toggle-crash-reporting").addEventListener("click", async () => {
    const current = ConsentManager.hasConsent("crashReporting");
    await ConsentManager.setConsent("crashReporting", !current);
    AccountSettingsUI.render();
    showToast(`CRASH DIAGNOSTICS CONSENT ${!current ? "ENABLED" : "DISABLED"}`, "neutral");
  });
}

if (byId("btn-toggle-ads")) {
  byId("btn-toggle-ads").addEventListener("click", () => {
    const current = Boolean(profile.privacy?.personalizedAds);
    ConsentManager.setConsent("personalizedAds", !current);
    AccountSettingsUI.render();
    showToast(`PERSONALIZED ADS ${!current ? "ENABLED" : "DISABLED"}`, "neutral");
  });
}

if (byId("btn-manage-ad-privacy")) {
  byId("btn-manage-ad-privacy").addEventListener("click", async () => {
    const available = await window.BombDefuseAdMobService?.showPrivacyOptions();
    if (!available) showToast("AD PRIVACY OPTIONS ARE NOT AVAILABLE RIGHT NOW", "neutral");
  });
}

if (byId("btn-settings-toggle-sound")) {
  byId("btn-settings-toggle-sound").addEventListener("click", () => {
    toggleSound();
    GameSettingsUI.render();
  });
}

if (byId("btn-settings-toggle-haptics")) {
  byId("btn-settings-toggle-haptics").addEventListener("click", () => {
    profile.hapticsEnabled = !(profile.hapticsEnabled !== false);
    SaveManager.save(profile);
    GameSettingsUI.render();
    showToast(`HAPTICS ${profile.hapticsEnabled ? "ENABLED" : "DISABLED"}`, "neutral");
  });
}

if (byId("btn-settings-toggle-motion")) {
  byId("btn-settings-toggle-motion").addEventListener("click", () => {
    const body = document.body;
    const isReduced = body.classList.toggle("reduced-motion-override");
    profile.reducedMotion = isReduced;
    SaveManager.save(profile);
    GameSettingsUI.render();
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
  byId("btn-confirm-delete-account").addEventListener("click", async () => {
    if (el.btnConfirmDeleteAccount?.disabled) return;
    if (el.btnConfirmDeleteAccount) el.btnConfirmDeleteAccount.disabled = true;
    if (el.btnCancelDeleteAccount) el.btnCancelDeleteAccount.disabled = true;
    try {
      const result = await AuthManager.deleteAccount();
      if (!result?.success) {
        showToast(result?.message || "Account deletion did not complete. Your local data was kept; retry or contact support.", "danger", 6500);
      }
    } catch {
      showToast("Account deletion did not complete. Your local data was kept when possible; retry or contact support.", "danger", 6500);
    } finally {
      if (screens["delete-account"]?.classList.contains("active")) {
        if (el.btnConfirmDeleteAccount) {
          el.btnConfirmDeleteAccount.disabled = el.inputDeleteConfirm?.value.trim() !== "DELETE";
        }
        if (el.btnCancelDeleteAccount) el.btnCancelDeleteAccount.disabled = false;
      }
    }
  });
}

if (byId("btn-cancel-delete-account")) {
  byId("btn-cancel-delete-account").addEventListener("click", () => {
    showScreen("account-settings");
  });
}

if (byId("btn-back-settings")) {
  byId("btn-back-settings").addEventListener("click", () => {
    returnToMenu();
  });
}

if (byId("btn-back-account-settings")) {
  byId("btn-back-account-settings").addEventListener("click", () => {
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

if (profile.reducedMotion) {
  document.body.classList.add("reduced-motion-override");
}

AuthManager.initialize();
CloudSaveManager.initialize();
AnalyticsManager.initialize();
SentryCrashReportingManager.initialize();
void NativeCrashlyticsConsentManager.initialize();
AudioManager.setSoundEnabled(profile.soundEnabled);
refreshPersistentUI();
updateMenuAccountBadge();
DailyGoalsManager.updateBadge();
showScreen("menu");
void window.BombDefuseAdMobService?.initializeAtLaunch();
LoginRewardManager.checkAndShowOnMenu();




