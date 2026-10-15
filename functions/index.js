import { getApps, initializeApp } from "firebase-admin/app";
import { randomInt, randomUUID } from "node:crypto";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { LeaderboardError } from "./src/leaderboard-domain.js";
import { createLeaderboardService } from "./src/leaderboard-service.js";

if (getApps().length === 0) initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 5, timeoutSeconds: 20 });

const db = getFirestore();
const service = createLeaderboardService({
  db,
  timestampFromMillis: millis => Timestamp.fromMillis(millis),
  serverTimestamp: () => FieldValue.serverTimestamp(),
  now: Date.now,
  newId: randomUUID,
  randomInt: (min, max) => randomInt(min, max + 1),
});

// The Functions emulator is explicitly isolated from deployed enforcement. Deployed
// callables always enforce App Check; production App Check providers remain a Console
// and client-platform setup prerequisite.
const callableOptions = Object.freeze({ enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" });

function uidFromRequest(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to use this leaderboard action.");
  return request.auth.uid;
}

function asCallableError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof LeaderboardError) return new HttpsError(error.code, error.message);
  logger.error("Leaderboard callable failed", { code: typeof error?.code === "string" ? error.code : "INTERNAL" });
  return new HttpsError("internal", "The leaderboard request could not be completed.");
}

function callable(handler) {
  return onCall(callableOptions, async request => {
    try { return await handler(request); }
    catch (error) { throw asCallableError(error); }
  });
}

export const getBestScoreLeaderboard = callable(() => service.getTop("score"));
export const getBestStreakLeaderboard = callable(() => service.getTop("streak"));
export const getMyEndlessLeaderboardRank = callable(request => service.getMyRank(uidFromRequest(request)));
export const beginEndlessLeaderboardRun = callable(request => service.beginRun(uidFromRequest(request)));
export const submitEndlessLeaderboardAction = callable(request => service.submitWireAction(uidFromRequest(request), request.data));
export const finishEndlessLeaderboardRun = callable(request => service.finishRun(uidFromRequest(request), request.data));
export const withdrawEndlessLeaderboard = callable(request => service.withdraw(uidFromRequest(request)));
