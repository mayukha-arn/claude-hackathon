# AdaptIQ — Claude Code Prompts for 3-Person Team

**How to use:** Each person copies their prompt below and pastes it into Claude Code. All three work simultaneously in separate folders, producing standalone `.js` files. At the end, Person C merges everything into the final `index.html`.

**Shared contract everyone must know before starting:**

```
EVENT BUS (copy this into every file as the first thing):

const Bus = (() => {
  const subs = {};
  return {
    on(evt, fn) { (subs[evt] ||= []).push(fn); },
    off(evt, fn) { subs[evt] = (subs[evt] || []).filter(f => f !== fn); },
    emit(evt, data) { (subs[evt] || []).forEach(fn => fn(data)); }
  };
})();

EVENT NAMES & PAYLOADS:
  'signal:face'    → { et, hpd, bra, landmarks, expressions, bbox }
  'signal:gaze'    → { gds, osr, x, y }
  'signal:audio'   → { ves, pvs, silr, sr, transcript }
  'signal:update'  → { gds, osr, hpd, et, ves, pvs, silr, sr, bra, ces }
  'flag:fired'     → { type, severity, timestamp, message }
  'intervention:trigger' → { action, message, color, duration, profile }
  'profile:selected'     → { id, config }
  'calibration:complete' → { type } // 'gaze' or 'baseline'
  'session:end'          → {}
```

---

## PERSON A — Sensor Engineer (Perception + Audio)

**Output file:** `sensors.js`
**Works in folder:** `person-a/`

### Prompt to paste into Claude Code:

