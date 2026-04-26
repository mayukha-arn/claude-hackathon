# Project: AI-Powered Empathy Assistant

## Overview
This document outlines the conceptual framework and implementation strategy for a real-time, multimodal AI assistant capable of analyzing body language and voice to provide adaptive support for users in contexts such as education, interview preparation, and professional development.

---

## 1. Naming Options

| Category | Suggestions |
| :--- | :--- |
| **Adaptability & Movement** | Kinesis, Pivot, Flux, Adapt |
| **Insight & Empathy** | Resonance, EmpathOS, Sentia, Mirror |
| **Support & Growth** | Catalyst, Bridge, Ally, MentorCore |
| **Modern Tech** | Verve, Node, Lumen, Echo |

---

## 2. Implementation Strategy

### High-Level Architecture
The system operates on a **Perceive → Process → Act** loop. To maintain low latency, processing must be distributed, with heavy feature extraction handled at the edge (on the user's device) and reasoning handled by the LLM.



### Technical Stack
* **Video Processing:** MediaPipe (for skeletal/pose tracking and Face Mesh) and OpenCV.
* **Audio Processing:** `faster-whisper` (for local, real-time transcription).
* **The Brain (LLM):** Claude 3.5 Sonnet (via API) or a local model like Llama 3 (for privacy-sensitive deployments).
* **Orchestration:** FastAPI with WebSockets for bidirectional, low-latency streaming.
* **TTS (Text-to-Speech):** ElevenLabs or Kokoro (chosen for low latency).

### Data Pipeline
1. **Perception Layer (Client):** The system captures raw streams and converts them into semantic metadata (e.g., body posture, facial expression, and transcript text).
2. **Reasoning Layer (The Brain):** The LLM receives this abstracted JSON state (e.g., `{"posture": "slumped", "expression": "confused"}`) rather than raw video frames.
3. **Actuation Layer:** The LLM generates a response or triggers UI changes via Function Calling (e.g., changing visual elements on screen or adjusting the teaching tone).

---

## 3. Implementation Roadmap

### Step 1: Feature Extraction
* Build a local script using OpenCV/MediaPipe to monitor user posture and track eye gaze.
* Implement local transcription using Whisper to convert audio to text instantly.

### Step 2: The Logic Loop
* Create a JSON schema that represents the "User State."
* Develop a system prompt for the LLM that interprets the JSON state and decides on an appropriate, empathetic intervention.

### Step 3: Closing the Loop
* Connect the LLM output to a Text-to-Speech engine.
* Implement UI-based feedback (e.g., dynamic visual prompts or changes in teaching style).

---

## 4. Critical Considerations

* **Latency is the Enemy:** Prioritize edge processing. Never send raw video frames to the LLM. The "uncanny valley" of voice interaction is often caused by processing delays; keeping the loop under 500ms is the goal.
* **Privacy:** Keep all raw data local. Only share semantic metadata with the cloud/LLM. Ensure the user knows they are being analyzed and provide a "kill switch" for the camera/mic.
* **Model Selection:** Use models with robust Function Calling capabilities. This allows the AI to "act" (e.g., trigger a screen highlight) rather than just "speak," which is vital for an interactive assistant.