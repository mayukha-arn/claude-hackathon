// === ADAPTIQ BRAIN MODULE === //

// =========================================================
// 1. PROFILE CONFIG
// =========================================================
const ProfileConfig = (() => {
  const SPECIAL_NEEDS_TUTOR = {
    id: 'special_needs',
    name: 'Special Needs Tutor',
    threshold_z: 1.8,
    ces_alert_level: 40,
    cooldown_seconds: 20,
    monitored_signals: ['gds', 'osr', 'hpd', 'et', 'bra'],
    interventions: {
      GAZE_ERRATIC:       { action: 'focus_object',   message: "Let's take a breath and look at this shape.",  duration: 3000  },
      GAZE_LOST:          { action: 'focus_object',   message: 'Look at the screen — find the shape!',          duration: 3000  },
      ATTENTION_DROP:     { action: 'content_swap',   message: "Let's try something different!"                               },
      STRESS_DETECTED:    { action: 'break_timer',    message: 'Time for a quick break!',                       duration: 30000 },
      FOCUS_DRIFT:        { action: 'focus_object',   message: 'Can you find the shape?',                       duration: 3000  },
      PROLONGED_SILENCE:  { action: 'claude_response',message: "You've been quiet — need help?"                               },
    },
  };

  const INTERVIEW_COACH = {
    id: 'interview_coach',
    name: 'Interview Coach',
    threshold_z: 2.0,
    ces_alert_level: 35,
    cooldown_seconds: 15,
    monitored_signals: ['gds', 'osr', 'hpd', 'ves', 'pvs', 'sr', 'silr'],
    scored_metrics: true,
    interventions: {
      GAZE_ERRATIC:        { action: 'banner',         message: 'Maintain steady eye contact with the camera.',              color: '#f59e0b', severity: 'medium' },
      GAZE_LOST:           { action: 'banner',         message: 'Look at the camera — your interviewer is here.',           color: '#ef4444', severity: 'high'   },
      STRESS_DETECTED:     { action: 'banner',         message: "Take a breath. Slow down. You've got this.",               color: '#f59e0b', severity: 'medium' },
      SPEECH_PANIC:        { action: 'banner',         message: "You're speaking very fast. Pause and collect your thoughts.", color: '#ef4444', severity: 'high' },
      PROLONGED_SILENCE:   { action: 'claude_response',message: "Looks like you're thinking — want a hint?"                                                       },
      OVERCONFIDENT_PACE:  { action: 'banner',         message: 'Great energy! Try varying your pace for emphasis.',        color: '#3b82f6', severity: 'low'    },
    },
  };

  const LANGUAGE_TEACHER = {
    id: 'language_teacher',
    name: 'Language Teacher',
    threshold_z: 2.0,
    ces_alert_level: 35,
    cooldown_seconds: 15,
    monitored_signals: ['et', 'pvs', 'silr', 'sr'],
    interventions: {
      STRESS_DETECTED:   { action: 'content_swap',   message: "Let's simplify this. Try an easier sentence."     },
      FOCUS_DRIFT:       { action: 'claude_response',message: 'Let me rephrase that differently.'                },
      PROLONGED_SILENCE: { action: 'claude_response',message: 'Take your time. Want me to repeat?'               },
      SPEECH_PANIC:      { action: 'banner',         message: 'Slow down — pronunciation is more important than speed.', color: '#f59e0b', severity: 'medium' },
    },
  };

  const _byId = {
    special_needs:    SPECIAL_NEEDS_TUTOR,
    interview_coach:  INTERVIEW_COACH,
    language_teacher: LANGUAGE_TEACHER,
  };

  return {
    SPECIAL_NEEDS_TUTOR,
    INTERVIEW_COACH,
    LANGUAGE_TEACHER,
    getById(id) { return _byId[id] || null; },
  };
})();

window.ProfileConfig = ProfileConfig;

