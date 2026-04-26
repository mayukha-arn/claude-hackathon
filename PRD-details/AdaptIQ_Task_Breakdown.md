# AdaptIQ — Hackathon Task Breakdown

**4 roles · 1 single-file app · 5-minute demo**

---

## Dependency Flow

```
👁️ Perception Engineer  →  🧠 Intelligence Engineer  →  🎨 UI / Frontend Engineer
                                                              ↕
                                                      🔗 Integration Lead
```

Person 3 (UI) can start the HTML shell + static screens immediately. Person 4 (Integration) wires everything once modules arrive.

---

## Person 1: Perception Engineer 👁️

**Focus:** Face, Gaze & Voice Pipeline
**Time Estimate:** ~8–10 hours

You own everything that turns raw webcam frames and microphone audio into numeric signal values. By the end of your work, the rest of the team can call simple functions that return scores like Gaze Drift, Head Pose Deviation, and Vocal Energy.

### Task 1 — Face Detection Module (FaceEngine)

- Load face-api.js models from jsDelivr CDN (tinyFaceDetector, faceLandmark68Net, faceExpressionNet)
- Set up webcam video element + `requestAnimationFrame` loop at ~30fps
- Extract 68-point facial landmarks per frame
- Compute 7-class expression probabilities (happy, sad, angry, fearful, disgusted, surprised, neutral)
- Compute head pose angles (yaw, pitch, roll) from landmark geometry
- Compute Eye Aspect Ratio (EAR) for blink detection
- Expose normalized outputs: Expression Tension (ET), Head Pose Deviation (HPD), Blink Rate Anomaly (BRA)

### Task 2 — Gaze Tracking Module (GazeEngine)

- Initialize WebGazer.js with regression model
- Build the 9-point calibration screen UI (follow-the-dot)
- Capture (x, y) gaze pixel coordinates each frame
- Compute Gaze Drift Score (GDS): rolling stddev of gaze coords over 30 frames, normalized to screen diagonal
- Compute Off-Screen Ratio (OSR): fraction of last 60 frames with gaze outside central 60% viewport rect

### Task 3 — Audio Analysis Module (AudioEngine)

- Set up AudioContext → microphone MediaStream → AnalyserNode → Meyda feature extraction
- Extract per 2-second window: RMS energy, spectral centroid, ZCR, MFCC coefficients
- Compute Vocal Energy Spike (VES) from RMS Z-score
- Compute Pitch Variance Score (PVS) from spectral centroid rolling stddev
- Compute Silence Ratio (SilR) from ZCR threshold over last 30 seconds
- Hook up Web Speech API (SpeechRecognition) for live transcript
- Compute Speech Rate (SR) as words-per-minute from transcript token counter

### Task 4 — Signal Buffer Utility (SignalBuffer)

- Implement circular buffer class with configurable window size (default W=60)
- Expose methods: `push()`, `mean()`, `stddev()`, `zScore(currentValue)`
- This is used by ALL signal modules + the anomaly detector

### Deliverables

- FaceEngine, GazeEngine, AudioEngine as IIFE blocks inside index.html
- SignalBuffer utility class
- 9-point gaze calibration screen
- All modules emit normalized 0–100 signal values via a shared event/callback system

### Dependencies

None — you go first. Everyone else depends on your signal outputs.

---

## Person 2: Intelligence Engineer 🧠

**Focus:** Anomaly Detection, Profiles & Interventions
**Time Estimate:** ~7–9 hours

You own the brain of the system — the numeric engine that turns raw signal values into anomaly flags, and the profile configs that decide what to do about them. You also wire the intervention dispatcher that triggers UI changes or Claude API calls.

### Task 1 — Anomaly Detector (AnomalyDetector)

