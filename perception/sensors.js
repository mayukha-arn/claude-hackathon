// === ADAPTIQ SENSORS MODULE === //

// ─── SignalBuffer ────────────────────────────────────────────────────────────
class SignalBuffer {
  constructor(windowSize = 60) {
    this._size = windowSize;
    this._buf = [];
  }

  push(value) {
    this._buf.push(value);
    if (this._buf.length > this._size) this._buf.shift();
  }

  values() { return [...this._buf]; }

  mean() {
    if (!this._buf.length) return 0;
    return this._buf.reduce((a, b) => a + b, 0) / this._buf.length;
  }

  stddev() {
    if (this._buf.length < 2) return 0;
    const m = this.mean();
    const variance = this._buf.reduce((sum, v) => sum + (v - m) ** 2, 0) / this._buf.length;
    return Math.sqrt(variance);
  }

  // z-score of a new incoming value relative to the current buffer
  zScore(currentValue) {
    const sd = this.stddev();
    if (sd === 0) return 0;
    return (currentValue - this.mean()) / sd;
  }
}

window.SignalBuffer = SignalBuffer;

// ─── FaceEngine ──────────────────────────────────────────────────────────────
const FaceEngine = (() => {
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

  let videoEl = null;
  let running = false;
  let rafId = null;
  let latest = {};

  // Smoothing buffers
  const etBuf  = new SignalBuffer(60);
  const hpdBuf = new SignalBuffer(60);
  const braBuf = new SignalBuffer(60);

  // Blink state
  let blinkCount = 0;
  let blinkTimestamps = [];   // rolling 60-second window of blink times
  let earBelow = 0;           // consecutive frames with EAR < threshold
  const EAR_THRESHOLD = 0.21;
  const BLINK_MIN_FRAMES = 2;

  // Euclidean distance between two landmark points {x, y}
  function dist(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  }

  // Eye Aspect Ratio for one eye (6 landmark indices)
  function eyeAspectRatio(pts) {
    // pts[0]=p1(corner), pts[1]=p2, pts[2]=p3, pts[3]=p4(corner), pts[4]=p5, pts[5]=p6
    const vertical1 = dist(pts[1], pts[5]);
    const vertical2 = dist(pts[2], pts[4]);
    const horizontal = dist(pts[0], pts[3]);
    return (vertical1 + vertical2) / (2 * horizontal);
  }

  function computeET(expressions) {
    const neutral = expressions?.neutral ?? 1;
    const raw = (1 - neutral) * 100;
    etBuf.push(raw);
    return Math.round(etBuf.mean());
  }

  function computeHPD(landmarks) {
    try {
      const pts = landmarks.positions;
      const noseTip   = pts[30];
      const leftEdge  = pts[0];
      const rightEdge = pts[16];

      const noseToLeft  = dist(noseTip, leftEdge);
      const noseToRight = dist(noseTip, rightEdge);
      // Yaw: 0 when perfectly centred (ratio = 1)
      const yawRatio = noseToLeft / (noseToRight + 1e-6);
      const yaw = Math.abs(yawRatio - 1) * 100; // 0 = centre, larger = turned

      // Pitch: vertical displacement of nose relative to mid-eye line
      const leftEye  = pts[36];
      const rightEye = pts[45];
      const eyeMidY  = (leftEye.y + rightEye.y) / 2;
      const eyeSpan  = dist(leftEye, rightEye);
      const pitch = Math.abs(noseTip.y - eyeMidY) / (eyeSpan + 1e-6) * 100;

      const raw = Math.min(100, Math.sqrt(yaw ** 2 + pitch ** 2));
      hpdBuf.push(raw);
      return Math.round(hpdBuf.mean());
    } catch {
      return 0;
    }
  }

  function computeBRA(landmarks) {
    try {
      const pts = landmarks.positions;
      const leftEyePts  = [pts[36], pts[37], pts[38], pts[39], pts[40], pts[41]];
      const rightEyePts = [pts[42], pts[43], pts[44], pts[45], pts[46], pts[47]];
      const ear = (eyeAspectRatio(leftEyePts) + eyeAspectRatio(rightEyePts)) / 2;

      if (ear < EAR_THRESHOLD) {
        earBelow++;
      } else {
        if (earBelow >= BLINK_MIN_FRAMES) {
          blinkTimestamps.push(Date.now());
        }
        earBelow = 0;
      }

      // Purge blinks older than 60 seconds
      const now = Date.now();
      blinkTimestamps = blinkTimestamps.filter(t => now - t < 60000);
      const blinksPerMin = blinkTimestamps.length;

      // BRA: deviation from normal rate ~17 bpm
      const raw = Math.min(100, Math.abs(blinksPerMin - 17) / 17 * 100);
      braBuf.push(raw);
      return Math.round(braBuf.mean());
    } catch {
      return 0;
    }
  }

  const zero = () => ({ et: 0, hpd: 0, bra: 0, landmarks: null, expressions: null, bbox: null });

  async function init(video) {
    videoEl = video;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    Bus.emit('models:loaded', {});
  }

  function _loop() {
    if (!running) return;
    rafId = requestAnimationFrame(async () => {
      try {
        const detection = await faceapi
          .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceExpressions();

        if (!detection) {
          latest = zero();
          Bus.emit('signal:face', latest);
        } else {
          const et  = computeET(detection.expressions);
          const hpd = computeHPD(detection.landmarks);
          const bra = computeBRA(detection.landmarks);
          const bbox = detection.detection.box;
          latest = { et, hpd, bra, landmarks: detection.landmarks, expressions: detection.expressions, bbox };
          Bus.emit('signal:face', latest);
        }
      } catch (err) {
        console.warn('[FaceEngine] frame error:', err);
      }
      _loop();
    });
  }

  function start() { running = true; _loop(); }
  function stop()  { running = false; if (rafId) cancelAnimationFrame(rafId); }
  function getLatest() { return latest; }

  return { init, start, stop, getLatest };
})();

