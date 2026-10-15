# Endless Run leaderboard verification design

## Current status

Ordinary Endless Run remains client-authoritative and unchanged. A separate opt-in/config-gated ranked mode now uses a server-owned state machine: server callables generate each challenge, validate one chosen wire per bomb, and calculate metrics. Ranked mode is power-free and uses a deliberately defined server scoring curve; it does not use the ordinary Endless local timer/upgrade/time-bonus score formula. Backend config remains disabled by default, so ordinary play remains local and unranked unless the backend is explicitly configured.

## What the current game trusts

`BombFactory` uses `Math.random()` to build the wire layout and answer, `RuleEngine` runs in the client, and the solution is retained in client state. Wire selections, power use, remaining time, progression, score, and streak are also client-owned. A modified client can change any of those values, skip bombs, grant itself extra time or powers, fabricate a transcript, and submit arbitrary local records. Authentication, App Check, timestamps supplied by a client, and a client-visible seed do not make those claims trustworthy.

## Implemented protocol: server-authoritative bomb transitions, batched input within each bomb

1. **Start run.** An authenticated, App-Check-enforced callable checks both public-leaderboard consent flags and the sanitized public display name. It creates a cryptographically random run ID, records server start/expiry, initializes score/streak/bomb progression, and returns the first challenge. The private run document stores the correct wire index; the public response never contains it.
2. **Play a bomb locally.** The client renders the server-provided wire presentation and instruction through the existing wire UI. It handles clicks locally and sends one action after one choice: `runId`, server sequence, challenge ID, and wire index. No score, streak, elapsed time, duration, answer claim, run length, power, or transcript is accepted. The game rules currently disclose the intended solution through the displayed instruction and wires, as normal puzzle UX requires; automation remains possible.
3. **Advance.** The server checks run ownership/status, consent, run/challenge expiry, sequence, challenge ID, exact payload shape, wire-index bounds, and the private answer. A correct choice consumes the challenge transactionally, applies the server scoring formula (`100 + min(990, 10 per prior defusal) + min(500, 5 per new streak count)`), updates streak/progression, and returns the next public challenge. This is one round trip per completed bomb, not per wire click. A wrong wire or server-timed-out challenge ends the run without adding score. The visible client timer is a UX countdown only; the server's per-challenge 30-second expiry decides eligibility. Network latency is charged against that server deadline.
4. **Finish.** A finish callable accepts only run ID and current sequence. It finalizes active runs as abandoned/expired, or preserves server-recorded completed/failed status, then updates both public best metrics in one transaction. The score and best streak come only from private server state. Finish is idempotent; retries return the saved result.
5. **Replay/race protection.** Each run is nested under the authenticated UID, has a cryptographically random UUID, 2-hour expiry, monotonically increasing sequence, and a private one-time current challenge. Firestore transactions serialize wire actions. A repeated action for the same challenge and same choice returns its stored response; a different replay, skipped/reordered sequence, cross-user run ID, stale challenge, or post-terminal action fails. Per-account start/action rate limits apply.
6. **Powers.** Ranked mode disables all powers and rejects any extra power/action fields. This is the safest practical choice because power inventory, scanner target, local shield RNG, and timer freeze/slow are client-owned. Normal offline/unranked mode retains existing powers and mechanics.
7. **Generation.** Ranked-only challenges are generated on the server using Node cryptographic randomness and stored privately with their solution; only renderable wire properties, instruction, challenge ID, sequence and duration are returned. The ordinary client `BombFactory` remains unchanged for unranked Endless.

## Validation and abuse controls

Validate callable shapes, UUIDs, wire index bounds, run ownership, sequence, challenge state, server-time windows, consent and server-derived metric bounds. Use App Check enforcement, authenticated ownership, per-user rate limits, transaction-based one-time consumption, public display-name sanitization, idempotency, and narrowly scoped Firestore rules. Keep public entries separate from UID-private mappings. A valid run demonstrates only that legal choices were received under server rules; it does not prove a human played. A modified client can automate the visible puzzle, exploit undiscovered issues, or control a real account. Rate limits and monitoring reduce but cannot eliminate abuse.

## Deployment and operating constraints

Production requires a deployed Functions backend, reviewed/deployed narrow Firestore rules, App Check providers and enforcement configured for Web and Android, a consent-aware client rollout, and monitoring. Cloud Functions deployment requires the Firebase Blaze plan; no billing or production deployment is authorized by this local work. Public client config must remain disabled until these approvals and release checks are complete.

## Present implementation boundary

The local backend and client now implement the server-owned run lifecycle. Emulator tests must exercise the exported callable functions and actual verifier; pure unit tests alone are insufficient. Ranked mode is still not globally live because `leaderboard-config.js` defaults it off, App Check providers are not configured for production, and no production deployment or remote-rule change has occurred.
