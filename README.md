# 💣 Bomb Defuse — Fast-Paced Hyper-Casual Web Game

> **"Read the rule. Cut the right wire. Don't explode."**

**Bomb Defuse** is a responsive, pure-vanilla web game built with HTML5, CSS3, ES6 JavaScript, and the Web Audio API. Defuse increasingly complex bombs, manage fuse timers, build massive streaks, purchase active powers and permanent upgrades, conquer seeded daily challenges, and unlock 23 achievements.

---

## 🎮 Features

- **Procedural Web Audio Engine**: Synthesizes all wire snips, fuse countdown ticks, success chimes, defusal jingles, power hums, and explosions in real-time with zero external audio assets.
- **First-Time Player Onboarding**: Interactive, skippable 3-step training protocol teaching rule reading, wire matching, and timer management.
- **Dynamic Rule Engine**:
  - *Color Rules*: Simple direct color matching.
  - *Position Rules*: Left, right, and center indexed wires.
  - *Length Rules*: Longest, shortest, second-longest comparisons.
  - *Relation Rules*: Wires positioned between two specific colors.
  - *Combination Rules*: Multi-attribute logic (e.g. longest red wire, shortest non-yellow wire).
  - *Memory Rules*: Positions based on the previous round's solution.
  - *Master Rules*: Complex exclusion and tiered condition trials.
- **3 Tactical Active Powers**:
  - 🔍 **Scanner**: Reveals 1 incorrect wire for 1.5 seconds.
  - ❄ **Time Freeze**: Halts fuse countdown for 3.0 seconds.
  - 🛡 **Second Chance**: Absorbs 1 incorrect wire cut per bomb.
- **Deterministic UTC Daily Challenge**: 7-stage gauntlet with seeded pseudo-random generation, daily progress tracking, and bonus coin rewards.
- **Player Accounts & Profiles**: Comprehensive guest-mode first player profile system with customized avatars (Bomb, Defuser, Shield, Lightning, Circuit, Skull, Robot), display names, and membership metadata.
- **Authentication Architecture**: Isolated provider adapters (`GuestAuthProvider`, `GoogleAuthProvider`, `FacebookAuthProvider`, `EmailAuthProvider`) behind `AuthManager` with zero external dependencies and safe unavailable states for production builds.
- **Cloud & Local Save Separation**: `LocalSaveManager` immediate persistence with offline resilience; `CloudSaveManager` synchronization abstraction and conflict resolution.
- **Data Privacy & GDPR Controls**: Anonymous analytics and personalized ad consent toggles in Account Settings.
- **Data Portability (Export My Data)**: One-click export of non-sensitive player statistics, achievements, upgrades, and records as `bomb-defuse-player-data.json`.
- **7-Day Daily Login Rewards**: Supply crate reward cycle granting escalating coins with streak tracking and visual claim cards.
- **3 Rotating Daily Goals**: UTC-deterministic daily missions with active tracking, real-time menu badges, and coin rewards.
- **Career Statistics Dashboard**: Comprehensive performance analytics categorized into Career, Skill, Economy, and Time metrics.
- **Session Milestones**: In-run defusal milestones (5, 10, 20, 30, 50 bombs) with floating celebratory feedback and bonus coins.
- **Personal Best Records & Social Sharing**: Native Web Share API integration with clipboard copy fallback for score bragging.
- **Monetization & Live-Ops Architecture**: Modular manager abstraction ready for future ad network integration with zero overhead.
- **23 Persistent Achievements**: Spanning Gameplay, Speed, Streak, Mastery, Economy, Powers, and Hidden Secrets with interactive filtering and animated notification toasts.
- **Permanent Upgrades Economy**: Time Buffer, Coin Boost, Speed Bonus, Streak Bonus, and Emergency Shield.
- **Progressive Web App (PWA)**: Offline-first caching via Service Worker (`bomb-defuse-v2`) and native installation support.
- **Accessibility & Safety**: Full keyboard navigation (`Tab`, `Space`, `Enter`, `Esc`), screen reader ARIA labels, and `prefers-reduced-motion` support.

---

## 🕹️ Controls

| Action | Mouse / Touch | Keyboard Shortcut |
| :--- | :--- | :--- |
| **Cut Wire** | Click / Tap directly on wire | Focus wire with `Tab`, press `Enter` or `Space` |
| **Activate Power** | Tap power button in power bar | Focus power with `Tab`, press `Enter` or `Space` |
| **Pause / Resume** | Tap Pause button `❚❚` | Press `Escape` |
| **Menu Navigation** | Click / Tap buttons | `Tab` / `Shift+Tab` to navigate, `Enter` / `Space` to select |

---

## 🚀 How to Run Locally

Because **Bomb Defuse** is 100% static and has zero npm or backend dependencies, you can run it using any static web server:

