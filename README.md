# PhysioEdge AI 🧘‍♂️🤖

Zero-Cloud Edge AI Physical Therapy Web Application for back pain rehabilitation powered by React 18, Vite, TypeScript, and MediaPipe PoseLandmarker running on-device via WebAssembly/WebGPU.

---

## 🌟 Key Features

- **100% Client-Side & Zero-Cloud Privacy**: No video uploads, no backend, no cloud database. All computer vision inference executes directly in the user's browser.
- **Biomechanical Angle & Phase Tracking**: Real-time landmark extraction and joint angle computation with trigonometric state machines (`Math.atan2`).
- **High Performance In-Canvas HUD**: Runs inside `requestAnimationFrame` with zero React re-renders during 30 FPS inference using mutable `useRef` counters.
- **Hardware-Aware Camera Management**: Explicit start/stop controls with proper `MediaStreamTrack.stop()` teardown to prevent background battery drain.
- **Overlaid Skeleton & Angle Visualizations**: Dynamic SVG/Canvas overlay of MediaPipe pose skeleton with highlighted joints and real-time angle arcs.

---

## 🏋️ Biomechanical State Machines & Supported Exercises

| Exercise | Profile | Monitored Joints | Metric & Logic | Rep Cycle |
| :--- | :--- | :--- | :--- | :--- |
| **Standing Hip Hinge** | Side Profile | Right Shoulder (12), Hip (24), Knee (26) | Hip flexion angle: `UP` (>160°), `DOWN` (<120°) | `DOWN` → `UP` |
| **Glute Bridge** | Side Profile (Floor) | Right Shoulder (12), Hip (24), Knee (26) | Hip extension angle: `DOWN` (<130°), `UP` (>160°) | `UP` → `DOWN` |
| **Wall Angels** | Front Profile (Wall) | Right Shoulder (12), Elbow (14), Wrist (16) | Elbow angle: `DOWN` (<100°), `UP` (>150°) | `UP` → `DOWN` |
| **Cat-Cow** | Side Profile (All Fours) | Right Shoulder (12), Hip (24) | Torso vertical Y-differential: `COW` (<0.10), `CAT` (>0.18) | `CAT` → `COW` |
| **Dead Bugs** | Side Profile (Floor) | Right Hip (24), Knee (26), Wrist (16) | Extremity Euclidean distance: `CONTRACTED` (<0.15), `EXTENDED` (>0.35) | `EXTENDED` → `CONTRACTED` |

---

## 🛠️ Tech Stack

- **Framework**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Computer Vision**: `@mediapipe/tasks-vision` (PoseLandmarker lite, float16 GPU delegate)
- **Rendering**: HTML5 `<video>` and `<canvas>` 2D context

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm / pnpm / yarn
- Modern web browser (Chrome, Edge, or Brave recommended for optimal WebGPU/WASM performance)

### Installation

```bash
# Clone the repository
git clone https://github.com/abidalikp/Physio.git
cd Physio

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
npm run build
```

---

## 🔒 Privacy & Architecture

All processing is performed locally inside the client's web browser sandbox. Video frames captured via `navigator.mediaDevices.getUserMedia` are consumed directly by WebAssembly and Canvas drawing contexts, guaranteeing that no personal biometric or health data ever leaves the local machine.
