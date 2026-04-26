/**
 * AdaptIQ — UI Module (ui.js)
 * Owns: screen transitions, chart rendering, overlay management,
 *       metric updates, event log, calibration animation, session timer.
 *
 * Depends on: Bus (global), Chart.js (CDN)
 * Does NOT depend on sensors.js or brain.js — communicates via Bus events.
 */

window.AdaptIQ_UI = (() => {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    currentScreen: 'loading',
    profile: null,
    sessionStart: null,
    sessionTimerInterval: null,
    engagementTimerInterval: null,
    sessionSeconds: 0,
    engagedSeconds: 0,
    lastFaceTime: 0,
    scores: { eyeContact: 0, headStability: 0, vocalConfidence: 0, speechClarity: 0, overall: 0, grade: '—' },
    metrics: { gds: 0, osr: 0, hpd: 0, et: 0, ves: 0, pvs: 0, silr: 0, sr: 0, bra: 0, ces: 0 },
    faceDetected: false,
    calibrationStages: { face: 'pending', gaze: 'pending', audio: 'pending' },
    flags: [],
    flagTimers: [],
    intervention: { active: false, timer: null, progressTimer: null },
    eventLog: [],
    charts: {},
    sparkBuffers: { gds: [], hpd: [], ves: [], ces: [], silr: [] },
    maxSparkPoints: 40,
  };

  // ============================================================
  // SCREEN MANAGEMENT
  // ============================================================
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${id}`);
    if (target) target.classList.add('active');
    state.currentScreen = id;
  }

  // ============================================================
  // BOOT / LOADING SCREEN
  // ============================================================
  const bootTasks = [
    { id: 'task-models', label: 'Loading AI models…',         pct: 20  },
    { id: 'task-camera', label: 'Requesting camera access…',  pct: 45  },
    { id: 'task-audio',  label: 'Initializing audio…',        pct: 65  },
    { id: 'task-gaze',   label: 'Calibrating gaze tracker…',  pct: 85  },
    { id: 'task-ready',  label: 'All systems ready!',          pct: 100 },
  ];

  function setBootProgress(pct, label) {
    const bar = document.getElementById('boot-progress-bar');
    const pctEl = document.getElementById('boot-pct');
    const labelEl = document.getElementById('boot-task-label');
    if (bar) bar.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    if (labelEl && label) labelEl.textContent = label;
  }

  function markBootTask(taskId, done = true) {
    const el = document.getElementById(taskId);
    if (!el) return;
    const icon = el.querySelector('.boot-task-icon');
    el.classList.toggle('done', done);
    el.classList.toggle('active', !done);
    if (icon) icon.textContent = done ? '✓' : '◉';
  }

  function setBootTaskActive(taskId) {
    const el = document.getElementById(taskId);
    if (!el) return;
    el.classList.add('active');
    const icon = el.querySelector('.boot-task-icon');
    if (icon) icon.textContent = '◉';
  }

  function runBootSequence() {
    // Simulated boot: tick through tasks, await models:loaded from Bus
    let step = 0;

    function nextStep() {
      if (step >= bootTasks.length) return;
      const task = bootTasks[step];
      setBootTaskActive(task.id);
      setBootProgress(task.pct, task.label);
      setTimeout(() => {
        markBootTask(task.id, true);
        step++;
        if (step < bootTasks.length) {
          setTimeout(nextStep, 300 + Math.random() * 300);
        } else {
          // Final — wait a beat then show profile screen
          setTimeout(() => showScreen('profile'), 600);
        }
      }, 600 + Math.random() * 400);
    }

    setTimeout(nextStep, 400);
  }

  // ============================================================
  // PROFILE SELECTION SCREEN
  // ============================================================
  function initProfileScreen() {
    document.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        state.profile = id;
        document.getElementById('topbar-profile-label').textContent = id.toUpperCase();
        Bus.emit('profile:selected', { id });
        addEventLog('info', `Profile selected: <strong>${id.toUpperCase()}</strong>`);
        showScreen('calibration');
        startCalibrationAnimation();
      });
    });
  }

  // ============================================================
  // CALIBRATION SCREEN
  // ============================================================
  let calibAnimFrame = null;

  function startCalibrationAnimation() {
    const canvas = document.getElementById('calib-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const W = canvas.width;
    const H = canvas.height;
    let t = 0;
    let gazeReady    = false;
    let currentPoint = 0;

    const points = Array.from({ length: 9 }, (_, i) => ({
      x: (0.2 + 0.3 * (i % 3)) * W,
      y: (0.25 + 0.25 * Math.floor(i / 3)) * H,
      progress: 0,
      done: false,
    }));

    // Update instruction text helper
    const instrEl = document.getElementById('calib-instruction');
    function setInstruction(html) { if (instrEl) instrEl.innerHTML = html; }

    // Gaze engine events drive dot advancement
    const onProgress = ({ pointIndex, progress }) => {
      if (points[pointIndex]) points[pointIndex].progress = progress;
    };
    const onNext = ({ pointIndex }) => {
      if (points[pointIndex - 1]) points[pointIndex - 1].done = true;
      currentPoint = pointIndex;
      if (points[currentPoint]) points[currentPoint].progress = 0;
      setInstruction(`<strong>Hold gaze on dot ${pointIndex + 1} of 9</strong> — keep still until it fills`);
    };
    const onReady = () => {
      gazeReady = true;
      setInstruction('<strong>Look at the dot</strong> — hold still until the ring fills');
    };

    Bus.on('gaze:calibration:progress', onProgress);
    Bus.on('gaze:calibration:next',     onNext);
    Bus.on('gaze:ready',                onReady);

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(0,229,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 48) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      if (!gazeReady) {
        // Loading: first dot pulses while sensors initialize
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.06);
        const p = points[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18 + 6 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,229,255,${0.08 + 0.08 * pulse})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,229,255,${0.3 + 0.3 * pulse})`;
        ctx.fill();
      } else {
        // Active: each dot shows a progress arc that fills as the user fixates
        points.forEach((p, i) => {
          if (i > currentPoint) return;

          if (p.done) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,255,136,0.3)';
            ctx.fill();
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          } else if (i === currentPoint) {
            // Static outer guide ring
            ctx.beginPath();
            ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0,229,255,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Progress arc — fills as iris stays still
            if (p.progress > 0) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + p.progress * 2 * Math.PI);
              ctx.strokeStyle = p.progress > 0.8 ? '#00ff88' : '#00e5ff';
              ctx.lineWidth = 2.5;
              ctx.stroke();
            }

            // Center dot
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#00e5ff';
            ctx.fill();

            // Crosshair
            ctx.strokeStyle = 'rgba(0,229,255,0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(p.x - 20, p.y); ctx.lineTo(p.x + 20, p.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(p.x, p.y - 20); ctx.lineTo(p.x, p.y + 20); ctx.stroke();
            ctx.setLineDash([]);
          }
        });

        // Trail connecting completed dots
        if (currentPoint > 0) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i <= Math.min(currentPoint, points.length - 1); i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.strokeStyle = 'rgba(0,255,136,0.2)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      t++;
      calibAnimFrame = requestAnimationFrame(draw);
    }

    draw();
  }

  function updateCalibrationStage(type) {
    const stageEl = document.getElementById(`calib-stage-${type}`);
    if (!stageEl) return;

    // Mark previous stages as done
    const order = ['face', 'gaze', 'audio'];
    const idx = order.indexOf(type);

    order.forEach((s, i) => {
      const el = document.getElementById(`calib-stage-${s}`);
      if (!el) return;
      if (i < idx) {
        el.classList.remove('active'); el.classList.add('done');
        el.querySelector('.calib-stage-dot').textContent = '✓';
      } else if (i === idx) {
        el.classList.add('active');
      }
    });

    state.calibrationStages[type] = 'complete';

    const instructions = {
      face:  '<strong>Face detected!</strong> Now follow the dots with your eyes',
      gaze:  '<strong>Gaze calibrated!</strong> Speak normally for baseline audio',
      audio: '<strong>All systems calibrated!</strong> Starting session…',
    };
    const instr = document.getElementById('calib-instruction');
    if (instr) instr.innerHTML = instructions[type] || '';
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================
  function startSession() {
    state.sessionStart = Date.now();
    state.sessionSeconds = 0;
    state.engagedSeconds = 0;
    state.lastFaceTime = 0;
    initDashboard();

    state.sessionTimerInterval = setInterval(() => {
      state.sessionSeconds++;
      updateTimer();
    }, 1000);

    // Engagement Time: count seconds where a face was actively detected
    state.engagementTimerInterval = setInterval(() => {
      if (state.lastFaceTime && Date.now() - state.lastFaceTime < 2000) {
        state.engagedSeconds++;
        updateMetricValue('metric-et', state.engagedSeconds, 0);
      }
    }, 1000);

    addEventLog('info', `Session started · Profile: <strong>${(state.profile || 'default').toUpperCase()}</strong>`);
  }

  function updateTimer() {
    const el = document.getElementById('session-timer');
    if (!el) return;
    const m = String(Math.floor(state.sessionSeconds / 60)).padStart(2, '0');
    const s = String(state.sessionSeconds % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }

  function formatTime() {
    const m = String(Math.floor(state.sessionSeconds / 60)).padStart(2, '0');
    const s = String(state.sessionSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function endSession() {
    clearInterval(state.sessionTimerInterval);
    clearInterval(state.engagementTimerInterval);
    if (state.intervention.timer) clearTimeout(state.intervention.timer);
    if (state.intervention.progressTimer) clearInterval(state.intervention.progressTimer);
    hideIntervention();

    // Build summary from current scores
    showSummary({
      eyeContact:      state.scores.eyeContact,
      headStability:   state.scores.headStability,
      vocalConfidence: state.scores.vocalConfidence,
      speechClarity:   state.scores.speechClarity,
      overall:         state.scores.overall,
      grade:           state.scores.grade,
    });
  }

  // ============================================================
  // DASHBOARD INIT
  // ============================================================
  function initDashboard() {
    initSparklines();
    initScoreRing();
    initVideoFeed();

    document.getElementById('btn-end-session').addEventListener('click', () => {
      Bus.emit('session:end', {});
      endSession();
    });
  }

  // ============================================================
  // VIDEO FEED
  // ============================================================
  function initVideoFeed() {
    const video = document.getElementById('video-feed');
    if (!video) return;

    // Video stream is now provided by APP INIT (shared with AudioEngine)
    // Only request if not already set (for standalone testing)
    if (!video.srcObject) {
      navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
        .then(stream => {
          video.srcObject = stream;
        })
        .catch(err => {
          console.warn('[AdaptIQ UI] Camera access denied:', err);
          updateVideoStatus(false);
        });
    }
  }

  function updateVideoStatus(detected) {
    const el = document.getElementById('video-status');
    if (!el) return;
    state.faceDetected = detected;
    el.className = `status-pill ${detected ? 'active' : 'warn'}`;
    el.innerHTML = `<div class="pulse-dot"></div><span>${detected ? 'Face Detected' : 'No Face'}</span>`;
  }

  // ============================================================
  // FACE OVERLAY RENDERING
  // ============================================================
  function drawFaceOverlay(data) {
    const canvas = document.getElementById('face-overlay-canvas');
    const video  = document.getElementById('video-feed');
    if (!canvas || !video) return;

    canvas.width  = video.videoWidth  || canvas.offsetWidth;
    canvas.height = video.videoHeight || canvas.offsetHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data || !data.bbox) return;

    const { x, y, width, height } = data.bbox;
    const W = canvas.width;
    const H = canvas.height;

    // Scale bbox to canvas size
    const sx = W / (video.videoWidth  || W);
    const sy = H / (video.videoHeight || H);
    const bx = x * sx, by = y * sy, bw = width * sx, bh = height * sy;

    // Face bounding box
    ctx.strokeStyle = 'rgba(0,229,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Corner accents
    const cs = 12;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.5;
    [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(([cx, cy], i) => {
      const dx = i % 2 === 0 ? 1 : -1;
      const dy = i < 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx + dx * cs, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * cs);
      ctx.stroke();
    });

    // Landmarks
    if (data.landmarks && Array.isArray(data.landmarks)) {
      ctx.fillStyle = 'rgba(0,229,255,0.6)';
      data.landmarks.forEach(pt => {
        ctx.beginPath();
        ctx.arc((pt.x || pt[0]) * sx, (pt.y || pt[1]) * sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Expression label
    if (data.expressions) {
      const top = Object.entries(data.expressions).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0.4) {
        ctx.fillStyle = 'rgba(0,229,255,0.9)';
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.fillText(top[0].toUpperCase(), bx, by - 6);
      }
    }
  }

  // ============================================================
  // SPARKLINE CHARTS (Chart.js)
  // ============================================================
  function makeSparkline(canvasId, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: color,
          borderWidth: 1.5,
          fill: true,
          backgroundColor: hexToRgba(color, 0.08),
          pointRadius: 0,
          tension: 0.4,
        }]
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        elements: { line: { borderCapStyle: 'round' } }
      }
    });
  }

  function hexToRgba(hex, alpha) {
    // Accepts CSS var names or hex
    if (hex.startsWith('var(')) {
      return `rgba(0,229,255,${alpha})`; // fallback
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function initSparklines() {
    state.charts.gds  = makeSparkline('spark-gds',  '#00e5ff');
    state.charts.hpd  = makeSparkline('spark-hpd',  '#ffb700');
    state.charts.ves  = makeSparkline('spark-ves',  '#a855f7');
    state.charts.ces  = makeSparkline('spark-ces',  '#ffb700');
    state.charts.silr = makeSparkline('spark-silr', '#00b4d8');
  }

  function pushSparkData(key, value) {
    const buf = state.sparkBuffers[key];
    if (!buf) return;
    buf.push(value);
    if (buf.length > state.maxSparkPoints) buf.shift();

    const chart = state.charts[key];
    if (!chart) return;
    chart.data.labels = buf.map((_, i) => i);
    chart.data.datasets[0].data = [...buf];
    chart.update('none');
  }

  // ============================================================
  // SCORE RING (Canvas-based donut)
  // ============================================================
  function initScoreRing() {
    updateScoreRing(0, '—');
  }

  function updateScoreRing(overall, grade) {
    const canvas = document.getElementById('score-ring-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r = 40, lineW = 7;

    ctx.clearRect(0, 0, W, H);

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Progress arc
    const pct = (overall || 0) / 100;
    const start = -Math.PI / 2;
    const end = start + pct * Math.PI * 2;

    const gradeColor = {
      'A': '#00ff88', 'A+': '#00ff88', 'A-': '#00ff88',
      'B': '#00e5ff', 'B+': '#00e5ff', 'B-': '#00e5ff',
      'C': '#ffb700', 'C+': '#ffb700', 'C-': '#ffb700',
      'D': '#ff3d5a', 'F': '#ff3d5a',
    }[grade] || '#00e5ff';

    if (pct > 0) {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, gradeColor);
      grad.addColorStop(1, '#a855f7');

      ctx.beginPath();
      ctx.arc(cx, cy, r, start, end);
      ctx.strokeStyle = grad;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Center values
    document.getElementById('score-overall').textContent = overall > 0 ? Math.round(overall) : '--';
    document.getElementById('score-grade').textContent   = grade || '—';
  }

  // ============================================================
  // METRIC UPDATES
  // ============================================================
  function animateValue(el, value, decimals = 0) {
    if (!el) return;
    const formatted = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
    if (el.dataset.lastVal === formatted) return;
    el.dataset.lastVal = formatted;
    el.classList.remove('value-update');
    void el.offsetWidth; // reflow
    el.classList.add('value-update');
    // Update only the text node, preserving the unit <span>
    const textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = formatted;
    else el.firstChild && (el.firstChild.textContent = formatted);
  }

  function setBarWidth(barId, pct) {
    const el = document.getElementById(barId);
    if (el) el.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }

  function updateSignal(data) {
    const m = state.metrics;
    if (data.gds   !== undefined) { m.gds   = data.gds;   pushSparkData('gds', data.gds); }
    if (data.osr   !== undefined) { m.osr   = data.osr;   }
    if (data.hpd   !== undefined) { m.hpd   = data.hpd;   pushSparkData('hpd', data.hpd); }
    if (data.et    !== undefined) { m.et    = data.et;    }
    if (data.ves   !== undefined) { m.ves   = data.ves;   pushSparkData('ves', data.ves); }
    if (data.pvs   !== undefined) { m.pvs   = data.pvs;   }
    if (data.silr  !== undefined) { m.silr  = data.silr;  pushSparkData('silr', data.silr); }
    if (data.sr    !== undefined) { m.sr    = data.sr;    }
    if (data.bra   !== undefined) { m.bra   = data.bra;   }
    if (data.ces   !== undefined) { m.ces   = data.ces;   pushSparkData('ces', data.ces); }

    renderMetrics();
  }

  function renderMetrics() {
    const m = state.metrics;

    // Left panel
    updateMetricValue('metric-gds',  m.gds,  2);
    updateMetricValue('metric-hpd',  m.hpd,  1);
    updateMetricValue('metric-bra',  m.bra,  0);
    updateMetricValue('metric-ves',  m.ves,  2);
    updateMetricValue('metric-sr',   m.sr,   0);

    // Right panel
    updateMetricValue('metric-osr',  m.osr,  1);
    // metric-et is Engagement Time — updated by its own 1s interval in startSession, not from signal
    updateMetricValue('metric-ces',  m.ces,  2);
    updateMetricValue('metric-silr', m.silr, 2);
    updateMetricValue('metric-pvs',  m.pvs,  2);

    // Bar fills
    setBarWidth('bar-bra',  (m.bra / 30) * 100);   // norm 0-30 blinks/min
    setBarWidth('bar-sr',   (m.sr  / 200) * 100);  // norm 0-200 wpm
    setBarWidth('bar-osr',  m.osr);
    setBarWidth('bar-pvs',  (m.pvs / 2) * 100);    // norm 0-2
  }

  function updateMetricValue(id, value, decimals) {
    const el = document.getElementById(id);
    if (!el) return;
    const numStr = decimals > 0 ? (+value).toFixed(decimals) : Math.round(+value).toString();
    // Find the text node (before any unit span)
    const nodes = Array.from(el.childNodes);
    const textNode = nodes.find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) {
      if (textNode.textContent !== numStr) {
        textNode.textContent = numStr;
        el.classList.remove('value-update');
        void el.offsetWidth;
        el.classList.add('value-update');
      }
    } else {
      el.textContent = numStr;
    }
  }

  // ============================================================
  // FACE SIGNAL
  // ============================================================
  function handleFaceSignal(data) {
    if (!data) return;
    updateVideoStatus(true);

    // Track when face was last seen — used by the engagement time counter in startSession
    if (data.bbox) state.lastFaceTime = Date.now();
    if (data.hpd !== undefined) {
      updateMetricValue('metric-hpd', data.hpd, 1);
      pushSparkData('hpd', data.hpd);
    }
    if (data.bra !== undefined) {
      updateMetricValue('metric-bra', data.bra, 0);
      setBarWidth('bar-bra', (data.bra / 30) * 100);
    }

    drawFaceOverlay(data);
  }

  // ============================================================
  // GAZE SIGNAL
  // ============================================================
  function handleGazeSignal(data) {
    if (!data) return;
    if (data.gds !== undefined) {
      updateMetricValue('metric-gds', data.gds, 2);
      pushSparkData('gds', data.gds);
    }
    if (data.osr !== undefined) {
      updateMetricValue('metric-osr', data.osr, 1);
      setBarWidth('bar-osr', data.osr);
    }

    // Move gaze dot
    const dot = document.getElementById('gaze-dot');
    if (dot && data.x !== undefined && data.y !== undefined) {
      dot.style.display = 'block';
      dot.style.left = `${data.x}px`;
      dot.style.top  = `${data.y}px`;
    }
  }

  // ============================================================
  // FLAGS / ALERTS
  // ============================================================
  function handleFlag(data) {
    if (!data) return;
    const { type, severity = 'low', timestamp, message } = data;

    addEventLog('flag', `<strong>[${severity.toUpperCase()}]</strong> ${message || type}`);

    const overlay = document.getElementById('flag-overlay');
    if (!overlay) return;

    const icons = { high: '⚠', medium: '◈', low: '◉' };
    const toast = document.createElement('div');
    toast.className = `flag-toast severity-${severity}`;
    toast.innerHTML = `
      <div class="flag-icon">${icons[severity] || '◉'}</div>
      <div class="flag-content">
        <div class="flag-type">${type || 'Alert'}</div>
        <div class="flag-message">${message || ''}</div>
      </div>
    `;
    overlay.appendChild(toast);

    // Auto-remove after 4s
    const timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      toast.style.transition = 'all 300ms ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
    state.flagTimers.push(timer);

    // Keep max 3 visible
    const toasts = overlay.querySelectorAll('.flag-toast');
    if (toasts.length > 3) toasts[0].remove();
  }

  // ============================================================
  // INTERVENTION OVERLAY
  // ============================================================
  function handleIntervention(data) {
    if (!data) return;
    const { action, message, color, duration, profile, chunk, done } = data;

    addEventLog('intervention', `<strong>Intervention:</strong> ${action || 'adaptive break'}`);

    // If streaming chunks, accumulate
    if (chunk !== undefined) {
      const content = document.getElementById('intervention-content');
      if (content) {
        if (chunk === 0 || !state.intervention.active) {
          content.textContent = '';
        }
        content.textContent += chunk || '';
      }
      if (!state.intervention.active) {
        showIntervention(action, color, duration);
      }
      if (done) {
        // Stream complete — start dismiss timer
        scheduleInterventionDismiss(duration || 8000);
      }
      return;
    }

    // Non-streamed: show full message
    const content = document.getElementById('intervention-content');
    if (content) content.textContent = message || '';
    showIntervention(action, color, duration);
    scheduleInterventionDismiss(duration || 8000);
  }

  function showIntervention(action, color, duration) {
    state.intervention.active = true;

    const overlay = document.getElementById('intervention-overlay');
    const card    = document.getElementById('intervention-card');
    const title   = document.getElementById('intervention-title');
    const eyebrow = document.getElementById('intervention-eyebrow');
    const bar     = document.getElementById('intervention-progress-bar');

    const ACTION_LABELS = {
      claude_response: 'AI Coach',
      banner:          'Alert',
      focus_object:    'Focus Exercise',
      content_swap:    'Try This Instead',
      break_timer:     'Take a Break',
    };
    if (title)   title.textContent   = ACTION_LABELS[action] || action || 'Adaptive Intervention';
    if (eyebrow) eyebrow.textContent = `${(state.profile || 'adaptive').toUpperCase()} · Intervention`;

    // Apply color theming
    const c = color || '#00e5ff';
    if (card) {
      card.style.setProperty('--intervention-color', c);
      card.style.setProperty('--intervention-glow', hexToRgba(c, 0.15));
    }

    if (bar) bar.style.width = '100%';
    if (overlay) overlay.classList.add('active');
  }

  function scheduleInterventionDismiss(duration) {
    const ms = typeof duration === 'number' ? duration : 8000;
    const bar = document.getElementById('intervention-progress-bar');

    if (bar) {
      bar.style.transition = `width ${ms}ms linear`;
      requestAnimationFrame(() => { bar.style.width = '0%'; });
    }

    if (state.intervention.timer) clearTimeout(state.intervention.timer);
    state.intervention.timer = setTimeout(hideIntervention, ms);
  }

  function hideIntervention() {
    const overlay = document.getElementById('intervention-overlay');
    if (overlay) overlay.classList.remove('active');
    state.intervention.active = false;
  }

  function initInterventionDismiss() {
    const btn = document.getElementById('intervention-dismiss');
    if (btn) btn.addEventListener('click', hideIntervention);
  }

  // ============================================================
  // SCORES UPDATE
  // ============================================================
  function handleScoresUpdate(data) {
    if (!data) return;
    const { eyeContact, headStability, vocalConfidence, speechClarity, overall, grade } = data;

    state.scores = { eyeContact, headStability, vocalConfidence, speechClarity, overall, grade };

    updateScoreRing(overall, grade);

    // Breakdown bars
    const vals = [
      ['score-eye',    'sbar-eye',    eyeContact],
      ['score-head',   'sbar-head',   headStability],
      ['score-vocal',  'sbar-vocal',  vocalConfidence],
      ['score-clarity','sbar-clarity', speechClarity],
    ];
    vals.forEach(([scoreId, barId, val]) => {
      const scoreEl = document.getElementById(scoreId);
      const barEl   = document.getElementById(barId);
      if (scoreEl) scoreEl.textContent = Math.round(val || 0);
      if (barEl)   barEl.style.width = `${Math.min(100, val || 0)}%`;
    });

    addEventLog('score', `Scores updated · Overall: <strong>${Math.round(overall)}%</strong> (${grade})`);
  }

  // ============================================================
  // CALIBRATION COMPLETE
  // ============================================================
  function handleCalibrationComplete(data) {
    if (!data) return;
    updateCalibrationStage(data.type);
    if (data.type === 'gaze') {
      cancelAnimationFrame(calibAnimFrame); // stop canvas loop before leaving screen
      calibAnimFrame = null;
      setTimeout(() => {
        showScreen('dashboard');
        startSession();
      }, 600);
    }
  }

  // ============================================================
  // EVENT LOG
  // ============================================================
  function addEventLog(type, html) {
    const container = document.getElementById('event-log');
    if (!container) return;

    const item = document.createElement('div');
    item.className = 'event-log-item';
    item.innerHTML = `
      <div class="event-log-dot ${type}"></div>
      <div class="event-log-text">${html}</div>
      <div class="event-log-time">${formatTime()}</div>
    `;
    container.insertBefore(item, container.firstChild);

    // Keep max 30 entries
    const items = container.querySelectorAll('.event-log-item');
    if (items.length > 30) items[items.length - 1].remove();
  }

  // ============================================================
  // SESSION SUMMARY
  // ============================================================
  function showSummary(data) {
    showScreen('summary');

    document.getElementById('summary-grade').textContent    = data.grade || '—';
    document.getElementById('summary-subtitle').textContent =
      `Session ended · Profile: ${(state.profile || 'default').toUpperCase()} · Duration: ${formatTime()}`;

    document.getElementById('sum-overall').textContent = data.overall  ? Math.round(data.overall)  : '--';
    document.getElementById('sum-eye').textContent     = data.eyeContact    ? Math.round(data.eyeContact)    : '--';
    document.getElementById('sum-head').textContent    = data.headStability ? Math.round(data.headStability) : '--';
    document.getElementById('sum-vocal').textContent   = data.vocalConfidence ? Math.round(data.vocalConfidence) : '--';

    // Summary actions
    document.getElementById('btn-new-session').addEventListener('click', () => {
      // Reset state and go back to profile selection
      state.profile = null;
      state.sessionSeconds = 0;
      state.sparkBuffers = { gds: [], hpd: [], ves: [], ces: [], silr: [] };
      showScreen('profile');
    });

    document.getElementById('btn-export').addEventListener('click', exportReport);
  }

  function exportReport() {
    const report = {
      profile:   state.profile,
      duration:  formatTime(),
      scores:    state.scores,
      metrics:   state.metrics,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `adaptiq-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // BUS SUBSCRIPTIONS
  // ============================================================
  function attachBusListeners() {
    Bus.on('signal:update',         updateSignal);
    Bus.on('signal:face',           handleFaceSignal);
    Bus.on('signal:gaze',           handleGazeSignal);
    Bus.on('flag:fired',            handleFlag);
    Bus.on('intervention:trigger',  handleIntervention);
    Bus.on('scores:update',         handleScoresUpdate);
    Bus.on('calibration:complete',  handleCalibrationComplete);
    Bus.on('models:loaded',         () => {
      setBootProgress(100, 'All systems ready!');
      markBootTask('task-ready', true);
    });
    Bus.on('session:end', (data) => {
      if (data && data.summary) showSummary(data.summary);
      else endSession();
    });
  }

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.intervention.active) hideIntervention();
      }
      if (e.key === 'g' && state.currentScreen === 'dashboard') {
        // Toggle gaze dot visibility
        const dot = document.getElementById('gaze-dot');
        if (dot) dot.style.display = dot.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  // ============================================================
  // PUBLIC INIT
  // ============================================================
  function init() {
    attachBusListeners();
    initProfileScreen();
    initInterventionDismiss();
    initKeyboardShortcuts();
    runBootSequence();
  }

  // Expose a minimal public API for debugging/external use
  return {
    init,
    showScreen,
    addEventLog,
    handleFlag,
    handleIntervention,
    updateSignal,
    handleFaceSignal,
    handleGazeSignal,
    handleScoresUpdate,
    handleCalibrationComplete,
  };

})();