```
I'm building a browser-based real-time biometric sensing system called AdaptIQ. My job is to write ALL the sensor/perception code as a single JavaScript file called sensors.js. This file will later be pasted into a <script> block inside a single-file index.html app.

IMPORTANT CONSTRAINTS:
- Vanilla JS only. No frameworks, no build tools, no Node.
- All code must work inside a browser <script> tag.
- CDN libraries available (loaded before my code runs):
    - face-api.js from jsDelivr (tinyFaceDetector, faceLandmark68Net, faceExpressionNet)
    - WebGazer.js
    - Meyda.js
- I communicate with other modules ONLY through an event bus. Assume this exists globally:

const Bus = (() => {
  const subs = {};
  return {
    on(evt, fn) { (subs[evt] ||= []).push(fn); },
    off(evt, fn) { subs[evt] = (subs[evt] || []).filter(f => f !== fn); },
    emit(evt, data) { (subs[evt] || []).forEach(fn => fn(data)); }
  };
})();

BUILD THESE MODULES IN THIS ORDER:

---

### 1. SignalBuffer class
A reusable circular buffer used by every module.
- Constructor takes window size (default 60)
- Methods: push(value), mean(), stddev(), zScore(currentValue), values() (returns copy of buffer)
- Must handle edge cases: empty buffer, single value, all same values (stddev=0)
- Export as: window.SignalBuffer = SignalBuffer

---

### 2. FaceEngine (IIFE)
Wraps all face-api.js logic.

Initialization:
- Call faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/')
- Same for faceLandmark68Net and faceExpressionNet
- Emit a 'models:loaded' event when all 3 are loaded
- Accept a <video> element reference via FaceEngine.init(videoEl)

Detection loop:
- Use requestAnimationFrame at ~30fps
- On each frame, run faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions()
- If no face detected, emit signal:face with all values zeroed and a bbox of null

From each detection, compute:

A) Expression Tension (ET): 0-100
   - Get the 7 expression probabilities (happy, sad, angry, fearful, disgusted, surprised, neutral)
   - ET = (1 - neutral_probability) * 100
   - Use a SignalBuffer(60) to smooth it

B) Head Pose Deviation (HPD): 0-100
   - Estimate yaw and pitch from the 68 landmarks:
     - Use nose tip (landmark 30), left face edge (landmark 0), right face edge (landmark 16)
     - Yaw = ratio of (nose_to_left / nose_to_right), normalized
     - Pitch = vertical position of nose relative to eye line
   - HPD = sqrt(yaw² + pitch²) normalized to 0-100
   - Use a SignalBuffer(60) to smooth it

C) Blink Rate Anomaly (BRA): 0-100
   - Compute Eye Aspect Ratio (EAR) from landmarks:
     - Left eye: landmarks 36-41, Right eye: landmarks 42-47
     - EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
   - Detect blink when EAR drops below 0.21 for at least 2 consecutive frames
   - Track blinks per minute using a rolling 60-second window
   - Normal blink rate ~15-20/min
   - BRA = |current_blink_rate - 17| / 17 * 100, clamped to 0-100
   - Use a SignalBuffer(60)

D) Bounding box: { x, y, width, height } from detection.detection.box

Emit every frame:
Bus.emit('signal:face', { et, hpd, bra, landmarks: detection.landmarks, expressions: detection.expressions, bbox })

Expose: window.FaceEngine = { init, start, stop, getLatest }

---

### 3. GazeEngine (IIFE)
Wraps WebGazer.js for gaze tracking.

Initialization:
- webgazer.setRegression('ridge').setGazeListener(callback).begin()
- Hide the default WebGazer video and prediction elements
- GazeEngine.init() returns a promise that resolves when webgazer is ready

Calibration:
- GazeEngine.startCalibration() shows a 9-point calibration UI
- 9 dots at positions: 3x3 grid with 10% margin from edges
- Each dot appears for 2 seconds, user clicks it, then next dot appears
- After all 9, emit Bus.emit('calibration:complete', { type: 'gaze' })
- The calibration UI is just a div overlay with a single dot that moves — keep it simple
- Provide a DOM element ID 'gaze-calibration-overlay' that the UI person can style

Gaze tracking (after calibration):
- Capture (x, y) pixel coordinates from WebGazer's gaze listener
- Compute Gaze Drift Score (GDS): 0-100
  - Maintain a SignalBuffer(30) each for x and y coordinates
  - GDS = sqrt(xBuffer.stddev()² + yBuffer.stddev()²) / screenDiagonal * 100
  - screenDiagonal = sqrt(window.innerWidth² + window.innerHeight²)
  - Clamp to 0-100

- Compute Off-Screen Ratio (OSR): 0-100
  - Define "central zone" as the middle 60% of viewport (20% margin each side)
  - Track last 60 gaze points
  - OSR = (points outside central zone / 60) * 100

- Also track raw gaze (x, y) for the UI to render a gaze dot overlay

Emit every frame:
Bus.emit('signal:gaze', { gds, osr, x, y })

Expose: window.GazeEngine = { init, startCalibration, start, stop, getLatest }

---

### 4. AudioEngine (IIFE)
Audio analysis + speech recognition.

Initialization:
- navigator.mediaDevices.getUserMedia({ audio: true })
- Create AudioContext + AnalyserNode
- Initialize Meyda analyzer on the audio source with bufferSize 2048
- Start Web Speech API (webkitSpeechRecognition) for live transcript
- AudioEngine.init() returns a promise

Feature extraction (every 2 seconds via setInterval):
- From Meyda, extract: rms, spectralCentroid, zcr
- If Meyda isn't cooperating, fallback: compute RMS manually from AnalyserNode frequency data

Compute signals:

A) Vocal Energy Spike (VES): 0-100
   - Maintain SignalBuffer(30) of RMS values
   - VES = abs(rmsBuffer.zScore(currentRMS)) * 25, clamped 0-100

B) Pitch Variance Score (PVS): 0-100
   - Maintain SignalBuffer(30) of spectralCentroid values
   - PVS = centroidBuffer.stddev() / centroidBuffer.mean() * 100, clamped 0-100

C) Silence Ratio (SilR): 0-100
   - Track last 15 windows (30 seconds of 2s windows)
   - A window is "silent" if RMS < 0.01
   - SilR = (silent_windows / 15) * 100

D) Speech Rate (SR): 0-100
   - Count words from SpeechRecognition transcript over rolling 60-second window
   - words_per_minute = word_count
   - Optimal range: 120-150 WPM
   - SR = abs(wpm - 135) / 135 * 100, clamped 0-100

- Accumulate full transcript text for other modules to read

Emit every 2 seconds:
Bus.emit('signal:audio', { ves, pvs, silr, sr, transcript: fullTranscript })

Expose: window.AudioEngine = { init, start, stop, getLatest, getTranscript }

---

### ALSO include at the top of sensors.js:
- A comment header: // === ADAPTIQ SENSORS MODULE === //
- The SignalBuffer class
- Then each engine as an IIFE

### ALSO include at the bottom:
- A SensorManager object that orchestrates initialization:
  window.SensorManager = {
    async init(videoElement) {
      await FaceEngine.init(videoElement);
      await AudioEngine.init();
      await GazeEngine.init();
    },
    startCalibration() { return GazeEngine.startCalibration(); },
    start() { FaceEngine.start(); GazeEngine.start(); AudioEngine.start(); },
    stop() { FaceEngine.stop(); GazeEngine.stop(); AudioEngine.stop(); }
  }

Write the complete sensors.js file. Make it production-quality but pragmatic — this is a hackathon. Prioritize working code over perfection. Add brief comments explaining non-obvious math. Handle errors gracefully (try-catch around each frame, log but don't crash).
```

