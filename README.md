# MMM Synth

React + TypeScript + Vite refactor of the Minimoog-inspired browser synth.

## Stack

- React 18
- TypeScript
- Vite
- Web Audio API
- AudioWorklet ladder-filter stage

## Architecture

- `src/App.tsx`: top-level synth surface and patch wiring
- `src/audio/engine/SynthEngine.ts`: monophonic audio graph, envelopes, modulation, keyboard note handling
- `src/components/*`: reusable UI controls
- `src/hooks/useKeyboardSynth.ts`: QWERTY keyboard integration
- `public/worklets/moog-ladder.worklet.js`: custom ladder-filter worklet

## Current implementation

- Professional React app structure
- Three oscillators plus noise source
- Mixer, filter, contour, loudness, modulation, glide, and output controls
- Monophonic keyboard play from computer keys and on-screen keyboard
- Waveform scope driven by analyser output

## Run

```bash
npm install
npm run dev
```

Then open the local Vite URL.