- Consume all signal values from the Perception Engineer's modules
- Maintain a SignalBuffer per signal for rolling Z-score computation
- Implement 30-second baseline calibration period (no flags during this window)
- Compute Composite Engagement Score (CES) using weighted formula:
  `CES = 100 - (GDS×0.20 + OSR×0.20 + HPD×0.15 + ET×0.10 + VES×0.10 + PVS×0.10 + SR×0.10 + BRA×0.05)`
- Emit flag events: `GAZE_ERRATIC`, `GAZE_LOST`, `ATTENTION_DROP`, `STRESS_DETECTED`, `FOCUS_DRIFT`, `SPEECH_PANIC`, `PROLONGED_SILENCE`, `OVERCONFIDENT_PACE`
- Each flag has a trigger condition, sustained-duration requirement, and severity level (see PRD §6.4)

### Task 2 — Profile Configurations (ProfileConfig)

- Define 3 profile config objects as plain JS: Special Needs Tutor, Interview Coach, Language Teacher
- Each config specifies: threshold_z, CES alert level, intervention cooldown, monitored signals, and intervention mappings
- Special Needs: threshold_z = 1.8, CES alert < 40, cooldown 20s
- Interview Coach: default thresholds, scored metrics (Eye Contact %, Head Stability, Vocal Confidence, Speech Clarity, Overall Score)
- Language Teacher: confusion expression monitoring, pitch anomaly handling, vocabulary matching config

### Task 3 — Intervention Dispatcher

- Listen to anomaly flag events from AnomalyDetector
- Look up the active profile's intervention mapping for each flag
- Apply cooldown logic (minimum 20s between interventions, configurable per profile)
- For UI interventions (focus object, banner, content swap): call the UI Engineer's rendering functions
- For Claude-powered interventions (content regen, debrief): call the ClaudeClient module
- Track intervention history for session summary

### Task 4 — Claude API Client (ClaudeClient)

- Minimal fetch wrapper for Anthropic `/v1/messages` endpoint (claude-sonnet-4-20250514)
- Accept API key from UI text field, store only in JS memory
- Build context-aware prompts using current profile + signal data + transcript
- Handle streaming responses for chat-bubble UI rendering
- Pre-written fallback text for when API latency > 3s
- Session-end debrief generation (Interview Coach profile)

### Deliverables

- AnomalyDetector module with all 8 flag types
- 3 complete ProfileConfig objects
- InterventionDispatcher with cooldown logic
- ClaudeClient API wrapper with streaming support

### Dependencies

Needs signal outputs from Person 1 (Perception). Sends intervention commands to Person 3 (UI).

---

## Person 3: UI / Frontend Engineer 🎨

**Focus:** Dashboard, Overlays & Visual Design
**Time Estimate:** ~7–8 hours

You own everything the user sees — the profile selection screen, the session layout, live charts, intervention overlays, and all visual polish. The demo is only as good as it looks, and that's on you.

### Task 1 — Profile Selection Screen

- 3 large clickable profile cards: Special Needs Tutor, Interview Coach, Language Teacher
- Each card has an icon/emoji, name, and 1-line description
- Clicking a card sets the active profile and navigates to the session screen
- Include API key text input field above the cards
- Clean, polished, high-contrast design

### Task 2 — Session Screen Layout

- Left panel (30%): Webcam feed with face bounding box overlay and gaze dot
- Center panel (45%): Active lesson content area / Claude-generated text / intervention overlays
- Right panel (25%): Real-time signal dashboard
- Bottom bar: Large CES number + color bar (green → yellow → red gradient) + active flag badges
- Responsive enough for a demo (target: 1080p+ screen)

### Task 3 — Real-Time Dashboard (Chart.js)

- 4 live sparkline charts in the right panel: CES, GDS, VES, PVS
- Charts update every frame (~30fps) with smooth animation
- Color-coded thresholds (green = safe, yellow = warning, red = anomaly)
- Interview Coach profile: additional scored metrics panel (Eye Contact %, Head Stability, etc.)

### Task 4 — Intervention Overlay System