---

## PERSON B — Brain Engineer (Intelligence + Integration)

**Output file:** `brain.js`
**Works in folder:** `person-b/`

### Prompt to paste into Claude Code:

```
I'm building the intelligence/brain layer for a browser-based biometric monitoring app called AdaptIQ. My job is to write ALL the anomaly detection, profile configuration, intervention dispatching, and Claude API integration as a single JavaScript file called brain.js. This will be pasted into a <script> block inside a single-file index.html app.

IMPORTANT CONSTRAINTS:
- Vanilla JS only. No frameworks, no build tools, no Node.
- All code runs in a browser <script> tag.
- I DO NOT touch the DOM. I only emit events for the UI layer to handle.
- I depend on a SignalBuffer class that will be globally available (from the sensors module). It has: push(value), mean(), stddev(), zScore(currentValue).

EVENT BUS (assume this exists globally):

const Bus = (() => {
  const subs = {};
  return {
    on(evt, fn) { (subs[evt] ||= []).push(fn); },
    off(evt, fn) { subs[evt] = (subs[evt] || []).filter(f => f !== fn); },
    emit(evt, data) { (subs[evt] || []).forEach(fn => fn(data)); }
  };
})();

EVENTS I SUBSCRIBE TO (from sensors module):
  'signal:face'  → { et, hpd, bra, landmarks, expressions, bbox }
  'signal:gaze'  → { gds, osr, x, y }
  'signal:audio' → { ves, pvs, silr, sr, transcript }
  'profile:selected' → { id, config }
  'session:end' → {}

EVENTS I EMIT:
  'signal:update' → { gds, osr, hpd, et, ves, pvs, silr, sr, bra, ces }
  'flag:fired' → { type, severity, timestamp, message }
  'intervention:trigger' → { action, message, color, duration, profile }
  'scores:update' → { eyeContact, headStability, vocalConfidence, speechClarity, overall, grade }

BUILD THESE MODULES IN THIS ORDER:

---

### 1. ProfileConfig
Three plain JS config objects. Each profile defines how the system behaves.

SPECIAL_NEEDS_TUTOR:
{
  id: 'special_needs',
  name: 'Special Needs Tutor',
  threshold_z: 1.8,
  ces_alert_level: 40,
  cooldown_seconds: 20,
  monitored_signals: ['gds', 'osr', 'hpd', 'et', 'bra'],
  interventions: {
    GAZE_ERRATIC: { action: 'focus_object', message: 'Let\'s take a breath and look at this shape.', duration: 3000 },
    GAZE_LOST: { action: 'focus_object', message: 'Look at the screen — find the shape!', duration: 3000 },
    ATTENTION_DROP: { action: 'content_swap', message: 'Let\'s try something different!' },
    STRESS_DETECTED: { action: 'break_timer', message: 'Time for a quick break!', duration: 30000 },
    FOCUS_DRIFT: { action: 'focus_object', message: 'Can you find the shape?', duration: 3000 },
    PROLONGED_SILENCE: { action: 'claude_response', message: 'You\'ve been quiet — need help?' },
  }
}

INTERVIEW_COACH:
{
  id: 'interview_coach',
  name: 'Interview Coach',
  threshold_z: 2.0,
  ces_alert_level: 35,
  cooldown_seconds: 15,
  monitored_signals: ['gds', 'osr', 'hpd', 'ves', 'pvs', 'sr', 'silr'],
  scored_metrics: true,
  interventions: {
    GAZE_ERRATIC: { action: 'banner', message: 'Maintain steady eye contact with the camera.', color: '#f59e0b', severity: 'medium' },
    GAZE_LOST: { action: 'banner', message: 'Look at the camera — your interviewer is here.', color: '#ef4444', severity: 'high' },
    STRESS_DETECTED: { action: 'banner', message: 'Take a breath. Slow down. You\'ve got this.', color: '#f59e0b', severity: 'medium' },
    SPEECH_PANIC: { action: 'banner', message: 'You\'re speaking very fast. Pause and collect your thoughts.', color: '#ef4444', severity: 'high' },
    PROLONGED_SILENCE: { action: 'claude_response', message: 'Looks like you\'re thinking — want a hint?' },
    OVERCONFIDENT_PACE: { action: 'banner', message: 'Great energy! Try varying your pace for emphasis.', color: '#3b82f6', severity: 'low' },
  }
}

LANGUAGE_TEACHER:
{
  id: 'language_teacher',
  name: 'Language Teacher',
  threshold_z: 2.0,
  ces_alert_level: 35,
  cooldown_seconds: 15,
  monitored_signals: ['et', 'pvs', 'silr', 'sr'],
  interventions: {
    STRESS_DETECTED: { action: 'content_swap', message: 'Let\'s simplify this. Try an easier sentence.' },
    FOCUS_DRIFT: { action: 'claude_response', message: 'Let me rephrase that differently.' },
    PROLONGED_SILENCE: { action: 'claude_response', message: 'Take your time. Want me to repeat?' },
    SPEECH_PANIC: { action: 'banner', message: 'Slow down — pronunciation is more important than speed.', color: '#f59e0b', severity: 'medium' },
  }
}

Expose: window.ProfileConfig = { SPECIAL_NEEDS_TUTOR, INTERVIEW_COACH, LANGUAGE_TEACHER, getById(id) }

---

### 2. AnomalyDetector (IIFE)
The core numeric engine.

State:
- One SignalBuffer(60) per signal: gds, osr, hpd, et, ves, pvs, silr, sr, bra
- latestSignals = {} (updated every time a signal event arrives)
- isCalibrating = true (first 30 seconds after session start)
- calibrationStartTime = null
- activeProfile = null

On 'profile:selected':
- Set activeProfile
- Reset all buffers and state

Subscribe to 'signal:face', 'signal:gaze', 'signal:audio':
- Store latest values in latestSignals
- Push each value into its respective SignalBuffer

Every 100ms (setInterval), run the detection cycle:
1. If calibrating and < 30 seconds have passed, just collect data, emit signal:update with ces=100, return
2. If calibrating and >= 30 seconds, set isCalibrating = false, emit 'calibration:complete' with type 'baseline'

3. Compute CES:
   CES = 100 - (gds*0.20 + osr*0.20 + hpd*0.15 + et*0.10 + ves*0.10 + pvs*0.10 + sr*0.10 + bra*0.05)
   Clamp to 0-100

4. Emit 'signal:update' with all current values + ces

5. Check flag conditions (only for signals in activeProfile.monitored_signals):

   GAZE_ERRATIC:    gds z-score > threshold_z for 3+ seconds → severity 'medium'
   GAZE_LOST:       osr > 80 for 5+ seconds → severity 'high'
   ATTENTION_DROP:  ces < activeProfile.ces_alert_level for 10+ seconds → severity 'high'
   STRESS_DETECTED: et z-score > threshold_z AND (ves z-score > threshold_z OR pvs z-score > threshold_z) for 5+ seconds → severity 'medium'
   FOCUS_DRIFT:     (gds z-score > threshold_z * 0.8) AND (hpd z-score > threshold_z * 0.8) for 8+ seconds → severity 'low'
   SPEECH_PANIC:    sr > 70 AND ves z-score > threshold_z for 3+ seconds → severity 'high'
   PROLONGED_SILENCE: silr > 80 for 15+ seconds → severity 'medium'
   OVERCONFIDENT_PACE: sr > 60 AND pvs < 10 for 10+ seconds → severity 'low'

   For sustained-duration tracking: keep a map of { flagType: firstTriggeredTime }. If condition is true and no entry exists, add one. If condition is true and enough time has passed, fire the flag and delete the entry. If condition becomes false, delete the entry.

6. When a flag fires: Bus.emit('flag:fired', { type, severity, timestamp: Date.now(), message })

Expose: window.AnomalyDetector = { init, start, stop, reset, isCalibrating, getCES }

---

### 3. InterventionDispatcher (IIFE)
Decides what to do when a flag fires.

State:
- lastInterventionTime = 0
- interventionLog = [] (for session summary)
- activeProfile = null

On 'profile:selected': set activeProfile, reset log
On 'flag:fired': 
  1. Check cooldown: if Date.now() - lastInterventionTime < activeProfile.cooldown_seconds * 1000, skip
  2. Look up intervention mapping: activeProfile.interventions[flag.type]
  3. If no mapping for this flag in this profile, skip
  4. Log it: interventionLog.push({ flag, intervention, timestamp })
  5. Set lastInterventionTime = Date.now()
  6. If action is 'claude_response': call ClaudeClient.generate(context)
  7. Otherwise: Bus.emit('intervention:trigger', { ...interventionConfig, profile: activeProfile.id })

Expose: window.InterventionDispatcher = { init, getLog, reset }

---

### 4. ClaudeClient (IIFE)
Minimal wrapper for the Anthropic API.

State:
- apiKey = null (set from UI input)
- conversationHistory = []

ClaudeClient.setApiKey(key): store it
ClaudeClient.generate(context):
  - context = { profile, signals, transcript, flagType, message }
  - Build a system prompt based on the active profile:
    - Special Needs: "You are a patient, encouraging tutor for a student with special needs. Use simple words. Be warm and reassuring. Keep responses under 2 sentences."
    - Interview Coach: "You are a professional interview coach. Give direct, actionable feedback. Reference specific behaviors (eye contact, pacing, filler words). Keep responses under 3 sentences."
    - Language Teacher: "You are a friendly language teacher. Simplify your vocabulary. If the student is struggling, rephrase or offer an easier alternative. Keep responses under 2 sentences."
  - Build user message incorporating signal data and transcript context
  - POST to https://api.anthropic.com/v1/messages with model 'claude-sonnet-4-20250514', max_tokens 150
  - Use streaming (stream: true) and emit chunks via Bus.emit('intervention:trigger', { action: 'claude_response', chunk, done })
  - If no API key or fetch fails, emit fallback text from the intervention mapping's message field
  - 3-second timeout: if no response in 3s, emit fallback

ClaudeClient.generateDebrief(sessionData):
  - For Interview Coach session end
  - Send full signal summary + transcript + intervention log
  - Ask Claude to write a professional debrief paragraph with scores and recommendations
  - Return the text (not streamed)

Expose: window.ClaudeClient = { setApiKey, generate, generateDebrief }

---

### 5. InterviewScorecard (IIFE)
Running scored metrics for the Interview Coach profile.

State:
- totalFrames, framesWithGoodEyeContact (osr < 30)
- hpdValues (array for averaging)
- fillerCount, wordCount (from transcript regex)
- All as running totals since session start

On each 'signal:update' (only when profile is interview_coach):
  - Track Eye Contact % = framesWithGoodEyeContact / totalFrames * 100
  - Track Head Stability = 100 - average(hpdValues) (clamp 0-100)

On each 'signal:audio':
  - Scan transcript for fillers: /\b(um|uh|like|you know|basically|actually|literally)\b/gi
  - wordCount = transcript.split(/\s+/).length
  - Vocal Confidence = 100 - pvs - silr * 0.5 (clamp 0-100)
  - Speech Clarity = 100 - sr - (fillerCount / Math.max(wordCount, 1)) * 100 (clamp 0-100)

Overall Score = eyeContact * 0.25 + headStability * 0.20 + vocalConfidence * 0.25 + speechClarity * 0.30
Letter Grade: A >= 85, B >= 70, C >= 55, D >= 40, F < 40

Emit 'scores:update' every 2 seconds with: { eyeContact, headStability, vocalConfidence, speechClarity, overall, grade }

Expose: window.InterviewScorecard = { init, reset, getScores }

---

### 6. SessionManager (IIFE)
Orchestrates the full session lifecycle.

State:
- sessionStartTime, sessionData

SessionManager.endSession():
  - Gather all data: signal history from AnomalyDetector, flag log from InterventionDispatcher, scores from InterviewScorecard, transcript from AudioEngine
  - Bus.emit('session:end', { summary })
  - If interview_coach profile, call ClaudeClient.generateDebrief(summary)
  - Return a JSON blob for export

Expose: window.SessionManager = { start, endSession, getSessionData }

---

At the top of brain.js add a comment: // === ADAPTIQ BRAIN MODULE === //
At the bottom, add a BrainManager:

window.BrainManager = {
  init(profileId) {
    const profile = ProfileConfig.getById(profileId);
    Bus.emit('profile:selected', { id: profileId, config: profile });
    AnomalyDetector.init(profile);
    InterventionDispatcher.init(profile);
    if (profileId === 'interview_coach') InterviewScorecard.init();
  },
  start() { AnomalyDetector.start(); },
  stop() { AnomalyDetector.stop(); },
  endSession() { return SessionManager.endSession(); }
}

Write the complete brain.js file. Make it production-quality but pragmatic — this is a hackathon. Add brief inline comments for non-obvious logic. Use try-catch to prevent crashes. All modules must work independently testable with fake Bus events.
```

