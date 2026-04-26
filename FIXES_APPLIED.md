# AdaptIQ — Fixes Applied

## CRITICAL ISSUES FIXED ✅

### 1. **Gaze Calibration Never Runs** ✅ FIXED
**Issue:** GazeEngine never gets a proper iris baseline, defaulting to center screen
**Root Cause:** `SensorManager.startCalibration()` was never called in the main app
**Fix Applied:**
- Added `await SensorManager.startCalibration()` call in APP INIT after sensors initialize
- This triggers GazeEngine's 3-second overlay calibration (separate from UI visual animation)
- Iris baseline is now captured before sensors start emitting signals

**Files Modified:** `index.html` (APP INIT, lines ~2625-2630)

---

### 2. **Duplicate Camera/Audio Permission Requests** ✅ FIXED
**Issue:** Browser shows separate permission dialogs for camera and microphone
**Root Cause:**
- `ui.js` called `getUserMedia({ video: {...}, audio: false })`
- `sensors.js` called `getUserMedia({ audio: true, video: false })`
**Fix Applied:**
- Consolidated into single `getUserMedia({ video: {...}, audio: true })` call in APP INIT
- mediaStream is passed to SensorManager and then to AudioEngine
- ui.js fallback only requests video if stream not already set (for backward compatibility)
- AudioEngine.init() accepts optional mediaStream parameter

**Files Modified:**
- `index.html` (APP INIT, lines ~2590-2605; AudioEngine.init signature)
- `index.html` (SensorManager.init signature)
- `ui.js` (initVideoFeed, added idempotency check)

---

### 3. **Error Handling for Missing Permissions** ✅ FIXED
**Issue:** Silent failures if user denies camera/mic, no user feedback
**Root Cause:** Try/catch logged warning but continued as if sensors initialized
**Fix Applied:**
- APP INIT now catches `NotAllowedError` specifically
- Shows user-friendly error message in event log
- Distinguishes between permission denied vs other init failures
- UI still advances so user can refresh and retry

**Files Modified:** `index.html` (APP INIT error handling, lines ~2625-2635)

---

### 4. **ClaudeClient SSE Timeout Too Aggressive** ✅ FIXED
**Issue:** 3-second timeout fired too quickly, falling back to static message
**Root Cause:** Hard timeout regardless of whether response was streaming
**Fix Applied:**
- Increased timeout from 3 seconds to 15 seconds
- Only triggers fallback if NO chunks received (not just slow response)
- Added `receivedFirstChunk` flag to track if any data arrived
- Once first chunk arrives, timer no longer triggers fallback
- Added console warning when fallback activates

**Files Modified:** `index.html` (ClaudeClient.generate, lines ~2366-2425)

---

## MODERATE ISSUES FIXED ✅

### 5. **Audio Transcript Never Cleared** ✅ FIXED
**Issue:** Transcript from old sessions leaks into new sessions
**Root Cause:** `fullTranscript` module variable accumulated forever
**Fix Applied:**
- Added `reset()` method to AudioEngine
- Clears `fullTranscript`, `wordTimestamps`, and `silenceWindows`
- Called at start of each new session in APP INIT

**Files Modified:**
- `index.html` (AudioEngine, lines ~2056-2062)
- `perception/sensors.js` (AudioEngine, lines ~511-519)
- `index.html` (APP INIT, new call to `AudioEngine.reset()`)

---

### 6. **CDN Issue: MediaPipe FaceMesh Missing** ✅ FIXED (Previous Session)
**Issue:** WebGazer loaded instead of MediaPipe FaceMesh → gaze tracking broken
**Status:** Already fixed in prior session
- Added: `<script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js" crossorigin="anonymous"></script>`
- Removed unused WebGazer CDN tag

**Files Modified:** `index.html` (lines 8-12)

---

## REMAINING MODERATE ISSUES (Not Fixed — Lower Priority)

### Issue #7: InterviewScorecard Initialization Race Condition
- Only initialized if profile === 'interview_coach'
- Listener setup incomplete for other profiles
- **Workaround:** Always use interview_coach profile to get scores
- **Future Fix:** Initialize InterviewScorecard for all profiles, filter output

### Issue #8: Calibration Stage Updates Unreliable
- UI calibration stages advance visually but not in sync with actual sensor calibration
- FaceEngine/AudioEngine don't emit `calibration:complete` events
- **Workaround:** Visual animation completes at fixed time (30s)
- **Future Fix:** Emit calibration events from each engine