// =========================================================
// 2. ANOMALY DETECTOR
// =========================================================
const AnomalyDetector = (() => {
  const SIGNAL_NAMES = ['gds', 'osr', 'hpd', 'et', 'ves', 'pvs', 'silr', 'sr', 'bra'];

  // CES weights — silr intentionally excluded per spec formula
  const CES_W = { gds: 0.20, osr: 0.20, hpd: 0.15, et: 0.10, ves: 0.10, pvs: 0.10, sr: 0.10, bra: 0.05 };

  // Sustained durations before a flag fires (ms)
  const FLAG_DURATION = {
    GAZE_ERRATIC:       3000,
    GAZE_LOST:          5000,
    ATTENTION_DROP:     10000,
    STRESS_DETECTED:    5000,
    FOCUS_DRIFT:        8000,
    SPEECH_PANIC:       3000,
    PROLONGED_SILENCE:  15000,
    OVERCONFIDENT_PACE: 10000,
  };

  const FLAG_SEVERITY = {
    GAZE_ERRATIC:       'medium',
    GAZE_LOST:          'high',
    ATTENTION_DROP:     'high',
    STRESS_DETECTED:    'medium',
    FOCUS_DRIFT:        'low',
    SPEECH_PANIC:       'high',
    PROLONGED_SILENCE:  'medium',
    OVERCONFIDENT_PACE: 'low',
  };

  let buffers = {};
  let latestSignals = {};
  let isCalibrating = true;
  let calibrationStartTime = null;
  let activeProfile = null;
  let detectionInterval = null;
  let flagOnsetTimes = {}; // { flagType: firstSeenTimestamp }

  function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

  function makeBuffer() {
    // Lazy-create so we don't crash if SignalBuffer isn't loaded yet
    return (typeof SignalBuffer !== 'undefined') ? new SignalBuffer(60) : null;
  }

  function resetState() {
    buffers = {};
    SIGNAL_NAMES.forEach(n => { buffers[n] = makeBuffer(); });
    latestSignals = {};
    flagOnsetTimes = {};
    isCalibrating = true;
    calibrationStartTime = Date.now();
  }

  function pushToBuffer(name, value) {
    if (!buffers[name]) buffers[name] = makeBuffer();
    if (buffers[name]) buffers[name].push(value);
  }

  function getZ(name) {
    const buf = buffers[name];
    if (!buf) return 0;
    const val = latestSignals[name] || 0;
    return buf.zScore(val);
  }

  function getVal(name) { return latestSignals[name] || 0; }

  function computeCES(s) {
    const raw = Object.keys(CES_W).reduce((sum, k) => sum + (s[k] || 0) * CES_W[k], 0);
    return clamp(100 - raw);
  }

  function checkCondition(flagType) {
    if (!activeProfile) return false;
    const z = activeProfile.threshold_z;
    switch (flagType) {
      case 'GAZE_ERRATIC':       return getZ('gds') > z;
      case 'GAZE_LOST':          return getVal('osr') > 80;
      case 'ATTENTION_DROP':     return computeCES(latestSignals) < activeProfile.ces_alert_level;
      case 'STRESS_DETECTED':    return getZ('et') > z && (getZ('ves') > z || getZ('pvs') > z);
      case 'FOCUS_DRIFT':        return getZ('gds') > z * 0.8 && getZ('hpd') > z * 0.8;
      case 'SPEECH_PANIC':       return getVal('sr') > 70 && getZ('ves') > z;
      case 'PROLONGED_SILENCE':  return getVal('silr') > 80;
      case 'OVERCONFIDENT_PACE': return getVal('sr') > 60 && getVal('pvs') < 10;
      default:                   return false;
    }
  }

  function detectionCycle() {
    if (!activeProfile) return;

    const now = Date.now();
    const elapsed = now - calibrationStartTime;

    if (isCalibrating) {
      if (elapsed < 30000) {
        Bus.emit('signal:update', { ...latestSignals, ces: 100 });
        return;
      }
      isCalibrating = false;
      Bus.emit('calibration:complete', { type: 'baseline' });
    }

    const ces = computeCES(latestSignals);
    Bus.emit('signal:update', { ...latestSignals, ces });

    // Evaluate every flag that has an intervention in the active profile
    Object.keys(FLAG_DURATION).forEach(flagType => {
      if (!activeProfile.interventions[flagType]) return;

      const triggered = checkCondition(flagType);

      if (triggered) {
        if (!flagOnsetTimes[flagType]) {
          flagOnsetTimes[flagType] = now;
        } else if (now - flagOnsetTimes[flagType] >= FLAG_DURATION[flagType]) {
          // Fire and reset onset so it can re-fire after another sustained window
          delete flagOnsetTimes[flagType];
          Bus.emit('flag:fired', {
            type: flagType,
            severity: FLAG_SEVERITY[flagType],
            timestamp: now,
            message: activeProfile.interventions[flagType]?.message || flagType,
          });
        }
      } else {
        delete flagOnsetTimes[flagType];
      }
    });
  }

  function init(profile) {
    activeProfile = profile;
    resetState();
  }

  function start() {
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = setInterval(() => {
      try { detectionCycle(); } catch (e) { console.error('[AnomalyDetector]', e); }
    }, 100);
  }

  function stop() {
    if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
  }

  function reset() { stop(); resetState(); }

  function getCES() { return computeCES(latestSignals); }

  // --- Signal subscriptions ---
  Bus.on('signal:face', ({ et, hpd, bra }) => {
    latestSignals.et  = et  || 0;
    latestSignals.hpd = hpd || 0;
    latestSignals.bra = bra || 0;
    pushToBuffer('et',  latestSignals.et);
    pushToBuffer('hpd', latestSignals.hpd);
    pushToBuffer('bra', latestSignals.bra);
  });

  Bus.on('signal:gaze', ({ gds, osr }) => {
    latestSignals.gds = gds || 0;
    latestSignals.osr = osr || 0;
    pushToBuffer('gds', latestSignals.gds);
    pushToBuffer('osr', latestSignals.osr);
  });

  Bus.on('signal:audio', ({ ves, pvs, silr, sr }) => {
    latestSignals.ves  = ves  || 0;
    latestSignals.pvs  = pvs  || 0;
    latestSignals.silr = silr || 0;
    latestSignals.sr   = sr   || 0;
    pushToBuffer('ves',  latestSignals.ves);
    pushToBuffer('pvs',  latestSignals.pvs);
    pushToBuffer('silr', latestSignals.silr);
    pushToBuffer('sr',   latestSignals.sr);
  });

  Bus.on('profile:selected', ({ id, config }) => { init(config); });

  return {
    init, start, stop, reset,
    get isCalibrating() { return isCalibrating; },
    getCES,
  };
})();