---

## PERSON C — UI Engineer (Frontend + Visuals)

**Output file:** `ui.js` + `index.html` (the final shell)
**Works in folder:** `person-c/`

### Prompt to paste into Claude Code:

```
I'm building the complete UI layer for a browser-based biometric monitoring app called AdaptIQ. I need to produce TWO files:

1. index.html — the single-file app shell with all CSS, CDN imports, and HTML structure
2. ui.js — all the UI logic (screen transitions, charts, overlays, rendering)

Later, my teammates' code (sensors.js and brain.js) will be pasted into the index.html as additional <script> blocks. My code must not depend on theirs being loaded — I react to Bus events.

IMPORTANT CONSTRAINTS:
- Vanilla JS + vanilla CSS only. No React, no Tailwind, no build tools.
- CDN libraries I can use: Chart.js (for sparklines)
- All styling via <style> in index.html. Make it look POLISHED — this is a hackathon demo, presentation matters.
- Target screen: 1080p+ in Chrome fullscreen

EVENT BUS (include this in index.html before anything else):

const Bus = (() => {
  const subs = {};
  return {
    on(evt, fn) { (subs[evt] ||= []).push(fn); },
    off(evt, fn) { subs[evt] = (subs[evt] || []).filter(f => f !== fn); },
    emit(evt, data) { (subs[evt] || []).forEach(fn => fn(data)); }
  };
})();

EVENTS I SUBSCRIBE TO:
  'signal:update' → { gds, osr, hpd, et, ves, pvs, silr, sr, bra, ces }
  'signal:face'   → { et, hpd, bra, landmarks, expressions, bbox }
  'signal:gaze'   → { gds, osr, x, y }
  'flag:fired'    → { type, severity, timestamp, message }
  'intervention:trigger' → { action, message, color, duration, profile, chunk, done }
  'scores:update' → { eyeContact, headStability, vocalConfidence, speechClarity, overall, grade }
  'calibration:complete' → { type }
  'models:loaded'  → {}
  'session:end'    → { summary }

EVENTS I EMIT:
  'profile:selected' → { id }  (when user clicks a profile card)

---

### FILE 1: index.html structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AdaptIQ — Adaptive Learning Intelligence</title>
  
  <!-- CDN Dependencies -->
  <script src="https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js"></script>
  <script src="https://webgazer.cs.brown.edu/webgazer.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/meyda/dist/web/meyda.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  
  <style>
    /* ALL CSS HERE — Person C owns this entirely */
  </style>
</head>
<body>
  <!-- ALL HTML HERE -->
  
  <script>
    // === EVENT BUS === //
    // (paste the Bus code)
  </script>
  
  <script>
    // === SENSORS MODULE === //
    // (Person A pastes sensors.js here)
  </script>
  
  <script>
    // === BRAIN MODULE === //
    // (Person B pastes brain.js here)
  </script>
  
  <script>
    // === UI MODULE === //
    // (Person C pastes ui.js here)
  </script>
  
  <script>
    // === APP INIT === //
    // (Final wiring — startup sequence)
  </script>
</body>
</html>
```