### Issue #9: AnomalyDetector Baseline Calibration Not User-Visible
- 30-second baseline window runs silently
- No indication to user that statistical baseline is building
- **Workaround:** Keep app open during calibration screen
- **Future Fix:** Sync UI animation to actual AnomalyDetector calibration window

### Issue #10: No API Key Validation at Startup
- Key only validated when first `claude_response` intervention fires
- No feedback if key is expired/invalid at boot
- **Workaround:** Trigger an intervention manually to test
- **Future Fix:** Validate key with test request on page load

### Issue #11: Iris Detection Fragile
- If iris landmarks missing, GDS/OSR hold last value instead of resetting to 0
- User might think tracking is working when eyes left frame
- **Workaround:** Check that gaze dot moves on dashboard
- **Future Fix:** Reset GDS/OSR to 0 on detection loss

---

## TEST CHECKLIST

### ✅ Gaze Calibration
- [ ] Select a profile
- [ ] GazeEngine calibration overlay should appear (3-second "look at dot")
- [ ] After overlay closes, gaze dot should appear on dashboard
- [ ] Gaze metrics (GDS, OSR) should update as you move eyes

### ✅ Camera/Audio Permissions
- [ ] Only ONE permission dialog should appear (combined request)
- [ ] If user denies, error message appears in event log
- [ ] Both video and audio stream should be shared

### ✅ Claude API
- [ ] Trigger PROLONGED_SILENCE or FOCUS_DRIFT flag
- [ ] Chat bubble should appear with streamed response
- [ ] Response should complete even on slow networks (15s timeout)
- [ ] If key invalid, fallback message appears after 15s

### ✅ Audio Transcript
- [ ] End first session
- [ ] Start second session
- [ ] Transcript should NOT include words from first session

### ✅ Brain Module
- [ ] Integration test harness: `integration/test.html`
- [ ] Select profile, emit signals via sliders
- [ ] Flags should fire after threshold + duration
- [ ] Interventions should route correctly (banner vs claude_response)

### ✅ Sensors Module
- [ ] Sensors test harness: `perception/test.html`
- [ ] Init sensors → Face/Gaze/Audio signals should stream
- [ ] All 9 signal values (GDS, OSR, HPD, ET, BRA, VES, PVS, SilR, SR) should update

---

## DEPLOYMENT NOTES

### GitHub Pages Requirement
- HTTPS is **required** (for SpeechRecognition, camera/mic, and Anthropic API)
- `file://` protocol will not work
- Test locally with a simple HTTP server: `python -m http.server 8000`

### Browser Compatibility
- **Chrome/Chromium:** Full support
- **Edge:** Full support
- **Safari:** Supported (use webkitSpeechRecognition for speech)
- **Firefox:** Lacks SpeechRecognition API — SR features unavailable

### CDN Availability
- All models are cached. If CDN (JSDelivr) is unavailable:
  - face-api models fail to load → app doesn't reach dashboard
  - MediaPipe models fail → gaze disabled (app continues)
  - Meyda fails → audio analysis disabled (app continues)

---

## Summary of Changes

| File | Lines | Change |
|------|-------|--------|
| `index.html` | ~30 | APP INIT: consolidated permissions, added gaze calibration, reset audio, better error handling |
| `index.html` | ~5 | AudioEngine.init: accept optional mediaStream param |
| `index.html` | ~8 | AudioEngine: add reset() method |
| `index.html` | ~5 | ClaudeClient.generate: increase timeout, only trigger fallback if no data |
| `index.html` | ~1 | SensorManager.init: accept mediaStream param |
| `ui.js` | ~5 | initVideoFeed: check if stream already set (idempotency) |
| `perception/sensors.js` | ~8 | AudioEngine.init: accept optional mediaStream, add reset() |

**Total changes:** ~62 lines across 3 files

---

## Next Steps / Future Work

1. **Before Production:**
   - [ ] Test on slow networks (throttle to 2G in DevTools)
   - [ ] Test with all profiles (adhd, anxiety, asd, interview_coach, language_teacher)
   - [ ] Verify all 8 flag types fire correctly
   - [ ] Test session export / debrief generation

2. **Polish / Enhancement:**
   - [ ] Fix InterviewScorecard initialization for all profiles
   - [ ] Sync calibration UI to actual sensor calibration
   - [ ] Add API key validation on boot
   - [ ] Improve iris detection robustness

3. **Monitoring:**
   - [ ] Add error reporting (Sentry, etc.)
   - [ ] Log API failures for debugging
   - [ ] Track session duration and flag frequency

