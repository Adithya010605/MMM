import type { SynthPatch } from "../types/synth";

export const defaultPatch: SynthPatch = {
  oscillators: [
    {
      id: 1,
      enabled: true,
      range: "8",
      wave: "sawtooth",
      fineTune: 0,
      mixerVolume: 0.82,
      keyboardTracking: true,
      lfoMode: false,
    },
    {
      id: 2,
      enabled: true,
      range: "8",
      wave: "square",
      fineTune: -2.5,
      mixerVolume: 0.68,
      keyboardTracking: true,
      lfoMode: false,
    },
    {
      id: 3,
      enabled: true,
      range: "lo",
      wave: "triangle",
      fineTune: 0,
      mixerVolume: 0.35,
      keyboardTracking: false,
      lfoMode: true,
    },
  ],
  noise: {
    enabled: false,
    color: "white",
    volume: 0.08,
    envelope: {
      attack: 0.01,
      decay: 0.18,
      sustain: 0.15,
      release: 0.12,
    },
  },
  externalVolume: 0,
  filter: {
    cutoff: 1800,
    emphasis: 0.3,
    contourAmount: 0.55,
    keyboardControl1: true,
    keyboardControl2: true,
    envelope: {
      attack: 0.03,
      decay: 0.36,
      sustain: 0.38,
      release: 0.42,
    },
  },
  amplifier: {
    decayEnabled: true,
    envelope: {
      attack: 0.01,
      decay: 0.28,
      sustain: 0.75,
      release: 0.32,
    },
  },
  modulation: {
    mix: 0.5,
    wheel: 0.35,
    destination: "mix",
    glideTime: 0.08,
    glideEnabled: true,
    pitchBend: 0,
  },
  output: {
    masterVolume: 0.78,
  },
  performance: {
    transpose: 0,
  },
};
