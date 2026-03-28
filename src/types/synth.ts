export type OscillatorRange = "lo" | "32" | "16" | "8" | "4" | "2";
export type OscillatorWave =
  | "triangle"
  | "sharktooth"
  | "sawtooth"
  | "reverse-saw"
  | "square"
  | "wide-pulse"
  | "narrow-pulse";
export type NoiseColor = "white" | "pink";
export type ModulationDestination = "oscillator" | "mix" | "filter";

export type OscillatorPatch = {
  id: 1 | 2 | 3;
  enabled: boolean;
  range: OscillatorRange;
  wave: OscillatorWave;
  fineTune: number;
  mixerVolume: number;
  keyboardTracking: boolean;
  lfoMode: boolean;
};

export type EnvelopePatch = {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
};

export type FilterPatch = {
  cutoff: number;
  emphasis: number;
  contourAmount: number;
  keyboardControl1: boolean;
  keyboardControl2: boolean;
  envelope: EnvelopePatch;
};

export type AmplifierPatch = {
  envelope: EnvelopePatch;
  decayEnabled: boolean;
};

export type ModulationPatch = {
  mix: number;
  wheel: number;
  destination: ModulationDestination;
  glideTime: number;
  glideEnabled: boolean;
  pitchBend: number;
};

export type OutputPatch = {
  masterVolume: number;
};

export type PerformancePatch = {
  transpose: number;
};

export type SynthPatch = {
  oscillators: [OscillatorPatch, OscillatorPatch, OscillatorPatch];
  noiseColor: NoiseColor;
  noiseVolume: number;
  externalVolume: number;
  filter: FilterPatch;
  amplifier: AmplifierPatch;
  modulation: ModulationPatch;
  output: OutputPatch;
  performance: PerformancePatch;
};