---

### FILE 2: ui.js — BUILD THESE IN ORDER:

#### 1. Loading Screen
- Full-screen overlay shown on page load
- Centered app logo/title "AdaptIQ" in large display font
- Subtitle: "Adaptive Learning Intelligence"
- Progress bar that updates as models load
- Status text: "Loading face detection models..." → "Ready!"
- Subscribe to 'models:loaded' to dismiss after a short delay
- Design: dark background (#0a0a0f), accent color electric blue (#00d4ff), clean sans-serif font (use Google Fonts — load 'Space Grotesk' or 'Outfit')

#### 2. Profile Selection Screen
- Shown after loading completes
- API key input field at the top: labeled "Claude API Key (optional)", password-type input, stored in a global var
- Three large profile cards in a row:
  - 🧩 Special Needs Tutor — "Patient, adaptive support for neurodiverse learners"
  - 🎤 Interview Coach — "Real-time feedback on eye contact, speech, and confidence"
  - 🌍 Language Teacher — "Pronunciation and fluency coaching with live analysis"
- Cards should have hover effects (scale up, border glow)
- Clicking a card: save API key to window.claudeApiKey, emit 'profile:selected' with the profile id, transition to session screen
- Design: cards on a dark background, each card with subtle gradient border, emoji large (48px+), clean typography

#### 3. Session Screen (3-panel layout)
The main screen during an active session.

LEFT PANEL (30% width):
- <video> element showing webcam feed (mirrored with CSS transform: scaleX(-1))
- Canvas overlay on top of the video for:
  - Face bounding box (drawn from signal:face bbox data) — green rectangle
  - Gaze dot (drawn from signal:gaze x, y) — small blue circle
  - Landmark dots (optional, can be toggled)
- Label: "Live Feed" at top

CENTER PANEL (45% width):
- Content area for lesson text, Claude responses, intervention overlays
- Default content on start: a welcome message based on the profile
  - Special Needs: "Hi there! Let's learn together. 😊"
  - Interview Coach: "Let's practice your interview skills. Speak naturally to the camera."
  - Language Teacher: "Welcome! Let's practice together. Speak when you're ready."
- This panel is where content_swap and claude_response interventions render
- Chat bubble container for Claude responses (scrollable, newest at bottom)

RIGHT PANEL (25% width):
- Real-time signal dashboard
- 4 Chart.js sparkline charts stacked vertically:
  - CES (Composite Engagement Score) — line chart, green/yellow/red zones
  - GDS (Gaze Drift) — line chart
  - VES (Vocal Energy) — line chart
  - PVS (Pitch Variance) — line chart
- Each chart: small (height ~80px), no axes labels, just the line + colored background zones
- Keep last 100 data points per chart, shift left as new data arrives
- Below the charts (Interview Coach only): Scorecard panel showing:
  - Eye Contact: XX%
  - Head Stability: XX
  - Vocal Confidence: XX
  - Speech Clarity: XX
  - Overall: XX (Grade: A)
  - Subscribe to 'scores:update' for these values

BOTTOM BAR (full width, fixed height ~60px):
- Large CES number on the left (font-size 2em)
- CES color bar: horizontal gradient bar that fills based on CES value
  - 0-35: red (#ef4444), 35-65: yellow (#f59e0b), 65-100: green (#22c55e)
- Active flag badges on the right: small colored pills showing currently active flags
  - e.g., "GAZE_ERRATIC" in orange, "STRESS_DETECTED" in red
  - Clear a badge 10 seconds after the flag was fired
- "End Session" button on far right

#### 4. Intervention Overlays
Each is a reusable function callable by the Bus. Subscribe to 'intervention:trigger' and dispatch by action type.

A) showFocusObject(message, duration=3000):
   - Full center-panel overlay
   - Animated SVG: a rotating geometric shape (pentagon, hexagon, or star)
   - Pastel color, gentle rotation animation
   - Message text below the shape
   - Auto-dismiss after duration with fade-out

B) showBanner(message, color, duration=5000):
   - Slide in from top of the screen
   - Full-width banner, colored background (color param)
   - White text, dismiss X button + auto-dismiss after duration
   - Slide-out animation on dismiss