### Option 1: Python HTTP Server (Recommended)
```bash
# Python 3
python -m http.server 8080
```
Then open `http://localhost:8080` in your browser.

### Option 2: Node http-server or npx serve
```bash
npx serve .
```

### Option 3: VS Code Live Server
Right-click `index.html` and select **"Open with Live Server"**.

---

## 🌐 Deployment

Bomb Defuse is ready for one-click static hosting on any platform:

### GitHub Pages
1. Push this repository to GitHub.
2. In your repository settings, navigate to **Pages**.
3. Under **Branch**, select `main` (or `master`) and folder `/ (root)`.
4. Click **Save**. Your game will be live at `https://<username>.github.io/<repo>/`.

### Netlify / Vercel / Cloudflare Pages
- **Build Command**: *(None — leave empty)*
- **Publish Directory**: `.` *(root)*

---

## 📱 PWA & Offline Support

- **Manifest**: `manifest.json` provides standalone portrait mode and branded icons.
- **Service Worker**: `service-worker.js` caches all game assets (`index.html`, `styles.css`, `script.js`, `manifest.json`, `favicon.svg`, and icons) on the first visit.
- Once loaded, the game is **100% playable offline** without internet connectivity.

---

## 💾 Save System & Data Integrity

Game data is persisted in `localStorage` under the key:
`bombDefuseFirstPlayable_v1`

### Schema (Version 3):
```json
{
  "version": 3,
  "account": {
    "mode": "guest",
    "provider": "guest",
    "userId": "guest_abc123",
    "displayName": "Guest",
    "avatar": "bomb",
    "createdAt": "2026-08-31",
    "email": ""
  },
  "tutorialCompleted": false,
  "coins": 0,
  "bestScore": 0,
  "bestStreak": 0,
  "bestDailyScore": 0,
  "soundEnabled": true,
  "upgrades": {
    "timeBuffer": 0,
    "coinBoost": 0,
    "speedBonus": 0,
    "streakBonus": 0,
    "emergencyShield": 0
  },
  "powers": {
    "scanner": 0,
    "timeFreeze": 0,
    "secondChance": 0
  },
  "daily": {
    "date": "2026-08-31",
    "status": "NONE",
    "score": 0,
    "bombsCompleted": 0,
    "rewardClaimed": false
  },
  "stats": {
    "totalBombsDefused": 0,
    "totalBombsFailed": 0,
    "totalAttempts": 0,
    "totalScore": 0,
    "bestScore": 0,
    "bestStreak": 0,
    "totalCoinsEarned": 0,
    "totalCoinsSpent": 0,
    "totalPowersUsed": 0,
    "totalUpgradesPurchased": 0,
    "totalDailyChallengesCompleted": 0,
    "perfectDailyChallenges": 0,
    "totalPlayTimeSeconds": 0,
    "fastestDefuseSeconds": 999,
    "rulesMastered": [],
    "achievementsUnlocked": 0
  },
  "loginReward": {
    "lastClaimDate": "",
    "streakDay": 0
  },
  "dailyGoals": {
    "date": "",
    "goals": []
  },
  "personalBests": {
    "bestScore": 0,
    "bestStreak": 0,
    "mostBombsRun": 0,
    "fastestDefuse": 0,
    "bestDailyScore": 0,
    "mostCoinsRun": 0
  },
  "sessionMilestones": {},
  "privacy": {
    "analytics": false,
    "personalizedAds": false
  },
  "consent": {
    "essential": true,
    "analytics": false,
    "personalizedAds": false
  },
  "achievements": {
    "unlocked": [],
    "unlockedDates": {},
    "progress": {},
    "stats": { ... }
  }
}
```

- **Backward Compatibility**: Automatically migrates Version 1 and Version 2 saves to Version 3 without progress loss.
- **Resilience**: If `localStorage` is blocked or unavailable (e.g. private browsing), an automatic in-memory fallback engages smoothly without errors.
- **Reset**: The "Reset Progress" option in the Shop safely wipes records, powers, upgrades, achievements, and tutorial status after confirmation.

---

## 🔥 Firebase Backend & Authentication Foundation (Phase 9A)

> **Status**: **FIREBASE INTEGRATION READY — BACKEND CONFIGURATION REQUIRED**
> 
> The application includes the official Firebase Web SDK integration layer (`FirebaseManager` and `AuthManager`). When unconfigured, the game runs in **Guest Mode (Local Save)** with full offline gameplay and zero network dependencies.

### Architecture Overview

