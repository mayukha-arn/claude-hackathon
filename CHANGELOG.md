# AdaptIQ — Changelog

All notable changes to this project are documented here, newest first.
Each entry maps to a git commit and lists what changed, why, and which files were affected.

---

## [2026-04-26] Demo Mode for Live Hackathon Demo
**Commit:** `b74c9e3`

### What Changed
- Added `⚡ DEMO MODE` checkbox on the profile selection screen
- When enabled (`window.DEMO_MODE = true`), the following happen at runtime with no code changes:
  - Baseline calibration window: **30 s → 5 s** (flags start firing much sooner)
  - Flag onset durations shortened by ~60–80%:

    | Flag | Normal | Demo |
    |------|--------|------|
    | GAZE_ERRATIC | 3 s | 1 s |
    | GAZE_LOST | 5 s | 1.5 s |
    | ATTENTION_DROP | 10 s | 2 s |
    | STRESS_DETECTED | 5 s | 1.5 s |
    | FOCUS_DRIFT | 8 s | 2 s |
    | SPEECH_PANIC | 3 s | 1 s |
    | PROLONGED_SILENCE | 15 s | 3 s |
    | OVERCONFIDENT_PACE | 10 s | 2 s |

  - Intervention cooldown: **15–20 s → 5 s** (Claude can respond more often)

### Why
Needed a way to reliably trigger all interventions during a live demo without waiting 10–15 s per flag. All changes are runtime-only — production behavior is unaffected when the toggle is off.

### Files Modified
- `index.html` — `DEMO_FLAG_DURATION` object, calibration window check, flag onset check, cooldown check, APP INIT toggle wiring

### Demo Cheat Sheet

| Action | Signal affected | Flag triggered |
|--------|----------------|----------------|
| Look away from camera | OSR ↑ | GAZE_LOST |
| Move eyes erratically | GDS ↑ | GAZE_ERRATIC |
| Look sideways + tilt head | GDS + HPD ↑ | FOCUS_DRIFT |
| Frown / look worried | ET ↑ | STRESS_DETECTED (+ loud voice) |
| Stay silent 3 s | SilR ↑ | PROLONGED_SILENCE → Claude responds |
| Speak very fast | SR ↑ | OVERCONFIDENT_PACE |
| Raise voice suddenly | VES ↑ | STRESS_DETECTED (+ frown) |
| Everything at once | CES drops | ATTENTION_DROP |

---

## [2026-04-26] Signal Accuracy Overhaul
**Commit:** `a8c45ef`

### What Changed
Six biometric signal formulas were corrected after auditing what each sensor was actually computing vs. what it should measure.

| Signal | Bug | Fix |
|--------|-----|-----|
| **ET** (Emotional Tension) | `(1 - neutral) * 100` — happy/surprised faces counted as tension | Sum of angry + fearful + disgusted + sad only |
| **HPD** (Head Pose Deviation) | Nose is anatomically below eyes, giving pitch=40–60 at neutral. headStability was stuck at ~40% | 30-frame self-calibrating pitch baseline; neutral pose now reads 0 |
| **BRA** (Blink Rate Anomaly) | Raw blink count compared to 17 bpm target without time normalization — 5 blinks in 5 s showed BRA=94 | Normalize blink count by elapsed session time; capped at 60 s window |
| **VES** (Vocal Energy Spike) | `Math.abs(z-score)` — sudden silence triggered a "spike" same as a shout | Only positive z-scores: `Math.max(0, z)` |
| **SilR** (Silence Ratio) | Hardcoded threshold `rms < 0.01` — failed on noisy mics or quiet rooms | 5-sample ambient RMS calibration at session start; threshold = `max(0.005, ambient × 3)` |
| **SR** (Speech Rate) | `Math.abs(0 - 135) / 135 * 100 = 100` before first word spoken | Returns 0 when `totalWords === 0` |

### Why
All 6 signals were producing misleading values from the first second of every session, making the entire flag/intervention pipeline unreliable before any real behavior occurred.

### Files Modified
- `perception/sensors.js` — source of truth for standalone sensor test harness
- `index.html` — inline copy of sensor logic (kept in sync)

---

## [2026-04-26] Metrics and Scorecard Fixes
**Commit:** `8d10662`

### What Changed

**InterviewScorecard initialization**
- Was: only initialized when `profileId === 'interview_coach'`
- Fix: always initialized for all profiles; scorecard panel now updates live for adhd/anxiety/asd cards too

**Calibration guard on eye contact**
- Was: InterviewScorecard counted `signal:update` frames during the 30 s baseline calibration window, inflating eye contact score
- Fix: `if (window.AnomalyDetector?.isCalibrating) return;` guard added to scorecard update handler

**CES alert thresholds raised**
- Was: `ces_alert_level: 40` (special_needs) and `35` (interview/language) — unreachable in practice since realistic CES floors at 50–60
- Fix: raised to `65` and `63` respectively; ATTENTION_DROP now actually fires

**vocalConfidence formula corrected**
- Was: `100 - pvs * 1.0 - silr * 0.5` — high PVS (expressive speech) unfairly penalized confident speakers
- Fix: `100 - pvs * 0.3 - silr * 0.7` — silence is the primary penalty; vocal variation is mildly weighted

**AudioEngine.reset() added to sensors.js**
- Added to the standalone perception/sensors.js file so test harness can call it directly

