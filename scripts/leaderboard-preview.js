(function attachBombDefuseLeaderboardPreview(root) {
  "use strict";

  const METRIC_CONFIG = Object.freeze({
    score: Object.freeze({ label: "BEST SCORE", base: 125000, step: 1750 }),
    streak: Object.freeze({ label: "BEST STREAK", base: 80, step: 1 }),
  });

  function createMockRows(metric) {
    const config = METRIC_CONFIG[metric];
    if (!config) return [];
    return Array.from({ length: 50 }, (_, index) => ({
      publicEntryId: `preview-${metric}-${String(index + 1).padStart(3, "0")}`,
      rank: index + 1,
      displayName: `SIM SIGNAL ${String(index + 1).padStart(2, "0")}`,
      metric: Math.max(1, config.base - index * config.step),
    }));
  }

  function getLocalPreviewRank(metric, value) {
    if (!METRIC_CONFIG[metric] || !Number.isSafeInteger(value) || value <= 0) return null;
    return createMockRows(metric).filter(entry => entry.metric > value).length + 1;
  }

  // Client-side UX validation only. A trusted backend must repeat every check.
  function prepareSubmissionIntent({ authenticated, optedIn, displayName, bestScore, bestStreak } = {}) {
    if (authenticated !== true || optedIn !== true || typeof displayName !== "string") return null;
    const publicName = displayName.trim();
    if (Array.from(publicName).length < 3 || Array.from(publicName).length > 20 ||
        /[@<>\u0000-\u001f\u007f]/.test(publicName) || /\S+@\S+\.\S+/.test(publicName) ||
        !Number.isSafeInteger(bestScore) || bestScore < 0 ||
        !Number.isSafeInteger(bestStreak) || bestStreak < 0) return null;
    return Object.freeze({ publicName, bestScore, bestStreak });
  }

  root.BombDefuseLeaderboardPreview = Object.freeze({
    createMockRows,
    getLocalPreviewRank,
    prepareSubmissionIntent,
  });
})(typeof window !== "undefined" ? window : globalThis);
