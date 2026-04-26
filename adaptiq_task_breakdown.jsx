import { useState } from "react";

const taskData = [
  {
    id: 1,
    role: "Perception Engineer",
    emoji: "👁️",
    subtitle: "Face, Gaze & Voice Pipeline",
    color: "#0ea5e9",
    accent: "#0284c7",
    gradient: "from-sky-500/10 to-cyan-500/5",
    owner: "___________",
    timeEstimate: "~8–10 hrs",
    overview:
      "You own everything that turns raw webcam frames and microphone audio into numeric signal values. By the end of your work, the rest of the team can call simple functions that return scores like Gaze Drift, Head Pose Deviation, and Vocal Energy.",
    tasks: [
      {
        title: "Face Detection Module (FaceEngine)",
        details: [
          "Load face-api.js models from jsDelivr CDN (tinyFaceDetector, faceLandmark68Net, faceExpressionNet)",
          "Set up webcam video element + requestAnimationFrame loop at ~30fps",
          "Extract 68-point facial landmarks per frame",
          "Compute 7-class expression probabilities (happy, sad, angry, fearful, disgusted, surprised, neutral)",
          "Compute head pose angles (yaw, pitch, roll) from landmark geometry",
          "Compute Eye Aspect Ratio (EAR) for blink detection",
          "Expose normalized outputs: Expression Tension (ET), Head Pose Deviation (HPD), Blink Rate Anomaly (BRA)",
        ],
      },
      {
        title: "Gaze Tracking Module (GazeEngine)",
        details: [
          "Initialize WebGazer.js with regression model",
          "Build the 9-point calibration screen UI (follow-the-dot)",
          "Capture (x, y) gaze pixel coordinates each frame",
          "Compute Gaze Drift Score (GDS): rolling stddev of gaze coords over 30 frames, normalized to screen diagonal",
          "Compute Off-Screen Ratio (OSR): fraction of last 60 frames with gaze outside central 60% viewport rect",
        ],
      },
      {
        title: "Audio Analysis Module (AudioEngine)",
        details: [
          "Set up AudioContext → microphone MediaStream → AnalyserNode → Meyda feature extraction",
          "Extract per 2-second window: RMS energy, spectral centroid, ZCR, MFCC coefficients",
          "Compute Vocal Energy Spike (VES) from RMS Z-score",
          "Compute Pitch Variance Score (PVS) from spectral centroid rolling stddev",
          "Compute Silence Ratio (SilR) from ZCR threshold over last 30 seconds",
          "Hook up Web Speech API (SpeechRecognition) for live transcript",
          "Compute Speech Rate (SR) as words-per-minute from transcript token counter",
        ],
      },
      {
        title: "Signal Buffer Utility (SignalBuffer)",
        details: [
          "Implement circular buffer class with configurable window size (default W=60)",
          "Expose methods: push(), mean(), stddev(), zScore(currentValue)",
          "This is used by ALL signal modules + the anomaly detector",
        ],
      },
    ],
    deliverables: [
      "FaceEngine, GazeEngine, AudioEngine as IIFE blocks inside index.html",
      "SignalBuffer utility class",
      "9-point gaze calibration screen",
      "All modules emit normalized 0–100 signal values via a shared event/callback system",
    ],
    dependencies: "None — you go first. Everyone else depends on your signal outputs.",
  },
  {
    id: 2,
    role: "Intelligence Engineer",
    emoji: "🧠",
    subtitle: "Anomaly Detection, Profiles & Interventions",
    color: "#a855f7",
    accent: "#9333ea",
    gradient: "from-purple-500/10 to-fuchsia-500/5",
    owner: "___________",
    timeEstimate: "~7–9 hrs",
    overview:
      "You own the brain of the system — the numeric engine that turns raw signal values into anomaly flags, and the profile configs that decide what to do about them. You also wire the intervention dispatcher that triggers UI changes or Claude API calls.",
    tasks: [
      {
        title: "Anomaly Detector (AnomalyDetector)",
        details: [
          "Consume all signal values from the Perception Engineer's modules",
          "Maintain a SignalBuffer per signal for rolling Z-score computation",
          "Implement 30-second baseline calibration period (no flags during this window)",
          "Compute Composite Engagement Score (CES) using weighted formula: CES = 100 - (GDS×0.20 + OSR×0.20 + HPD×0.15 + ET×0.10 + VES×0.10 + PVS×0.10 + SR×0.10 + BRA×0.05)",
          "Emit flag events: GAZE_ERRATIC, GAZE_LOST, ATTENTION_DROP, STRESS_DETECTED, FOCUS_DRIFT, SPEECH_PANIC, PROLONGED_SILENCE, OVERCONFIDENT_PACE",
          "Each flag has a trigger condition, sustained-duration requirement, and severity level (see PRD §6.4)",
        ],
      },
      {
        title: "Profile Configurations (ProfileConfig)",
        details: [
          "Define 3 profile config objects as plain JS: Special Needs Tutor, Interview Coach, Language Teacher",
          "Each config specifies: threshold_z, CES alert level, intervention cooldown, monitored signals, and intervention mappings",
          "Special Needs: threshold_z = 1.8, CES alert < 40, cooldown 20s",
          "Interview Coach: default thresholds, scored metrics (Eye Contact %, Head Stability, Vocal Confidence, Speech Clarity, Overall Score)",
          "Language Teacher: confusion expression monitoring, pitch anomaly handling, vocabulary matching config",
        ],
      },
      {
        title: "Intervention Dispatcher",
        details: [
          "Listen to anomaly flag events from AnomalyDetector",
          "Look up the active profile's intervention mapping for each flag",
          "Apply cooldown logic (minimum 20s between interventions, configurable per profile)",
          "For UI interventions (focus object, banner, content swap): call the UI Engineer's rendering functions",
          "For Claude-powered interventions (content regen, debrief): call the ClaudeClient module",
          "Track intervention history for session summary",
        ],
      },
      {
        title: "Claude API Client (ClaudeClient)",
        details: [
          "Minimal fetch wrapper for Anthropic /v1/messages endpoint (claude-sonnet-4-20250514)",
          "Accept API key from UI text field, store only in JS memory",
          "Build context-aware prompts using current profile + signal data + transcript",
          "Handle streaming responses for chat-bubble UI rendering",
          "Pre-written fallback text for when API latency > 3s",
          "Session-end debrief generation (Interview Coach profile)",
        ],
      },
    ],
    deliverables: [
      "AnomalyDetector module with all 8 flag types",
      "3 complete ProfileConfig objects",
      "InterventionDispatcher with cooldown logic",
      "ClaudeClient API wrapper with streaming support",
    ],
    dependencies:
      "Needs signal outputs from Person 1 (Perception). Sends intervention commands to Person 3 (UI).",
  },
  {
    id: 3,
    role: "UI / Frontend Engineer",
    emoji: "🎨",
    subtitle: "Dashboard, Overlays & Visual Design",
    color: "#f59e0b",
    accent: "#d97706",
    gradient: "from-amber-500/10 to-yellow-500/5",
    owner: "___________",
    timeEstimate: "~7–8 hrs",
    overview:
      "You own everything the user sees — the profile selection screen, the session layout, live charts, intervention overlays, and all visual polish. The demo is only as good as it looks, and that's on you.",
    tasks: [
      {
        title: "Profile Selection Screen",
        details: [
          "3 large clickable profile cards: Special Needs Tutor, Interview Coach, Language Teacher",
          "Each card has an icon/emoji, name, and 1-line description",
          "Clicking a card sets the active profile and navigates to the session screen",
          "Include API key text input field above the cards",
          "Clean, polished, high-contrast design",
        ],
      },
      {
        title: "Session Screen Layout",
        details: [
          "Left panel (30%): Webcam feed with face bounding box overlay and gaze dot",
          "Center panel (45%): Active lesson content area / Claude-generated text / intervention overlays",
          "Right panel (25%): Real-time signal dashboard",
          "Bottom bar: Large CES number + color bar (green→yellow→red gradient) + active flag badges",
          "Responsive enough for a demo (target: 1080p+ screen)",
        ],
      },
      {
        title: "Real-Time Dashboard (Chart.js)",
        details: [
          "4 live sparkline charts in the right panel: CES, GDS, VES, PVS",
          "Charts update every frame (~30fps) with smooth animation",
          "Color-coded thresholds (green = safe, yellow = warning, red = anomaly)",
          "Interview Coach profile: additional scored metrics panel (Eye Contact %, Head Stability, etc.)",
        ],
      },
      {
        title: "Intervention Overlay System",
        details: [
          "Focus Object: animated SVG geometric shape, centered, 3-second auto-dismiss (Special Needs)",
          "Banner Alert: slide-in top banner, color-coded by severity, 5-second auto-dismiss (Interview Coach)",
          "Content Swap: fade transition to new content block (all profiles)",
          "Claude Response: chat-bubble UI with streaming text animation (all profiles)",
          "Break Timer: full-screen countdown overlay for movement breaks (Special Needs)",
          "Each overlay type should be a reusable function the Intervention Dispatcher can call",
        ],
      },
      {
        title: "Single-File HTML Shell",
        details: [
          "Set up the index.html skeleton: all CSS in <style>, all JS in <script> blocks",
          "Load CDN dependencies (face-api.js, WebGazer, Meyda, Chart.js, TensorFlow.js)",
          "Model loading progress bar for face-api.js (~3–5s first load)",
          "Structure the IIFE blocks so each team member can paste their module into the file",
        ],
      },
    ],
    deliverables: [
      "Complete index.html shell with CDN imports and CSS",
      "Profile selection screen",
      "Session screen with 3-panel layout",
      "4 live Chart.js sparklines",
      "5 intervention overlay types (focus object, banner, content swap, chat bubble, break timer)",
      "Loading/progress bar for model initialization",
    ],
    dependencies:
      "Needs signal data from Person 1 for chart rendering. Needs intervention calls from Person 2. Can start the HTML shell and static UI immediately.",
  },
  {
    id: 4,
    role: "Integration Lead & Demo Engineer",
    emoji: "🔗",
    subtitle: "Glue Code, Testing & Presentation",
    color: "#10b981",
    accent: "#059669",
    gradient: "from-emerald-500/10 to-teal-500/5",
    owner: "___________",
    timeEstimate: "~6–8 hrs",
    overview:
      "You're the glue. You wire everyone's modules together into the final index.html, write the event/callback system that connects them, handle edge cases, run end-to-end testing, and prepare the 5-minute demo script. You also own the Interview Coach scored metrics display and the session-end report.",
    tasks: [
      {
        title: "Event Bus / Callback System",
        details: [
          "Design a simple pub/sub or callback-based system for module communication",
          "Perception modules → publish signal values",
          "AnomalyDetector → subscribes to signals, publishes flags",
          "InterventionDispatcher → subscribes to flags, calls UI functions",
          "Dashboard → subscribes to signals for chart updates",
          "Keep it vanilla JS — no framework, no library",
        ],
      },
      {
        title: "Module Integration",
        details: [
          "Merge all 3 teammates' code into the single index.html",
          "Resolve naming conflicts, shared state, initialization order",
          "Ensure correct startup sequence: load models → calibrate gaze → calibrate baseline → start session",
          "Handle permission prompts (camera, microphone) gracefully",
          "Test each profile end-to-end: trigger every flag, verify every intervention fires",
        ],
      },
      {
        title: "Interview Coach Scorecard",
        details: [
          "Build the live scored metrics panel for Interview Coach profile",
          "Eye Contact % = running % of frames with OSR < 30 (target > 70%)",
          "Head Stability = 100 - HPD average (target > 75)",
          "Vocal Confidence = 100 - PVS - SilR×50 (target > 65)",
          "Speech Clarity = 100 - SR_score - (filler_count/word_count)×100 (target > 70%)",
          "Overall Interview Score = weighted composite with letter grade (A/B/C/D/F)",
          "Filler word detection via regex on live transcript ('um', 'uh', 'like', 'you know')",
        ],
      },
      {
        title: "Session Report & Export",
        details: [
          "Aggregate signal data over the full session",
          "Generate session summary JSON (all metrics, flag counts, intervention log)",
          "For Interview Coach: trigger Claude API to generate full written debrief at session end",
          "Add 'Export Report' button that downloads session JSON",
        ],
      },
      {
        title: "Demo Preparation",
        details: [
          "Rehearse the 5-minute demo script from PRD §11",
          "Prepare backup plan if WebGazer calibration fails (skip gaze, demo face + voice only)",
          "Test on target laptop + Chrome version",
          "Prepare talking points: all numeric, self-calibrating, zero-install, open source, extensible",
          "Have pre-typed Claude API key ready to paste",
        ],
      },
    ],
    deliverables: [
      "Event bus / pub-sub system",
      "Final merged index.html (< 1500 lines)",
      "Interview Coach scorecard + letter grade",
      "Session report JSON export",
      "Rehearsed 5-minute demo",
    ],
    dependencies:
      "Depends on all 3 other members. Can start the event bus and scorecard logic immediately, then integrate as modules arrive.",
  },
];