window.FaceEngine = FaceEngine;

// ─── GazeEngine ──────────────────────────────────────────────────────────────
// Uses MediaPipe Face Mesh iris landmarks instead of WebGazer.
// No clicking required — calibration is "look straight ahead for 3 seconds."
const GazeEngine = (() => {
  let faceMesh = null;
  let videoEl  = null;
  let loopId   = null;
  let running  = false;
  let latest   = { gds: 0, osr: 0, x: 0, y: 0 };

  // Calibration: baseline iris position when looking straight at camera
  let baseline     = null;
  let calibrating  = false;
  let calibSamples = [];

  const xBuf = new SignalBuffer(30);
  const yBuf = new SignalBuffer(30);
  const gazeHistory = [];

  // MediaPipe 478-landmark indices (refineLandmarks: true)
  const L_IRIS = 468, R_IRIS = 473;
  const L_OUTER = 33,  L_INNER = 133, L_TOP = 159, L_BOT = 145;
  const R_INNER = 362, R_OUTER = 263, R_TOP = 386, R_BOT = 374;

  // Returns normalised iris position within each eye (0=edge, 0.5=centre, 1=other edge)
  function _irisRatio(lm) {
    const lx = (lm[L_IRIS].x - lm[L_OUTER].x) / (lm[L_INNER].x - lm[L_OUTER].x + 1e-6);
    const ly = (lm[L_IRIS].y - lm[L_TOP].y)   / (lm[L_BOT].y   - lm[L_TOP].y   + 1e-6);
    const rx = (lm[R_IRIS].x - lm[R_INNER].x) / (lm[R_OUTER].x - lm[R_INNER].x + 1e-6);
    const ry = (lm[R_IRIS].y - lm[R_TOP].y)   / (lm[R_BOT].y   - lm[R_TOP].y   + 1e-6);
    return { avgX: (lx + rx) / 2, avgY: (ly + ry) / 2 };
  }

  // Maps iris deviation from baseline to screen pixel coordinates
  function _irisToScreen(iris) {
    if (!baseline) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const dx = iris.avgX - baseline.avgX;
    const dy = iris.avgY - baseline.avgY;
    // ±0.15 iris ratio = full half-screen  →  scale = (W/2) / 0.15
    const sx = window.innerWidth  / 2 + dx * (window.innerWidth  / 0.3);
    const sy = window.innerHeight / 2 + dy * (window.innerHeight / 0.3);
    return {
      x: Math.max(0, Math.min(window.innerWidth,  sx)),
      y: Math.max(0, Math.min(window.innerHeight, sy)),
    };
  }

  function _onResults(results) {
    if (!results.multiFaceLandmarks?.length) return;
    const lm = results.multiFaceLandmarks[0];
    if (!lm[L_IRIS] || !lm[R_IRIS]) return; // iris not in this frame

    const iris = _irisRatio(lm);

    if (calibrating) {
      calibSamples.push(iris);
      return;
    }

    if (!running) return;

    const { x, y } = _irisToScreen(iris);
    xBuf.push(x);
    yBuf.push(y);

    const diag = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2);
    const gds  = Math.min(100,
      Math.sqrt(xBuf.stddev() ** 2 + yBuf.stddev() ** 2) / diag * 100
    );

    gazeHistory.push({ x, y });
    if (gazeHistory.length > 60) gazeHistory.shift();

    const mX = window.innerWidth  * 0.2;
    const mY = window.innerHeight * 0.2;
    const outside = gazeHistory.filter(p =>
      p.x < mX || p.x > window.innerWidth  - mX ||
      p.y < mY || p.y > window.innerHeight - mY
    ).length;
    const osr = (outside / gazeHistory.length) * 100;

    latest = { gds: Math.round(gds), osr: Math.round(osr), x, y };
    Bus.emit('signal:gaze', latest);
  }

  async function init(video) {
    videoEl = video;

    if (typeof FaceMesh === 'undefined') {
      console.warn('[GazeEngine] MediaPipe FaceMesh not loaded — gaze disabled');
      return;
    }

    faceMesh = new FaceMesh({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`
    });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,   // enables iris landmarks 468-477
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    faceMesh.onResults(_onResults);

    // Warm up the model
    await faceMesh.initialize();

    // Start a low-frequency loop (10fps is plenty for gaze)
    loopId = setInterval(async () => {
      if (videoEl.readyState >= 2) {
        try { await faceMesh.send({ image: videoEl }); }
        catch (e) { console.warn('[GazeEngine] send error:', e); }
      }
    }, 100);
  }

  function startCalibration() {
    return new Promise((resolve) => {
      calibrating  = true;
      calibSamples = [];

      const overlay = document.createElement('div');
      overlay.id = 'gaze-calibration-overlay';
      overlay.style.cssText = `
        position:fixed;inset:0;z-index:9999;background:rgba(10,10,15,0.95);
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;
      `;

      const msg = document.createElement('p');
      msg.style.cssText = `color:#e4e4e7;font-size:1.3rem;font-family:sans-serif;text-align:center;`;
      msg.textContent = 'Look at the dot and stay still';

      const dot = document.createElement('div');
      dot.style.cssText = `
        width:28px;height:28px;border-radius:50%;
        background:#00d4ff;box-shadow:0 0 24px #00d4ff;
      `;

      const track = document.createElement('div');
      track.style.cssText = `width:280px;height:6px;background:#2a2a3a;border-radius:3px;overflow:hidden;`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:0%;background:#00d4ff;transition:width 0.1s linear;`;
      track.appendChild(fill);

      const sub = document.createElement('p');
      sub.style.cssText = `color:#a1a1aa;font-size:0.9rem;font-family:sans-serif;`;
      sub.textContent = 'Capturing your eye baseline…';

      overlay.append(msg, dot, track, sub);
      document.body.appendChild(overlay);

      const DURATION = 3000;
      const start = Date.now();

      const tick = setInterval(() => {
        const elapsed = Date.now() - start;
        fill.style.width = Math.min(100, elapsed / DURATION * 100) + '%';

        if (elapsed >= DURATION) {
          clearInterval(tick);
          calibrating = false;

          // Average samples as the "looking straight" baseline
          if (calibSamples.length > 5) {
            baseline = {
              avgX: calibSamples.reduce((s, v) => s + v.avgX, 0) / calibSamples.length,
              avgY: calibSamples.reduce((s, v) => s + v.avgY, 0) / calibSamples.length,
            };
          } else {
            baseline = { avgX: 0.5, avgY: 0.5 }; // fallback if no face detected
          }

          document.body.removeChild(overlay);
          Bus.emit('calibration:complete', { type: 'gaze' });
          resolve();
        }
      }, 100);
    });
  }

  function start() { running = true; }
  function stop()  {
    running = false;
    if (loopId) { clearInterval(loopId); loopId = null; }
  }
  function getLatest() { return latest; }

  return { init, startCalibration, start, stop, getLatest };
})();