### Why
The scorecard was showing zeros for all profiles because it was never initialized. The ATTENTION_DROP flag never fired because the CES threshold was set below any realistic minimum. Together these two issues made the most visible demo metrics non-functional.

### Files Modified
- `index.html` — scorecard init, calibration guard, CES thresholds, vocal formula

---

## [2026-04-26] Critical Bug Fixes — Sensors, Permissions, API
**Commit:** `6355c1a`

### What Changed

**Gaze calibration never ran**
- `SensorManager.startCalibration()` was never called in APP INIT
- GazeEngine defaulted iris baseline to `{ avgX: 0.5, avgY: 0.5 }` → gaze tracking was completely inaccurate
- Fix: added `await SensorManager.startCalibration()` after `SensorManager.start()` in APP INIT

**Duplicate camera/audio permission dialogs**
- `ui.js` called `getUserMedia({ video: true, audio: false })`
- `sensors.js` AudioEngine called `getUserMedia({ audio: true, video: false })`
- Browser showed two separate permission prompts
- Fix: single consolidated `getUserMedia({ video: {...}, audio: true })` call in APP INIT; shared `mediaStream` passed to both `SensorManager.init()` and `AudioEngine.init()`

**No error feedback on permission denial**
- If user denied camera/mic, code logged a warning but continued; UI showed "No Face Detected" forever
- Fix: `NotAllowedError` caught explicitly; user-friendly message posted to event log

**ClaudeClient SSE timeout too aggressive**
- 3-second fallback fired before slow network responses could arrive
- Fix: timeout extended to 15 s; fallback only triggers if `receivedFirstChunk === false` (no data at all received)

**Audio transcript leaked between sessions**
- `fullTranscript` module variable accumulated across sessions; session 2 included session 1's words
- Fix: `AudioEngine.reset()` called at start of each session in APP INIT

**MediaPipe FaceMesh CDN was wrong**
- `index.html` was loading WebGazer; `sensors.js` expected MediaPipe FaceMesh (`window.FaceMesh`)
- `GazeEngine._init()` silently returned early — gaze was completely disabled
- Fix: removed WebGazer CDN tag; added correct MediaPipe FaceMesh CDN

**API key removed from source**
- Hardcoded `sk-ant-api03-...` key was blocked by GitHub secret scanning
- Fix: key field is now blank; users paste their own key into the UI input before starting

**Issue audit documents created**
- `ISSUES_FOUND.md` — 16 issues documented with severity and reproduction steps
- `FIXES_APPLIED.md` — detailed log of what was fixed, how, and test checklist

### Files Modified
- `index.html` — APP INIT consolidated permissions, gaze calibration call, error handling, timeout, reset
- `perception/sensors.js` — `AudioEngine.init()` accepts optional `mediaStream`; `reset()` added
- `ui.js` — `initVideoFeed()` made idempotent (checks `!video.srcObject` before requesting camera)

---

## [2026-04-26] Brain Integration Test Harness
**Commit:** `766e241`

### What Changed
- Added `integration/brain.js` — standalone Brain module (AnomalyDetector, InterventionDispatcher, ProfileConfig, ClaudeClient, InterviewScorecard)
- Added `integration/test.html` — interactive test harness with sliders to emit mock signals and observe flags/interventions without needing real sensors
- Inlined brain module into `index.html` for production use

### Files Modified
- `integration/brain.js` (new)
- `integration/test.html` (new)
- `index.html`

---

## [2026-04-26] Sensor Test Harness
**Commits:** `35c0a35`, `f7432b3`

### What Changed
- Added `perception/sensors.js` — standalone Sensors module (FaceEngine, GazeEngine, AudioEngine, SensorManager)
- Added `perception/test.html` — interactive test harness to verify all 9 signal values update from real camera/mic

### Files Modified
- `perception/sensors.js` (new)
- `perception/test.html` (new)

---

## [2026-04-26] Repository Structure Setup
**Commits:** `90b6eba`, `6faffef`, `fb8764b`

### What Changed
- Moved frontend files from `frontend/` subfolder to project root
- Renamed `frontend/index.html` → `index.html`, `frontend/ui.js` → `ui.js`
- Added `projectplan.md` with architecture overview and task breakdown
- Added team member profile files: `Sneh.md`, `Aagam.md`, `mayukha.md`, `Rishab.md`

### Files Modified
- `index.html`, `ui.js` (moved from `frontend/`)
- `projectplan.md` (new)

---

## [2026-04-26] Initial Project Upload
**Commits:** `49bc659`, `8fa0188`, `a232d19`, `83c27f8`, `134999e`

### What Changed
- Initial upload of AdaptIQ codebase
- Core files: `index.html` (app shell + brain modules), `ui.js` (UI layer), `integration/brain.js`, `perception/sensors.js`
- Assets: face-api model weights, CSS, icons
- GitHub Pages deployment target: `https://mayukha-arn.github.io/claude-hackathon/`

---

## How to Update This File

When making a change:
1. Add a new section at the **top** of the changelog (above the previous newest entry)
2. Use this format:
   ```
   ## [YYYY-MM-DD] Short description of the change
   **Commit:** `<hash>`

   ### What Changed
   - bullet points

   ### Why
   one paragraph

   ### Files Modified
   - list of files
   ```
3. Commit `CHANGELOG.md` together with the change files in the same commit
