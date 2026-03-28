import { midiToFrequency } from "../../lib/notes";
import type { ModulationDestination, OscillatorPatch, OscillatorWave, SynthPatch } from "../../types/synth";

type VoiceState = {
  activeNote: number | null;
  heldNotes: number[];
};

type SynthGraph = {
  context: AudioContext;
  analyser: AnalyserNode;
  master: GainNode;
  amp: GainNode;
  filter: AudioWorkletNode;
  mixer: GainNode;
  contour: GainNode;
  contourSource: ConstantSourceNode;
  pitchModGain: GainNode;
  filterModGain: GainNode;
  oscillatorNodes: Array<{
    source: OscillatorNode;
    mixGain: GainNode;
    pitchGain: GainNode;
  }>;
  noiseSource: AudioBufferSourceNode;
  noiseGain: GainNode;
};

const RANGE_OFFSETS: Record<OscillatorPatch["range"], number> = {
  lo: -24,
  "32": -24,
  "16": -12,
  "8": 0,
  "4": 12,
  "2": 24,
};

const PULSE_WAVES = new Set<OscillatorWave>(["wide-pulse", "narrow-pulse"]);
const WAVEFORMS: Record<OscillatorWave, OscillatorType> = {
  triangle: "triangle",
  sharktooth: "sawtooth",
  sawtooth: "sawtooth",
  "reverse-saw": "sawtooth",
  square: "square",
  "wide-pulse": "square",
  "narrow-pulse": "square",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function seconds(value: number): number {
  return Math.max(0.005, value);
}

export class SynthEngine {
  #graph: SynthGraph | null = null;
  #patch: SynthPatch;
  #voice: VoiceState = { activeNote: null, heldNotes: [] };
  #readyPromise: Promise<void> | null = null;

  constructor(initialPatch: SynthPatch) {
    this.#patch = initialPatch;
  }

  async ensureReady(): Promise<void> {
    if (this.#readyPromise) {
      await this.#readyPromise;
      return;
    }

    this.#readyPromise = this.#init();
    await this.#readyPromise;
  }

  getAnalyser(): AnalyserNode | null {
    return this.#graph?.analyser ?? null;
  }

  updatePatch(nextPatch: SynthPatch): void {
    this.#patch = nextPatch;
    if (!this.#graph) return;

    const { context, master, contour, oscillatorNodes, noiseGain, filter, pitchModGain, filterModGain } = this.#graph;
    const now = context.currentTime;

    master.gain.setTargetAtTime(nextPatch.output.masterVolume, now, 0.02);
    contour.gain.setTargetAtTime(nextPatch.filter.contourAmount * 2200, now, 0.02);
    noiseGain.gain.setTargetAtTime(nextPatch.noiseVolume, now, 0.02);

    oscillatorNodes.forEach((node, index) => {
      const osc = nextPatch.oscillators[index];
      node.mixGain.gain.setTargetAtTime(osc.enabled && !osc.lfoMode ? osc.mixerVolume : 0, now, 0.02);
      node.source.type = WAVEFORMS[osc.wave];
      node.pitchGain.gain.setTargetAtTime(this.#pitchModAmount(nextPatch.modulation.destination), now, 0.02);
      node.source.detune.setTargetAtTime(this.#detuneForOscillator(osc), now, 0.02);
    });

    pitchModGain.gain.setTargetAtTime(this.#modDepth(), now, 0.03);
    filterModGain.gain.setTargetAtTime(this.#filterModDepth(nextPatch.modulation.destination), now, 0.03);

    filter.parameters.get("cutoff")?.setTargetAtTime(nextPatch.filter.cutoff, now, 0.02);
    filter.parameters.get("resonance")?.setTargetAtTime(0.4 + nextPatch.filter.emphasis * 3.5, now, 0.03);
    filter.parameters.get("drive")?.setTargetAtTime(1 + nextPatch.filter.emphasis * 0.8, now, 0.03);

    if (this.#voice.activeNote !== null) {
      this.#setOscillatorFrequencies(this.#voice.activeNote, true);
    }
  }

  async noteOn(note: number): Promise<void> {
    await this.ensureReady();
    if (!this.#graph) return;

    const existingIndex = this.#voice.heldNotes.indexOf(note);
    if (existingIndex !== -1) this.#voice.heldNotes.splice(existingIndex, 1);
    this.#voice.heldNotes.push(note);

    const legato = this.#voice.activeNote !== null;
    this.#voice.activeNote = note;
    this.#setOscillatorFrequencies(note, legato);
    this.#triggerAmpEnvelope(true);
    this.#triggerFilterEnvelope(true);
  }

  noteOff(note: number): void {
    if (!this.#graph) return;

    this.#voice.heldNotes = this.#voice.heldNotes.filter((held) => held !== note);
    const nextNote = this.#voice.heldNotes.at(-1) ?? null;

    if (nextNote !== null) {
      this.#voice.activeNote = nextNote;
      this.#setOscillatorFrequencies(nextNote, true);
      return;
    }

    this.#voice.activeNote = null;
    this.#triggerAmpEnvelope(false);
    this.#triggerFilterEnvelope(false);
  }

  bendPitch(amount: number): void {
    this.#patch = {
      ...this.#patch,
      modulation: {
        ...this.#patch.modulation,
        pitchBend: amount,
      },
    };
    this.updatePatch(this.#patch);
  }

  async #init(): Promise<void> {
    const context = new AudioContext({ latencyHint: "interactive" });
    await context.audioWorklet.addModule("/worklets/moog-ladder.worklet.js");

    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;

    const master = context.createGain();
    const amp = context.createGain();
    const mixer = context.createGain();
    const contour = context.createGain();
    const contourSource = context.createConstantSource();
    const pitchModGain = context.createGain();
    const filterModGain = context.createGain();

    const filter = new AudioWorkletNode(context, "moog-ladder-filter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        cutoff: this.#patch.filter.cutoff,
        resonance: 0.4 + this.#patch.filter.emphasis * 3.5,
        drive: 1.2,
      },
    });

    const oscillatorNodes = this.#patch.oscillators.map((osc) => {
      const source = context.createOscillator();
      const mixGain = context.createGain();
      const pitchGain = context.createGain();

      source.type = WAVEFORMS[osc.wave];
      source.connect(mixGain).connect(mixer);
      source.connect(pitchGain);
      pitchGain.connect(source.detune);

      mixGain.gain.value = osc.enabled && !osc.lfoMode ? osc.mixerVolume : 0;
      source.start();

      return { source, mixGain, pitchGain };
    });

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = this.#createNoiseBuffer(context);
    noiseSource.loop = true;
    const noiseGain = context.createGain();
    noiseGain.gain.value = this.#patch.noiseVolume;
    noiseSource.connect(noiseGain).connect(mixer);
    noiseSource.start();

    contourSource.offset.value = 1;
    contourSource.connect(contour).connect(filter.parameters.get("cutoff")!);
    contourSource.start();

    mixer.connect(filter).connect(amp).connect(master).connect(analyser).connect(context.destination);
    amp.gain.value = 0.0001;
    master.gain.value = this.#patch.output.masterVolume;

    const lfoNode = oscillatorNodes[2];
    lfoNode.source.connect(pitchModGain);
    lfoNode.source.connect(filterModGain);

    pitchModGain.connect(oscillatorNodes[0].source.detune);
    pitchModGain.connect(oscillatorNodes[1].source.detune);
    filterModGain.connect(filter.parameters.get("cutoff")!);

    this.#graph = {
      context,
      analyser,
      master,
      amp,
      filter,
      mixer,
      contour,
      contourSource,
      pitchModGain,
      filterModGain,
      oscillatorNodes,
      noiseSource,
      noiseGain,
    };

    this.updatePatch(this.#patch);
    await context.resume();
  }

  #createNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;

    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      if (this.#patch.noiseColor === "pink") {
        last = 0.98 * last + 0.02 * white;
        data[index] = clamp(last * 4, -1, 1);
      } else {
        data[index] = white;
      }
    }

    return buffer;
  }

  #detuneForOscillator(osc: OscillatorPatch): number {
    const pulseCompensation = PULSE_WAVES.has(osc.wave) ? -5 : 0;
    return osc.fineTune * 100 + pulseCompensation + this.#patch.modulation.pitchBend * 200;
  }

  #pitchModAmount(destination: ModulationDestination): number {
    return destination === "oscillator" || destination === "mix" ? 100 : 0;
  }

  #filterModDepth(destination: ModulationDestination): number {
    return destination === "filter" || destination === "mix" ? this.#modDepth() * 10 : 0;
  }

  #modDepth(): number {
    return this.#patch.modulation.wheel * 38 * (0.35 + this.#patch.modulation.mix);
  }

  #setOscillatorFrequencies(note: number, legato: boolean): void {
    if (!this.#graph) return;

    const { oscillatorNodes, context } = this.#graph;
    const now = context.currentTime;
    const glide = legato && this.#patch.modulation.glideEnabled ? this.#patch.modulation.glideTime : 0;

    oscillatorNodes.forEach((node, index) => {
      const osc = this.#patch.oscillators[index];
      const keyboardEnabled = index === 1 ? osc.keyboardTracking : !osc.lfoMode;
      const midi = keyboardEnabled ? note + this.#patch.performance.transpose + RANGE_OFFSETS[osc.range] : 36 + RANGE_OFFSETS[osc.range];
      const hz = clamp(midiToFrequency(midi), 0.1, 12000);

      if (glide > 0) {
        node.source.frequency.cancelScheduledValues(now);
        node.source.frequency.linearRampToValueAtTime(hz, now + glide);
      } else {
        node.source.frequency.setValueAtTime(hz, now);
      }
    });

    this.#updateKeyTracking(note);
  }

  #updateKeyTracking(note: number): void {
    if (!this.#graph) return;

    const { context, filter } = this.#graph;
    const now = context.currentTime;
    const base = this.#patch.filter.cutoff;
    let tracked = base;

    if (this.#patch.filter.keyboardControl1) tracked += (note - 48) * 9;
    if (this.#patch.filter.keyboardControl2) tracked += (note - 48) * 18;

    filter.parameters.get("cutoff")?.setTargetAtTime(clamp(tracked, 40, 18000), now, 0.02);
  }

  #triggerAmpEnvelope(noteOn: boolean): void {
    if (!this.#graph) return;

    const { context, amp } = this.#graph;
    const { attack, decay, sustain, release } = this.#patch.amplifier.envelope;
    const now = context.currentTime;

    amp.gain.cancelScheduledValues(now);

    if (noteOn) {
      amp.gain.setValueAtTime(Math.max(amp.gain.value, 0.0001), now);
      amp.gain.linearRampToValueAtTime(1, now + seconds(attack));
      const sustainLevel = this.#patch.amplifier.decayEnabled ? sustain : 1;
      amp.gain.linearRampToValueAtTime(sustainLevel, now + seconds(attack) + seconds(decay));
      return;
    }

    amp.gain.setValueAtTime(Math.max(amp.gain.value, 0.0001), now);
    amp.gain.linearRampToValueAtTime(0.0001, now + seconds(release));
  }

  #triggerFilterEnvelope(noteOn: boolean): void {
    if (!this.#graph) return;

    const { context, contour } = this.#graph;
    const { attack, decay, sustain, release } = this.#patch.filter.envelope;
    const now = context.currentTime;
    const amount = this.#patch.filter.contourAmount * 2200;

    contour.gain.cancelScheduledValues(now);

    if (noteOn) {
      contour.gain.setValueAtTime(0, now);
      contour.gain.linearRampToValueAtTime(amount, now + seconds(attack));
      const sustainLevel = amount * sustain;
      contour.gain.linearRampToValueAtTime(sustainLevel, now + seconds(attack) + seconds(decay));
      return;
    }

    contour.gain.setValueAtTime(Math.max(contour.gain.value, 0), now);
    contour.gain.linearRampToValueAtTime(0, now + seconds(release));
  }
}