window.GazeEngine = GazeEngine;

// ─── AudioEngine ─────────────────────────────────────────────────────────────
const AudioEngine = (() => {
  let audioCtx = null;
  let analyser = null;
  let meydaAnalyzer = null;
  let recognition = null;
  let intervalId = null;
  let running = false;

  let fullTranscript = '';
  let wordTimestamps = []; // rolling 60-second window: [{ words, time }]

  // Buffers
  const rmsBuf       = new SignalBuffer(30);
  const centroidBuf  = new SignalBuffer(30);
  const silenceWindows = []; // last 15 windows (true/false for silence)

  let latestFeatures = { rms: 0, spectralCentroid: 0 };
  let latest = { ves: 0, pvs: 0, silr: 0, sr: 0, transcript: '' };

  // Fallback RMS from AnalyserNode when Meyda isn't available
  function _rmsFromAnalyser() {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const sum = buf.reduce((s, v) => s + v * v, 0);
    return Math.sqrt(sum / buf.length);
  }

  function _setupSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          fullTranscript += t + ' ';
          const words = t.trim().split(/\s+/).filter(Boolean).length;
          wordTimestamps.push({ words, time: Date.now() });
        } else {
          interim += t;
        }
      }
    };
    recognition.onerror = (e) => console.warn('[AudioEngine] SR error:', e.error);
    recognition.onend  = () => { if (running) recognition.start(); }; // auto-restart
  }

  async function init() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    try {
      meydaAnalyzer = Meyda.createMeydaAnalyzer({
        audioContext: audioCtx,
        source,
        bufferSize: 2048,
        featureExtractors: ['rms', 'spectralCentroid', 'zcr'],
        callback: (features) => { latestFeatures = features; },
      });
    } catch (err) {
      console.warn('[AudioEngine] Meyda init failed, using fallback RMS:', err);
    }

    _setupSpeechRecognition();
  }

  function _computeSignals() {
    try {
      const rms = (meydaAnalyzer && latestFeatures?.rms != null)
        ? latestFeatures.rms
        : _rmsFromAnalyser();
      const centroid = latestFeatures?.spectralCentroid ?? 0;

      rmsBuf.push(rms);
      centroidBuf.push(centroid);

      // VES: z-score spike in vocal energy
      const ves = Math.min(100, Math.abs(rmsBuf.zScore(rms)) * 25);

      // PVS: coefficient of variation of spectral centroid
      const centroidMean = centroidBuf.mean();
      const pvs = centroidMean > 0
        ? Math.min(100, (centroidBuf.stddev() / centroidMean) * 100)
        : 0;

      // SilR: fraction of last 15 windows that were silent
      silenceWindows.push(rms < 0.01);
      if (silenceWindows.length > 15) silenceWindows.shift();
      const silr = (silenceWindows.filter(Boolean).length / silenceWindows.length) * 100;

      // SR: speech rate deviation from optimal 135 WPM
      const now = Date.now();
      wordTimestamps = wordTimestamps.filter(e => now - e.time < 60000);
      const totalWords = wordTimestamps.reduce((s, e) => s + e.words, 0);
      const sr = Math.min(100, Math.abs(totalWords - 135) / 135 * 100);

      latest = {
        ves: Math.round(ves),
        pvs: Math.round(pvs),
        silr: Math.round(silr),
        sr: Math.round(sr),
        transcript: fullTranscript,
      };
      Bus.emit('signal:audio', latest);
    } catch (err) {
      console.warn('[AudioEngine] compute error:', err);
    }
  }

  function start() {
    running = true;
    if (meydaAnalyzer) meydaAnalyzer.start();
    if (recognition) { try { recognition.start(); } catch {} }
    intervalId = setInterval(_computeSignals, 2000);
  }

  function stop() {
    running = false;
    if (meydaAnalyzer) try { meydaAnalyzer.stop(); } catch {}
    if (recognition)   try { recognition.stop();   } catch {}
    if (intervalId)    clearInterval(intervalId);
  }

  function getLatest()    { return latest; }
  function getTranscript(){ return fullTranscript; }

  return { init, start, stop, getLatest, getTranscript };
})();

window.AudioEngine = AudioEngine;

// ─── SensorManager ───────────────────────────────────────────────────────────
window.SensorManager = {
  async init(videoElement) {
    await FaceEngine.init(videoElement);
    await GazeEngine.init(videoElement);
    await AudioEngine.init();
  },
  startCalibration() { return GazeEngine.startCalibration(); },
  start() { FaceEngine.start(); GazeEngine.start(); AudioEngine.start(); },
  stop()  { FaceEngine.stop();  GazeEngine.stop();  AudioEngine.stop();  },
};