C) swapContent(message):
   - Fade out current center panel content
   - Fade in new content (the message text, styled as a card)
   - Stays until next swap or session end

D) showClaudeResponse(data):
   - If data.chunk: append text to the current chat bubble (streaming effect)
   - If data.done: finalize the bubble
   - If data.message (non-streaming fallback): show complete bubble immediately
   - Chat bubbles: rounded corners, slight shadow, left-aligned, "AdaptIQ" avatar label
   - New bubbles append to the chat container, auto-scroll to bottom

E) showBreakTimer(duration=30000):
   - Full-screen overlay (covers everything)
   - Large countdown timer in the center (MM:SS format)
   - "Time for a break! Move around." message
   - Calming background color (soft blue/green)
   - When timer reaches 0, auto-dismiss with fade

#### 5. Gaze Calibration Overlay
- Subscribe to a custom event or provide a function the sensor module can trigger
- Show a single dot (20px circle, bright color) that moves to 9 positions
- Positions: 3x3 grid with 10% margin (so [10%, 50%, 90%] × [10%, 50%, 90%])
- Instruction text: "Click each dot as it appears"
- Each dot stays for 2s or until clicked, then moves to next position
- After all 9, fade out the overlay
- Provide element ID: 'gaze-calibration-overlay'

#### 6. Baseline Calibration Screen
- After gaze calibration, show a centered message: "Calibrating baseline... sit naturally for 30 seconds"
- Progress bar that fills over 30 seconds
- Subscribe to 'calibration:complete' with type 'baseline' to dismiss