window.AnomalyDetector = AnomalyDetector;

// =========================================================
// 3. INTERVENTION DISPATCHER
// =========================================================
const InterventionDispatcher = (() => {
  let lastInterventionTime = 0;
  let interventionLog = [];
  let activeProfile = null;

  function init(profile) {
    activeProfile = profile;
    interventionLog = [];
    lastInterventionTime = 0;
  }

  Bus.on('profile:selected', ({ id, config }) => { init(config); });

  Bus.on('flag:fired', (flag) => {
    if (!activeProfile) return;

    const now = Date.now();
    if (now - lastInterventionTime < activeProfile.cooldown_seconds * 1000) return;

    const intervention = activeProfile.interventions[flag.type];
    if (!intervention) return;

    interventionLog.push({ flag, intervention, timestamp: now });
    lastInterventionTime = now;

    if (intervention.action === 'claude_response') {
      const context = {
        profile: activeProfile,
        signals: { ces: window.AnomalyDetector ? AnomalyDetector.getCES() : 0 },
        transcript: window.AudioEngine ? AudioEngine.getTranscript() : '',
        flagType: flag.type,
        message: intervention.message,
      };
      window.ClaudeClient?.generate(context);
    } else {
      Bus.emit('intervention:trigger', { ...intervention, profile: activeProfile.id });
    }
  });

  return {
    init,
    getLog()  { return [...interventionLog]; },
    reset()   { interventionLog = []; lastInterventionTime = 0; },
  };
})();

window.InterventionDispatcher = InterventionDispatcher;

