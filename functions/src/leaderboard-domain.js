export const LEADERBOARD_LIMIT = 50;
export const SCORE_MAX = 100_000_000;
export const STREAK_MAX = 100_000;
export const RATE_WINDOW_MS = 15 * 60 * 1000;
export const RATE_WINDOW_MAX = 5;

export class LeaderboardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LeaderboardError";
    this.code = code;
  }
}

const objectRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

export function requireAuthenticatedUid(uid) {
  if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) {
    throw new LeaderboardError("unauthenticated", "Sign in to use this leaderboard action.");
  }
  return uid;
}

export function hasExplicitPublicOptIn(profile) {
  return profile?.privacy?.publicLeaderboard === true && profile?.consent?.publicLeaderboard === true;
}

export function sanitizePublicDisplayName(value) {
  if (typeof value !== "string" || /\p{Cc}/u.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  const length = Array.from(normalized).length;
  if (length < 3 || length > 20 || normalized.includes("@") ||
      /[^\p{L}\p{N} ._-]/u.test(normalized)) return null;
  return normalized;
}

export function validateRunSubmission(payload) {
  if (!objectRecord(payload) || Object.keys(payload).sort().join(",") !== "runId,transcript") {
    throw new LeaderboardError("invalid-argument", "A run ID and verification transcript are required; raw metrics are not accepted.");
  }
  if (typeof payload.runId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.runId)) {
    throw new LeaderboardError("invalid-argument", "The run ID is invalid.");
  }
  const transcript = payload.transcript;
  if (!objectRecord(transcript) || transcript.version !== 1 || !Array.isArray(transcript.events) ||
      transcript.events.length < 1 || transcript.events.length > 3000) {
    throw new LeaderboardError("invalid-argument", "The run transcript format is invalid.");
  }
  const allowedTypes = new Set(["bomb_start", "wire_cut", "bomb_defused", "bomb_failed", "power_used"]);
  const allowedKeys = new Set(["type", "bombNumber", "phaseIndex", "wireIndex", "remainingMs", "powerId"]);
  for (const event of transcript.events) {
    if (!objectRecord(event) || Object.keys(event).some(key => !allowedKeys.has(key)) || !allowedTypes.has(event.type)) {
      throw new LeaderboardError("invalid-argument", "The run transcript contains unsupported fields.");
    }
    for (const field of ["bombNumber", "phaseIndex", "wireIndex", "remainingMs"]) {
      if (field in event && (!Number.isSafeInteger(event[field]) || event[field] < 0)) {
        throw new LeaderboardError("invalid-argument", "The run transcript contains an invalid numeric value.");
      }
    }
    if ("powerId" in event && !["scanner", "timeSlow", "timeFreeze", "secondChance"].includes(event.powerId)) {
      throw new LeaderboardError("invalid-argument", "The run transcript contains an unsupported power.");
    }
  }
  if (Buffer.byteLength(JSON.stringify(transcript), "utf8") > 256 * 1024) {
    throw new LeaderboardError("invalid-argument", "The run transcript is too large.");
  }
  return { runId: payload.runId, transcript };
}

export function validateVerifiedMetrics(metrics) {
  if (!objectRecord(metrics) || !Number.isSafeInteger(metrics.score) || metrics.score < 0 || metrics.score > SCORE_MAX ||
      !Number.isSafeInteger(metrics.streak) || metrics.streak < 0 || metrics.streak > STREAK_MAX) {
    throw new LeaderboardError("failed-precondition", "The server verifier returned out-of-range metrics.");
  }
  return { score: metrics.score, streak: metrics.streak };
}

export function rateLimitDecision(existing, nowMs, maxCount = RATE_WINDOW_MAX, windowMs = RATE_WINDOW_MS) {
  const start = Number.isSafeInteger(existing?.windowStartedAt) ? existing.windowStartedAt : 0;
  const count = Number.isSafeInteger(existing?.count) ? existing.count : 0;
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return { allowed: false, state: existing || null };
  if (!start || nowMs - start >= windowMs || nowMs < start) {
    return { allowed: true, state: { windowStartedAt: nowMs, count: 1 } };
  }
  if (count >= maxCount) return { allowed: false, state: { windowStartedAt: start, count } };
  return { allowed: true, state: { windowStartedAt: start, count: count + 1 } };
}

export function isRunSubmissionDuplicate(submissionSnapshot) {
  return submissionSnapshot?.exists === true;
}

export function rankEntries(entries, metric) {
  if (!new Set(["score", "streak"]).has(metric)) {
    throw new LeaderboardError("invalid-argument", "Unknown leaderboard metric.");
  }
  return [...entries]
    .filter(entry => Number.isSafeInteger(entry?.metric) && typeof entry?.publicEntryId === "string")
    .sort((a, b) => b.metric - a.metric || a.publicEntryId.localeCompare(b.publicEntryId))
    .map((entry, index) => ({
      rank: index + 1,
      publicEntryId: entry.publicEntryId,
      displayName: sanitizePublicDisplayName(entry.displayName) || "DEFUSER",
      metric: entry.metric,
    }));
}

export function publicEntryPayload({ publicEntryId, displayName, metric, updatedAt }) {
  const safeName = sanitizePublicDisplayName(displayName);
  if (typeof publicEntryId !== "string" || !safeName || !Number.isSafeInteger(metric) || metric < 0) {
    throw new LeaderboardError("failed-precondition", "Cannot publish an invalid leaderboard entry.");
  }
  return { publicEntryId, displayName: safeName, metric, updatedAt };
}