#### 7. Session End Screen
- Subscribe to 'session:end'
- Full-screen overlay with session summary
- Show: session duration, total flags fired, CES average
- If Interview Coach: show final scorecard with letter grade (large, centered)
- If Claude debrief is available: show it in a styled text block
- "Export Report" button: when clicked, emit an event or call SessionManager.getSessionData(), convert to JSON, trigger browser download as 'adaptiq_report.json'
- "New Session" button: reload the page

---

### DESIGN SYSTEM:

Colors:
- Background: #0a0a0f (near black)
- Surface: #141420 (dark card background)
- Surface hover: #1e1e30
- Border: #2a2a3a
- Text primary: #e4e4e7
- Text secondary: #a1a1aa
- Accent: #00d4ff (electric blue)
- Success: #22c55e
- Warning: #f59e0b
- Danger: #ef4444
- CES gradient: danger → warning → success

Typography:
- Load from Google Fonts: 'Outfit' for headings, 'DM Sans' for body
- Or any clean modern sans-serif that looks good

Spacing:
- Use 8px grid (8, 16, 24, 32, 48px)
- Cards: 16px padding, 8px border-radius
- Panels: 12px gap between them

Animations:
- All transitions: 0.3s ease
- Overlays: fade in 0.3s, fade out 0.3s
- Banner: slide from translateY(-100%) to translateY(0)
- Focus object SVG: rotate 360deg over 4s, infinite