// =========================================================
// 4. CLAUDE CLIENT
// =========================================================
const ClaudeClient = (() => {
  let apiKey = null;

  const SYSTEM_PROMPTS = {
    special_needs:    'You are a patient, encouraging tutor for a student with special needs. Use simple words. Be warm and reassuring. Keep responses under 2 sentences.',
    interview_coach:  'You are a professional interview coach. Give direct, actionable feedback. Reference specific behaviors (eye contact, pacing, filler words). Keep responses under 3 sentences.',
    language_teacher: 'You are a friendly language teacher. Simplify your vocabulary. If the student is struggling, rephrase or offer an easier alternative. Keep responses under 2 sentences.',
  };

  function setApiKey(key) { apiKey = key; }

  async function generate(context) {
    const { profile, signals, transcript, flagType, message } = context;
    const profileId = profile?.id || 'interview_coach';
    const systemPrompt = SYSTEM_PROMPTS[profileId] || SYSTEM_PROMPTS.interview_coach;
    const userMsg = `Flag triggered: ${flagType}. CES=${(signals.ces || 0).toFixed(0)}. Transcript: "${(transcript || '').slice(-200)}". Respond briefly and helpfully.`;

    if (!apiKey) {
      Bus.emit('intervention:trigger', { action: 'claude_response', message, done: true });
      return;
    }

    let settled = false;
    const fallback = setTimeout(() => {
      if (!settled) {
        settled = true;
        Bus.emit('intervention:trigger', { action: 'claude_response', message, done: true });
      }
    }, 3000);

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 150,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });

      if (!resp.ok) {
        clearTimeout(fallback);
        if (!settled) { settled = true; Bus.emit('intervention:trigger', { action: 'claude_response', message, done: true }); }
        return;
      }

      clearTimeout(fallback);
      settled = true;

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete line for next chunk

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              Bus.emit('intervention:trigger', { action: 'claude_response', chunk: evt.delta.text, done: false });
            }
          } catch { /* malformed SSE — skip */ }
        }
      }

      Bus.emit('intervention:trigger', { action: 'claude_response', chunk: '', done: true });
    } catch (err) {
      console.error('[ClaudeClient] generate error:', err);
      if (!settled) {
        settled = true;
        clearTimeout(fallback);
        Bus.emit('intervention:trigger', { action: 'claude_response', message, done: true });
      }
    }
  }

  async function generateDebrief(sessionData) {
    if (!apiKey) return null;
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: 'You are a professional interview coach writing a session debrief. Be constructive, specific, and encouraging.',
          messages: [{
            role: 'user',
            content: `Write a professional debrief for this interview practice session.\n\nSession data:\n${JSON.stringify(sessionData, null, 2)}\n\nInclude: overall performance summary, 2 strengths, 2 areas to improve, and 2 actionable tips.`,
          }],
        }),
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      return json.content?.[0]?.text || null;
    } catch (err) {
      console.error('[ClaudeClient] debrief error:', err);
      return null;
    }
  }

  return { setApiKey, generate, generateDebrief };
})();

window.ClaudeClient = ClaudeClient;

