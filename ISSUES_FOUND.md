# AdaptIQ Codebase Issues Found

## CRITICAL ISSUES (Blocks features)

### 1. **Gaze Calibration Never Runs** ⚠️ CRITICAL
**Location:** `index.html` APP INIT (line 2586-2609), `ui.js` startCalibrationAnimation
**Problem:** 
- `SensorManager.startCalibration()` is never called in the main app
- The visual calibration animation in ui.js (startCalibrationAnimation) is purely visual — it doesn't trigger GazeEngine's actual iris baseline calibration
- Result: GazeEngine defaults baseline to `{ avgX: 0.5, avgY: 0.5 }`, making gaze tracking completely inaccurate
- GDS and OSR will be unreliable; gaze-based flags won't fire correctly

**Fix:** Call `await SensorManager.startCalibration()` during the calibration screen, or trigger it automatically when the dashboard loads.

---

### 2. **Duplicate Camera/Audio Permission Requests** 🔴 HIGH
**Location:** `ui.js` initVideoFeed (line 347) + `sensors.js` AudioEngine.init (line 432)
**Problem:**
- ui.js calls `getUserMedia({ video: {...}, audio: false })` 
- sensors.js calls `getUserMedia({ audio: true, video: false })`
- Two separate permission flows → browser may show permission dialog twice, confusing users
- If user grants camera to UI but denies mic to AudioEngine (or vice versa), one module will fail silently
- Risk of race conditions if both try to access device simultaneously

**Fix:** Consolidate: request both video + audio in one `getUserMedia` call, then share the stream to both engines.

---

### 3. **No Error Handling for Missing Permissions** 🔴 HIGH
**Location:** `index.html` APP INIT (line 2603) + `ui.js` initVideoFeed (line 347)
**Problem:**
- If `getUserMedia` fails (user denies camera/mic), the code logs a warning but continues
- Sensors won't emit any signals, but anomaly detection keeps running → no flags will ever fire
- UI shows "No Face Detected" indefinitely, user has no clear feedback

**Fix:** 
- Detect permission failure and show a prominent error dialog
- Disable the "End Session" button until sensors are initialized

---

### 4. **ClaudeClient SSE Timeout Too Aggressive** 🟡 MEDIUM
**Location:** `integration/brain.js` ClaudeClient.generate (line 343-347)
**Problem:**
- 3-second fallback timeout for Anthropic API
- If network is slow or request takes >3s, fallback fires with the static message instead of streaming response
- No retry logic — if first chunk takes 3+ seconds, you miss the whole response

**Fix:** Increase timeout to 10-15 seconds, or only trigger fallback if no chunks arrive (not if stream completes slowly).

---

## MODERATE ISSUES (Degrades features)

### 5. **InterviewScorecard Only Initialized for interview_coach Profile**
**Location:** `integration/brain.js` BrainManager.init (line 603)
**Problem:**
- `InterviewScorecard.init()` only called if `profileId === 'interview_coach'`
- For other profiles, scores are not computed
- If you switch from interview_coach → special_needs → back to interview_coach, stale listeners might remain from first init

**Fix:** Always initialize InterviewScorecard, let it subscribe to all profiles' signals. Filter emission only if not interview_coach.

---

### 6. **SessionManager.endSession() Called Twice Possible**
**Location:** `ui.js` endSession (line 309-324) vs `index.html` btn-end-session click handler (line 2613)
**Problem:**
- ui.js calls `Bus.emit('session:end', {})` then `endSession()`
- Listener in ui.js (line 908) also responds to `session:end` → could cause double cleanup
- `BrainManager.endSession()` is idempotent but redundant calls to SessionManager.endSession() could cause issues

**Fix:** Refactor: either emit `session:end` and let listeners respond, OR call endSession() directly (not both).

---

### 7. **Calibration Stage Updates Unreliable**
**Location:** `ui.js` updateCalibrationStage (line 249-277)
**Problem:**
- Relies on `calibration:complete` Bus event with `type: 'face'`, `'gaze'`, `'audio'`
- Only `GazeEngine.startCalibration()` emits `calibration:complete` (line 360 in sensors.js)
- FaceEngine never emits this event (it emits `models:loaded` instead)
- AudioEngine never emits this event
- Result: calibration animation completes visually but the stage indicators show outdated statuses

**Fix:** Emit `calibration:complete` from FaceEngine and AudioEngine, OR auto-advance stages based on which engines are ready.

---