- **Focus Object:** Animated SVG geometric shape, centered, 3-second auto-dismiss (Special Needs)
- **Banner Alert:** Slide-in top banner, color-coded by severity, 5-second auto-dismiss (Interview Coach)
- **Content Swap:** Fade transition to new content block (all profiles)
- **Claude Response:** Chat-bubble UI with streaming text animation (all profiles)
- **Break Timer:** Full-screen countdown overlay for movement breaks (Special Needs)
- Each overlay type should be a reusable function the Intervention Dispatcher can call

### Task 5 — Single-File HTML Shell

- Set up the `index.html` skeleton: all CSS in `<style>`, all JS in `<script>` blocks
- Load CDN dependencies (face-api.js, WebGazer, Meyda, Chart.js, TensorFlow.js)
- Model loading progress bar for face-api.js (~3–5s first load)
- Structure the IIFE blocks so each team member can paste their module into the file

### Deliverables

- Complete index.html shell with CDN imports and CSS
- Profile selection screen
- Session screen with 3-panel layout
- 4 live Chart.js sparklines
- 5 intervention overlay types (focus object, banner, content swap, chat bubble, break timer)
- Loading/progress bar for model initialization

### Dependencies

Needs signal data from Person 1 for chart rendering. Needs intervention calls from Person 2. Can start the HTML shell and static UI immediately.

---

## Person 4: Integration Lead & Demo Engineer 🔗

**Focus:** Glue Code, Testing & Presentation
**Time Estimate:** ~6–8 hours

You're the glue. You wire everyone's modules together into the final index.html, write the event/callback system that connects them, handle edge cases, run end-to-end testing, and prepare the 5-minute demo script. You also own the Interview Coach scored metrics display and the session-end report.

### Task 1 — Event Bus / Callback System

- Design a simple pub/sub or callback-based system for module communication
- Perception modules → publish signal values
- AnomalyDetector → subscribes to signals, publishes flags
- InterventionDispatcher → subscribes to flags, calls UI functions
- Dashboard → subscribes to signals for chart updates
- Keep it vanilla JS — no framework, no library

### Task 2 — Module Integration

- Merge all 3 teammates' code into the single index.html
- Resolve naming conflicts, shared state, initialization order
- Ensure correct startup sequence: load models → calibrate gaze → calibrate baseline → start session
- Handle permission prompts (camera, microphone) gracefully
- Test each profile end-to-end: trigger every flag, verify every intervention fires

### Task 3 — Interview Coach Scorecard

- Build the live scored metrics panel for Interview Coach profile
- Eye Contact % = running % of frames with OSR < 30 (target > 70%)
- Head Stability = 100 - HPD average (target > 75)
- Vocal Confidence = 100 - PVS - SilR×50 (target > 65)
- Speech Clarity = 100 - SR_score - (filler_count / word_count) × 100 (target > 70%)
- Overall Interview Score = weighted composite with letter grade (A/B/C/D/F)
- Filler word detection via regex on live transcript (`um`, `uh`, `like`, `you know`)

### Task 4 — Session Report & Export

- Aggregate signal data over the full session
- Generate session summary JSON (all metrics, flag counts, intervention log)
- For Interview Coach: trigger Claude API to generate full written debrief at session end
- Add "Export Report" button that downloads session JSON

### Task 5 — Demo Preparation

- Rehearse the 5-minute demo script from PRD §11
- Prepare backup plan if WebGazer calibration fails (skip gaze, demo face + voice only)
- Test on target laptop + Chrome version
- Prepare talking points: all numeric, self-calibrating, zero-install, open source, extensible
- Have pre-typed Claude API key ready to paste

### Deliverables

- Event bus / pub-sub system
- Final merged index.html (< 1500 lines)
- Interview Coach scorecard + letter grade
- Session report JSON export
- Rehearsed 5-minute demo

### Dependencies

Depends on all 3 other members. Can start the event bus and scorecard logic immediately, then integrate as modules arrive.
