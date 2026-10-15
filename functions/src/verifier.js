import { LeaderboardError } from "./leaderboard-domain.js";

export const ENDLESS_TRANSCRIPT_PROTOCOL_ACTIVE = true;
export const MAX_RANKED_BOMBS = 100;
export const RANKED_BOMB_SECONDS = 30;

const WIRE_COLORS = Object.freeze(["red", "blue", "yellow", "green", "white", "black", "purple"]);

function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new LeaderboardError("invalid-argument", `${label} is invalid.`);
  }
  return value;
}

export function validateRankedWireActionShape(action) {
  if (!action || typeof action !== "object" || Array.isArray(action) ||
      Object.keys(action).sort().join(",") !== "challengeId,runId,sequence,wireIndex" ||
      typeof action.runId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(action.runId) ||
      typeof action.challengeId !== "string" || action.challengeId.length < 3 || action.challengeId.length > 80 ||
      !Number.isSafeInteger(action.sequence) || action.sequence < 0 ||
      !Number.isSafeInteger(action.wireIndex) || action.wireIndex < -1 || action.wireIndex > 6) {
    throw new LeaderboardError("invalid-argument", "The ranked wire action is invalid.");
  }
  return action;
}

export function createRankedChallenge({ bombNumber, sequence, nowMs, randomInt, newId }) {
  integer(bombNumber, "Bomb number", 1, MAX_RANKED_BOMBS);
  integer(sequence, "Challenge sequence", 0, MAX_RANKED_BOMBS - 1);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || typeof randomInt !== "function" || typeof newId !== "function") {
    throw new TypeError("Challenge generation dependencies are invalid.");
  }

  const wireCount = Math.min(7, 3 + Math.floor((bombNumber - 1) / 5));
  const colors = [...WIRE_COLORS];
  for (let index = colors.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [colors[index], colors[swapIndex]] = [colors[swapIndex], colors[index]];
  }
  const lengths = Array.from({ length: wireCount }, (_, index) => Number((0.58 + index * 0.055).toFixed(3)));
  for (let index = lengths.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [lengths[index], lengths[swapIndex]] = [lengths[swapIndex], lengths[index]];
  }
  const wires = colors.slice(0, wireCount).map((color, index) => ({
    index,
    color,
    length: lengths[index],
    signalNodes: 1 + ((index + bombNumber) % 3),
    hasWarningLed: false,
  }));
  const ruleType = ["color", "longest", "shortest", "position"][randomInt(0, 3)];
  const answerIndex = ruleType === "color" ? randomInt(0, wireCount - 1)
    : ruleType === "longest" ? wires.reduce((best, wire) => wire.length > wires[best].length ? wire.index : best, 0)
    : ruleType === "shortest" ? wires.reduce((best, wire) => wire.length < wires[best].length ? wire.index : best, 0)
    : randomInt(0, wireCount - 1);
  const instruction = ruleType === "color" ? `CUT THE ${wires[answerIndex].color.toUpperCase()} WIRE`
    : ruleType === "longest" ? "CUT THE LONGEST WIRE"
    : ruleType === "shortest" ? "CUT THE SHORTEST WIRE"
    : `CUT WIRE ${answerIndex + 1}`;
  return {
    sequence,
    challengeId: newId(),
    bombNumber,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + RANKED_BOMB_SECONDS * 1000,
    answerIndex,
    wires,
    instruction,
    timeLimitSeconds: RANKED_BOMB_SECONDS,
    difficulty: bombNumber < 6 ? "easy" : bombNumber < 16 ? "normal" : bombNumber < 31 ? "hard" : "veryHard",
  };
}

export function publicRankedChallenge(challenge) {
  if (!challenge) return null;
  return {
    sequence: challenge.sequence,
    challengeId: challenge.challengeId,
    bombNumber: challenge.bombNumber,
    wires: challenge.wires.map(wire => ({ ...wire })),
    instruction: challenge.instruction,
    timeLimitSeconds: challenge.timeLimitSeconds,
    difficulty: challenge.difficulty,
  };
}

export function verifyRankedWireAction({ run, action, nowMs, randomInt, newId }) {
  if (!run || run.status !== "active" || !run.currentChallenge) {
    throw new LeaderboardError("failed-precondition", "This ranked run is no longer active.");
  }
  validateRankedWireActionShape(action);
  if (action.runId !== run.runId || action.sequence !== run.sequence ||
      action.challengeId !== run.currentChallenge.challengeId) {
    throw new LeaderboardError("failed-precondition", "This challenge is stale or out of order.");
  }
  const challenge = run.currentChallenge;
  if (nowMs >= challenge.expiresAtMs || nowMs >= run.expiresAtMs) {
    return { accepted: true, correct: false, terminal: true, reason: "TIME_EXPIRED", score: run.score, streak: run.streak, bestStreak: run.bestStreak, bombsDefused: run.bombsDefused };
  }
  const wireIndex = integer(action.wireIndex, "Wire index", -1, challenge.wires.length - 1);
  // A client may voluntarily forfeit at any time. This only ends that run; it
  // never grants a bomb, score, or timer-based bonus.
  if (wireIndex === -1) {
    return { accepted: true, correct: false, terminal: true, reason: "RUN_FORFEITED", score: run.score, streak: run.streak, bestStreak: run.bestStreak, bombsDefused: run.bombsDefused };
  }
  if (wireIndex >= challenge.wires.length) throw new LeaderboardError("invalid-argument", "Wire index is invalid.");
  if (wireIndex !== challenge.answerIndex) {
    return { accepted: true, correct: false, terminal: true, reason: "WRONG_WIRE", score: run.score, streak: run.streak, bestStreak: run.bestStreak, bombsDefused: run.bombsDefused };
  }

  const bombsDefused = run.bombsDefused + 1;
  const streak = run.streak + 1;
  const bestStreak = Math.max(run.bestStreak, streak);
  // Ranked scoring is intentionally deterministic and server-owned; client timer,
  // upgrades, coins, power effects, and reported elapsed time have no influence.
  const points = 100 + Math.min(990, (bombsDefused - 1) * 10) + Math.min(500, streak * 5);
  const score = run.score + points;
  const terminal = bombsDefused >= MAX_RANKED_BOMBS;
  const nextSequence = run.sequence + 1;
  const nextChallenge = terminal ? null : createRankedChallenge({
    bombNumber: bombsDefused + 1,
    sequence: nextSequence,
    nowMs,
    randomInt,
    newId,
  });
  return { accepted: true, correct: true, terminal, points, score, streak, bestStreak, bombsDefused, nextSequence, nextChallenge };
}

export function verifiedRunMetrics(run) {
  if (!run || !["active", "failed", "completed", "abandoned", "expired"].includes(run.status)) {
    throw new LeaderboardError("failed-precondition", "The ranked run state is invalid.");
  }
  integer(run.score, "Score", 0, 100_000_000);
  integer(run.bestStreak, "Streak", 0, 100_000);
  integer(run.bombsDefused, "Bomb count", 0, MAX_RANKED_BOMBS);
  return { score: run.score, streak: run.bestStreak, bombsDefused: run.bombsDefused };
}