// =========================================================
// 5. INTERVIEW SCORECARD
// =========================================================
const InterviewScorecard = (() => {
  const FILLER_RE = /\b(um|uh|like|you know|basically|actually|literally)\b/gi;

  let totalFrames = 0;
  let framesWithGoodEyeContact = 0;
  let hpdValues = [];
  let fillerCount = 0;
  let wordCount = 0;
  let latestPvs = 0, latestSilr = 0, latestSr = 0;
  let scoreInterval = null;
  let signalUpdateHandler = null;
  let audioHandler = null;

  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  function reset() {
    totalFrames = 0;
    framesWithGoodEyeContact = 0;
    hpdValues = [];
    fillerCount = 0;
    wordCount = 0;
    latestPvs = 0; latestSilr = 0; latestSr = 0;
  }

  function getScores() {
    const eyeContact    = clamp(totalFrames > 0 ? (framesWithGoodEyeContact / totalFrames) * 100 : 0);
    const avgHpd        = hpdValues.length > 0 ? hpdValues.reduce((a, b) => a + b, 0) / hpdValues.length : 0;
    const headStability = clamp(100 - avgHpd);
    const vocalConfidence = clamp(100 - latestPvs - latestSilr * 0.5);
    const fillerPenalty   = wordCount > 0 ? (fillerCount / wordCount) * 100 : 0;
    const speechClarity   = clamp(100 - latestSr - fillerPenalty);
    const overall         = clamp(eyeContact * 0.25 + headStability * 0.20 + vocalConfidence * 0.25 + speechClarity * 0.30);

    let grade = 'F';
    if (overall >= 85) grade = 'A';
    else if (overall >= 70) grade = 'B';
    else if (overall >= 55) grade = 'C';
    else if (overall >= 40) grade = 'D';

    return { eyeContact, headStability, vocalConfidence, speechClarity, overall, grade };
  }

  function init() {
    reset();

    // Remove stale listeners before adding fresh ones
    if (signalUpdateHandler) Bus.off('signal:update', signalUpdateHandler);
    if (audioHandler) Bus.off('signal:audio', audioHandler);

    signalUpdateHandler = ({ osr, hpd }) => {
      totalFrames++;
      if ((osr || 0) < 30) framesWithGoodEyeContact++;
      if (hpd !== undefined) {
        hpdValues.push(hpd);
        if (hpdValues.length > 300) hpdValues.shift(); // keep ~10s @ 30fps
      }
    };

    audioHandler = ({ pvs, silr, sr, transcript }) => {
      latestPvs  = pvs  || 0;
      latestSilr = silr || 0;
      latestSr   = sr   || 0;
      if (transcript) {
        const matches = transcript.match(FILLER_RE);
        fillerCount = matches ? matches.length : 0;
        wordCount   = transcript.trim().split(/\s+/).filter(Boolean).length;
      }
    };

    Bus.on('signal:update', signalUpdateHandler);
    Bus.on('signal:audio',  audioHandler);

    if (scoreInterval) clearInterval(scoreInterval);
    scoreInterval = setInterval(() => {
      try { Bus.emit('scores:update', getScores()); } catch (e) { console.error('[InterviewScorecard]', e); }
    }, 2000);
  }

  Bus.on('profile:selected', ({ id }) => {
    if (id === 'interview_coach') init();
  });

  return { init, reset, getScores };
})();

window.InterviewScorecard = InterviewScorecard;

// =========================================================
// 6. SESSION MANAGER
// =========================================================
const SessionManager = (() => {
  let sessionStartTime = null;
  let lastSessionData  = null;

  function start() {
    sessionStartTime = Date.now();
    lastSessionData  = null;
  }

  async function endSession() {
    const duration = sessionStartTime ? Date.now() - sessionStartTime : 0;
    const mins     = Math.floor(duration / 60000);
    const secs     = Math.floor((duration % 60000) / 1000);

    const flagLog   = window.InterventionDispatcher ? InterventionDispatcher.getLog() : [];
    const scores    = window.InterviewScorecard    ? InterviewScorecard.getScores()  : null;
    const transcript= window.AudioEngine           ? AudioEngine.getTranscript()     : '';
    const ces       = window.AnomalyDetector       ? AnomalyDetector.getCES()        : 0;

    lastSessionData = {
      duration_ms:       duration,
      duration_readable: `${mins}m ${secs}s`,
      ces_final:         ces,
      total_flags:       flagLog.length,
      flag_log:          flagLog,
      scores,
      transcript:        transcript.slice(-2000),
      exported_at:       new Date().toISOString(),
    };

    Bus.emit('session:end', { summary: lastSessionData });

    // Generate debrief for Interview Coach (non-blocking — fires after session:end)
    if (scores && window.ClaudeClient) {
      ClaudeClient.generateDebrief(lastSessionData).then(debrief => {
        if (debrief) {
          lastSessionData.debrief = debrief;
          Bus.emit('session:debrief', { text: debrief });
        }
      });
    }

    return lastSessionData;
  }

  function getSessionData() { return lastSessionData; }

  return { start, endSession, getSessionData };
})();

window.SessionManager = SessionManager;

// =========================================================
// 7. BRAIN MANAGER — top-level orchestrator
// =========================================================
window.BrainManager = {
  init(profileId) {
    const profile = ProfileConfig.getById(profileId);
    if (!profile) { console.error('[BrainManager] Unknown profile:', profileId); return; }
    Bus.emit('profile:selected', { id: profileId, config: profile });
    AnomalyDetector.init(profile);
    InterventionDispatcher.init(profile);
    if (profileId === 'interview_coach') InterviewScorecard.init();
    SessionManager.start();
  },
  start()      { AnomalyDetector.start(); },
  stop()       { AnomalyDetector.stop();  },
  endSession() { return SessionManager.endSession(); },
};