---

### IMPORTANT IMPLEMENTATION NOTES:

- The video element needs specific attributes: autoplay, playsinline, muted
- Mirror the webcam with CSS: transform: scaleX(-1)
- The canvas overlay for face bbox + gaze dot must be positioned absolutely on top of the video, same dimensions
- Chart.js sparklines: use type 'line', no legend, no axes, small pointRadius, tension 0.4 for smooth curves, transparent background
- For the charts, create them once on session screen mount, then call chart.data.datasets[0].data.push(newValue) + chart.update('none') for performance
- All overlay functions should check if an overlay is already showing and dismiss it before showing a new one (prevent stacking)
- The center panel chat container should have overflow-y: auto and max-height so it scrolls

Write both files completely. The index.html should be ready to open in a browser and show the loading screen → profile selection flow even without the sensors and brain modules loaded. Use placeholder/mock data for the charts and scorecard so the UI can be demoed standalone.

Make it look AMAZING. This is a hackathon — the demo is everything. Dark theme, glowing accents, smooth animations, professional feel. Think "NASA mission control meets modern SaaS dashboard."
```

---

## MERGE INSTRUCTIONS (After all 3 are done)

When all three people have their files ready:

1. Person C opens their `index.html`
2. Person A's `sensors.js` content gets pasted into the `// === SENSORS MODULE ===` script block
3. Person B's `brain.js` content gets pasted into the `// === BRAIN MODULE ===` script block
4. Add a final `// === APP INIT ===` script block at the bottom:

```js
// === APP INIT === //
(async () => {
  const videoEl = document.getElementById('webcam-video');
  
  // Wait for models to load
  await SensorManager.init(videoEl);
  Bus.emit('models:loaded', {});
  
  // When profile is selected, wire everything up
  Bus.on('profile:selected', async ({ id }) => {
    if (window.claudeApiKey) ClaudeClient.setApiKey(window.claudeApiKey);
    BrainManager.init(id);
    
    // Start gaze calibration
    await SensorManager.startCalibration();
    
    // Start sensors + brain (baseline calibration runs automatically)
    SensorManager.start();
    BrainManager.start();
  });
  
  // End session button
  document.getElementById('end-session-btn')?.addEventListener('click', () => {
    SensorManager.stop();
    const report = BrainManager.endSession();
    Bus.emit('session:end', { summary: report });
  });
})();
```

5. Test in Chrome. Open DevTools console. Check for errors.
6. Test each profile: cover camera, look away, go silent, speak fast.

---

## TIMELINE

| Time | Person A | Person B | Person C |
|------|----------|----------|----------|
| 0:00–0:30 | Agree on Bus contract + event names | Write Bus + share | Create index.html shell |
| 0:30–3:00 | SignalBuffer + FaceEngine | ProfileConfig + AnomalyDetector | Loading screen + Profile selection + Session layout |
| 3:00–5:00 | GazeEngine + calibration | InterventionDispatcher + ClaudeClient | Charts + Intervention overlays |
| 5:00–7:00 | AudioEngine + SensorManager | InterviewScorecard + SessionManager | Calibration screens + Session end screen + polish |
| 7:00–8:00 | ALL THREE: merge into index.html, test, fix bugs |
| 8:00–9:00 | ALL THREE: end-to-end test each profile, fix integration issues |
| 9:00–10:00 | ALL THREE: demo rehearsal, backup plan if gaze fails |