### 8. **AnomalyDetector Baseline Calibration Not User-Visible**
**Location:** `integration/brain.js` AnomalyDetector.init (line 207-209)
**Problem:**
- 30-second baseline calibration window runs silently in AnomalyDetector (line 171-177)
- UI animation shows 30 seconds but it's just visual spinning dots, not actual calibration
- If user closes app during this 30s window, anomaly detection is unreliable (stats are incomplete)
- No user feedback that baseline is building

**Fix:** Either sync the UI animation to AnomalyDetector's actual 30s window, or make calibration explicit (button to start, show countdown).

---

### 9. **ProfileConfig Missing Profile ID Mapping for UI IDs**
**Location:** `integration/brain.js` ProfileConfig._byId (line 57-61)
**Problem:**
- UI card data-ids are `adhd`, `anxiety`, `asd`
- Brain profiles are `special_needs`, `interview_coach`, `language_teacher`
- These are mapped at emit time in `ui.js` (line 115 emits `{ id }` which is the data-id)
- But `ProfileConfig.getById()` doesn't have aliases for UI IDs anymore (previous fix added them to index.html ProfileConfig copy, not sensors.js)
- **Check:** Are the aliases present in the index.html ProfileConfig copy?

**Current state:** Need to verify if aliases are present in the inlined ProfileConfig in index.html.

---

### 10. **No Feedback on API Key Validation**
**Location:** `index.html` APP INIT (line 2576-2578)
**Problem:**
- API key is set but never validated
- If key is invalid/expired, user only discovers this when a `claude_response` intervention tries to fire (3s later)
- No feedback on whether key is correct at app start

**Fix:** Validate key on page load with a test request, show indicator (green ✓ or red ✗).

---

### 11. **GazeEngine Iris Detection Fragile**
**Location:** `sensors.js` GazeEngine._onResults (line 234-243)
**Problem:**
- If iris landmarks (468, 473) are not in frame, function returns early silently
- GDS/OSR stay at last value (not reset to 0)
- User might think gaze is being tracked when eyes are outside camera frame

**Fix:** Reset GDS/OSR to 0 if irises not detected, instead of holding last value.

---

### 12. **No Session Data Export Format Validation**
**Location:** `ui.js` exportReport (line 876-891)
**Problem:**
- Exports raw JSON of current state
- No version number or schema info
- Old exported sessions from v1 won't be compatible if schema changes

**Fix:** Add `version: "1.0"` and `schema: "adaptiq-session"` to export format.

---

## MINOR ISSUES (Polish)

### 13. **Intervention Progress Bar Uses `requestAnimationFrame` Without Cleanup**
**Location:** `ui.js` scheduleInterventionDismiss (line 773-774)
**Problem:**
- Uses `requestAnimationFrame` to trigger bar animation
- If another intervention is scheduled before bar completes, rAF might fire twice
- Minor visual glitch, not functional issue

---

### 14. **Audio Transcript Never Cleared Between Sessions**
**Location:** `sensors.js` AudioEngine (line 388)
**Problem:**
- `fullTranscript` is module-scoped and accumulates forever
- Session 1 transcript: "Hello world"
- Session 2 transcript: "Hello world Goodbye" (includes session 1 text)
- Fixed in SessionManager by slicing `.slice(-2000)` but underlying issue remains

**Fix:** Call `AudioEngine.reset()` at start of each session to clear fullTranscript.

---

### 15. **No Maximum Session Duration**
**Location:** `SessionManager.start()` (line 2523)
**Problem:**
- Sessions can run indefinitely
- No warning if session exceeds expected duration (e.g. >1 hour)
- App state might accumulate data forever

**Fix:** Optional: add session max duration with warning at 80% threshold.

---

## DEPENDENCIES / CDN ISSUES

### 16. **Face Mesh CDN Now Correct (Previously Missing)**
**Status:** ✅ FIXED in this session
- MediaPipe FaceMesh was missing, WebGazer was loaded instead
- Added correct MediaPipe CDN tag (line 10 in index.html)
- Removed unused WebGazer

---

## SUMMARY

| Severity | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟡 High | 2 |
| 🟠 Moderate | 7 |
| 🟢 Minor | 3 |
| **Total** | **16** |

## Recommended Fix Priority

1. **Gaze Calibration** → gaze features won't work without it
2. **Camera/Audio Permission** → required for session to start
3. **Error Handling** → users need feedback on failures
4. **SSE Timeout** → Claude responses unreliable on slow networks
5. **Calibration Stages** → UI feedback issues