function TaskCard({ task, isOpen, toggle, color }) {
  return (
    <div
      className="border rounded-lg overflow-hidden mb-2 transition-all duration-200"
      style={{ borderColor: isOpen ? color : "var(--tw-border-opacity, #e5e7eb)" }}
    >
      <button
        onClick={toggle}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-sm text-gray-800">{task.title}</span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{ backgroundColor: color + "18", color }}
        >
          {task.details.length} items
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-3 border-t border-gray-100">
          <ul className="mt-2 space-y-1.5">
            {task.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AdaptIQBreakdown() {
  const [activeTab, setActiveTab] = useState(0);
  const [openTasks, setOpenTasks] = useState({});

  const toggleTask = (personId, taskIdx) => {
    const key = `${personId}-${taskIdx}`;
    setOpenTasks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const person = taskData[activeTab];

  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: "#fafafa",
      }}
    >
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "#1a1a2e" }}
        >
          AdaptIQ — Hackathon Task Breakdown
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          4 roles · tap a tab to see that person's full scope
        </p>
      </div>

      {/* Role Tabs */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {taskData.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setActiveTab(i)}
              className="flex-shrink-0 px-4 py-3 rounded-xl text-left transition-all duration-200 border-2"
              style={{
                borderColor: activeTab === i ? p.color : "transparent",
                backgroundColor: activeTab === i ? p.color + "10" : "white",
                boxShadow:
                  activeTab === i
                    ? `0 2px 12px ${p.color}20`
                    : "0 1px 3px rgba(0,0,0,0.06)",
                minWidth: "160px",
              }}
            >
              <div className="text-lg mb-0.5">{p.emoji}</div>
              <div
                className="font-semibold text-sm"
                style={{ color: activeTab === i ? p.accent : "#374151" }}
              >
                {p.role}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Person {p.id}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Active Person Detail */}
      <div
        className="max-w-4xl mx-auto bg-white rounded-2xl border overflow-hidden"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.05)" }}
      >
        {/* Person Header */}
        <div
          className="px-6 py-5 border-b"
          style={{ background: person.color + "08" }}
        >
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{person.emoji}</span>
                <div>
                  <h2
                    className="text-xl font-bold"
                    style={{ color: person.accent }}
                  >
                    Person {person.id}: {person.role}
                  </h2>
                  <p className="text-sm text-gray-500">{person.subtitle}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ backgroundColor: person.color + "15", color: person.accent }}
              >
                {person.timeEstimate}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            {person.overview}
          </p>
        </div>

        {/* Tasks */}
        <div className="px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Task Breakdown
          </h3>
          {person.tasks.map((task, idx) => (
            <TaskCard
              key={idx}
              task={task}
              isOpen={!!openTasks[`${person.id}-${idx}`]}
              toggle={() => toggleTask(person.id, idx)}
              color={person.color}
            />
          ))}
        </div>

        {/* Deliverables */}
        <div className="px-6 py-4 border-t border-gray-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Deliverables
          </h3>
          <div className="flex flex-wrap gap-2">
            {person.deliverables.map((d, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: person.color + "12",
                  color: person.accent,
                  border: `1px solid ${person.color}30`,
                }}
              >
                {d}
              </span>
            ))}
          </div>
        </div>

        {/* Dependencies */}
        <div
          className="px-6 py-4 border-t"
          style={{ backgroundColor: "#f9fafb" }}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Dependencies
          </h3>
          <p className="text-sm text-gray-600">{person.dependencies}</p>
        </div>
      </div>

      {/* Dependency Flow Summary */}
      <div
        className="max-w-4xl mx-auto mt-6 bg-white rounded-2xl border p-6"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.05)" }}
      >
        <h3 className="text-sm font-bold text-gray-700 mb-3">
          Dependency Flow
        </h3>
        <div className="flex items-center justify-center gap-2 flex-wrap text-sm">
          <span className="px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "#0ea5e9" + "15", color: "#0284c7" }}>
            👁️ Perception
          </span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "#a855f7" + "15", color: "#9333ea" }}>
            🧠 Intelligence
          </span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "#f59e0b" + "15", color: "#d97706" }}>
            🎨 UI / Frontend
          </span>
          <span className="text-gray-400">←→</span>
          <span className="px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "#10b981" + "15", color: "#059669" }}>
            🔗 Integration
          </span>
        </div>
        <p className="text-xs text-gray-400 text-center mt-3">
          Person 3 (UI) can start the HTML shell + static screens immediately. Person 4 (Integration) wires everything once modules arrive.
        </p>
      </div>
    </div>
  );
}