```text
GAMEPLAY SYSTEMS (BombFactory, RuleEngine, Timer, PowerManager, Audio, Shop)
       ↓
SAVE MANAGER (Schema V3, LocalSaveManager, Normalization)
       ↓
ACCOUNT LAYER (AuthManager: Guest, Google, Facebook, Email, ProfileUI, SettingsUI)
       ↓
FIREBASE INTEGRATION LAYER (FirebaseManager: Init, Auth, Session, Error Sanitization)
       ↓
FIREBASE WEB SDK (Official Google gstatic SDK / Offline Graceful Fallback)
```

### Centralized Firebase Configuration

To connect your live Firebase project, insert your Web App configuration keys into `FIREBASE_CONFIG` in [`script.js`](file:///d:/Web%20Game%20v1/script.js):

```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
```

> [!IMPORTANT]
> **Client Configuration vs Server Secrets**:
> `FIREBASE_CONFIG` keys are public client identifiers intended for browser initialization. Never commit or place private service-account private keys, OAuth client secrets, or server API tokens in client files.

---

### Step-by-Step Firebase Console Setup

1. **Create a Firebase Project**:
   - Navigate to [Firebase Console](https://console.firebase.google.com/).
   - Click **Add Project** and specify a project name (e.g. `bomb-defuse-game`).
2. **Register Web Application**:
   - In Project Overview, click the **Web** icon (`</>`).
   - Register app nickname `Bomb Defuse Web`.
   - Copy the configuration object values into `FIREBASE_CONFIG` in `script.js`.
3. **Enable Authentication Providers**:
   - Navigate to **Build > Authentication > Sign-in method**.
   - **Email/Password**: Click Enable, then Save.
   - **Google**: Click Enable, specify project support email, then Save.
   - **Facebook**: Click Enable, provide your Meta App ID and App Secret from Meta for Developers, then Save.
4. **Configure Authorized Domains**:
   - Under **Authentication > Settings > Authorized domains**, add your deployment domains (e.g. `localhost`, `your-username.github.io`, `your-custom-domain.com`).

---

### Authentication Providers & Capabilities

| Provider | Method | Features | Offline / Unconfigured Fallback |
| :--- | :--- | :--- | :--- |
| **Guest Mode** | `AuthManager.continueAsGuest()` | Instant play, persistent local save, no internet needed | Default mode for all new players |
| **Google** | `AuthManager.loginWithGoogle()` | One-click OAuth popup sign-in, account linking | Displays configuration alert without crashing |
| **Email / Password** | `AuthManager.loginWithEmail()` / `registerWithEmail()` | Account creation, password recovery email, login | Clear validation & sanitized error reporting |
| **Facebook** | `AuthManager.loginWithFacebook()` | Social authentication popup | Displays configuration alert without crashing |

---

### Offline Behavior & Guest Mode

- **Zero-Friction Startup**: New players open the game and can play immediately in Guest Mode without being forced to register.
- **Full Offline Defusal**: Bomb generation, audio effects, countdown timers, powers, upgrades, achievements, and Daily Challenge remain 100% playable offline.
- **Non-Blocking Startup**: If offline or if Firebase CDN is unreachable, the game automatically operates via `LocalSaveManager`.
- **Safe Account Migration**: When a guest player signs in with Google, Facebook, or Email, their local progress is safely linked to their authenticated account.
- **Conflict Resolution**: If local progress differs from cloud saves, `#screen-sync-conflict` allows players to choose **Use This Device**, **Use Cloud Save**, or deterministic **Merge**.

---

### Security & Privacy Compliance

- **No Passwords in Storage**: Plaintext passwords and hashes are never saved to `localStorage`, `SaveManager`, or client logs.
- **No Stored Tokens**: Authentication session tokens are managed exclusively by the official Firebase SDK in secure browser storage.
- **Safe Display Name Rendering**: Display names are sanitized against script tags and rendered exclusively using `textContent`.
- **Two-Step Account Deletion**: Deleting an account requires typing `DELETE` and cleanly terminates backend sessions while wiping local storage.
- **Consent Gate for Telemetry**: `AnalyticsManager` remains disabled unless `ConsentManager.hasConsent("analytics")` is true, and automatically strips all sensitive parameters.

---

## 🛡️ Browser Compatibility

| Browser | Supported | Notes |
| :--- | :--- | :--- |
| **Google Chrome / Chromium** | ✅ Fully Supported | Service Worker, Web Audio, PWA Install, Firebase Auth |
| **Mozilla Firefox** | ✅ Fully Supported | Service Worker, Web Audio, Firebase Auth |
| **Apple Safari (macOS / iOS)** | ✅ Fully Supported | Web Audio unlock on gesture, Safe Areas, Firebase Auth |
| **Microsoft Edge** | ✅ Fully Supported | Service Worker, Web Audio, PWA Install, Firebase Auth |
| **Mobile Browsers (Android / iOS)** | ✅ Fully Supported | Touch optimization, viewport cover, safe insets |

---

## ⚖️ License & Credits
Created with pure web standards. Open source and free for static distribution.
