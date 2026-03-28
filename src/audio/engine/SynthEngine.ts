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
  loopGain: GainNode;
  filter: AudioWorkletNode;
  mixer: GainNode;
  contour: GainNode;
  contourSource: ConstantSourceNode;
  lfoSourceGain: GainNode;
  pitchModGain: GainNode;
  filterModGain: GainNode;
  oscillatorNodes: Array<{
    source: OscillatorNode;
    mixGain: GainNode;
    pitchGain: GainNode;
  }>;
  noiseSource: AudioBufferSourceNode;
  noiseLevelGain: GainNode;
  noiseEnvelopeGain: GainNode;
  mediaDestination: MediaStreamAudioDestinationNode;
  periodicWaves: Partial<Record<OscillatorWave, PeriodicWave>>;
};

type LoopRecordingMode = "replace" | "overdub";

type LoopSnapshot = {
  hasLoop: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  duration: number;
  mode: LoopRecordingMode | null;
};

type LoopState = {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  isPlaying: boolean;
  isRecording: boolean;
  mode: LoopRecordingMode | null;
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

function createPeriodicWave(
  context: AudioContext,
  harmonicFormula: (harmonic: number) => number,
  length = 64,
): PeriodicWave {
  const real = new Float32Array(length);
  const imag = new Float32Array(length);

  for (let harmonic = 1; harmonic < length; harmonic += 1) {
    imag[harmonic] = harmonicFormula(harmonic);
  }

  return context.createPeriodicWave(real, imag);
}

function createPeriodicWaves(context: AudioContext): Partial<Record<OscillatorWave, PeriodicWave>> {
  return {
    sharktooth: createPeriodicWave(context, (harmonic) => (harmonic % 2 === 0 ? 0.38 / harmonic : 1 / harmonic)),
    "reverse-saw": createPeriodicWave(context, (harmonic) => -1 / harmonic),
    "wide-pulse": createPeriodicWave(context, (harmonic) => (2 * Math.sin(Math.PI * harmonic * 0.72)) / (Math.PI * harmonic)),
    "narrow-pulse": createPeriodicWave(context, (harmonic) => (2 * Math.sin(Math.PI * harmonic * 0.18)) / (Math.PI * harmonic)),
  };
}

function applyWaveform(
  source: OscillatorNode,
  wave: OscillatorWave,
  periodicWaves: Partial<Record<OscillatorWave, PeriodicWave>>,
): void {
  if (wave === "triangle" || wave === "sawtooth" || wave === "square") {
    source.type = WAVEFORMS[wave];
    return;
  }

  const periodicWave = periodicWaves[wave];
  if (periodicWave) source.setPeriodicWave(periodicWave);
}

export class SynthEngine {
  #graph: SynthGraph | null = null;
  #patch: SynthPatch;
  #voice: VoiceState = { activeNote: null, heldNotes: [] };
  #readyPromise: Promise<void> | null = null;
  #loop: LoopState = {
    buffer: null,
    source: null,
    recorder: null,
    chunks: [],
    isPlaying: false,
    isRecording: false,
    mode: null,
  };

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

  async unlock(): Promise<void> {
    await this.ensureReady();
    if (!this.#graph) return;
    if (this.#graph.context.state !== "running") {
      await this.#graph.context.resume();
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.#graph?.analyser ?? null;
  }

  getLoopSnapshot(): LoopSnapshot {
    return {
      hasLoop: this.#loop.buffer !== null,
      isPlaying: this.#loop.isPlaying,
      isRecording: this.#loop.isRecording,
      duration: this.#loop.buffer?.duration ?? 0,
      mode: this.#loop.mode,
    };
  }

  async startLoopRecording(mode: LoopRecordingMode): Promise<LoopSnapshot> {
    await this.unlock();
    if (!this.#graph) return this.getLoopSnapshot();
    if (typeof MediaRecorder === "undefined") {
      throw new Error("This browser does not support loop recording.");
    }
    if (this.#loop.isRecording) return this.getLoopSnapshot();

    if (mode === "replace") {
      this.stopLoopPlayback();
    } else if (this.#loop.buffer) {
      this.stopLoopPlayback();
      this.startLoopPlayback(true);
    }

    const recorder = new MediaRecorder(this.#graph.mediaDestination.stream);
    const chunks: Blob[] = [];

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    this.#loop.recorder = recorder;
    this.#loop.chunks = chunks;
    this.#loop.isRecording = true;
    this.#loop.mode = mode;
    recorder.start();

    return this.getLoopSnapshot();
  }

  async stopLoopRecording(): Promise<LoopSnapshot> {
    if (!this.#graph || !this.#loop.recorder || !this.#loop.isRecording) {
      return this.getLoopSnapshot();
    }

    const { recorder } = this.#loop;

    const recordingStopped = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener(
        "stop",
        () => {
          try {
            resolve(new Blob(this.#loop.chunks, { type: recorder.mimeType || "audio/webm" }));
          } catch (error) {
            reject(error);
          }
        },
        { once: true },
      );
      recorder.addEventListener("error", () => reject(new Error("Loop recording failed.")), { once: true });
    });

    recorder.requestData();
    recorder.stop();

    const blob = await recordingStopped;
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await this.#graph.context.decodeAudioData(arrayBuffer.slice(0));
    const nextLoopBuffer =
      this.#loop.mode === "overdub" && this.#loop.buffer
        ? this.#mergeLoopBuffers(this.#loop.buffer, audioBuffer, this.#graph.context)
        : audioBuffer;

    this.#loop.buffer = nextLoopBuffer;
    this.#loop.recorder = null;
    this.#loop.chunks = [];
    this.#loop.isRecording = false;
    this.#loop.mode = null;

    this.startLoopPlayback(true);
    return this.getLoopSnapshot();
  }

  async setLoopPlayback(enabled: boolean): Promise<LoopSnapshot> {
    await this.unlock();
    if (enabled) {
      this.startLoopPlayback();
    } else {
      this.stopLoopPlayback();
    }
    return this.getLoopSnapshot();
  }

  clearLoop(): LoopSnapshot {
    this.stopLoopPlayback();
    if (this.#loop.recorder && this.#loop.isRecording) {
      this.#loop.recorder.stop();
    }
    this.#loop.buffer = null;
    this.#loop.recorder = null;
    this.#loop.chunks = [];
    this.#loop.isRecording = false;
    this.#loop.mode = null;
    return this.getLoopSnapshot();
  }

  updatePatch(nextPatch: SynthPatch): void {
    this.#patch = nextPatch;
    if (!this.#graph) return;

    const { context, master, contour, lfoSourceGain, oscillatorNodes, noiseLevelGain, filter, pitchModGain, filterModGain, periodicWaves } =
      this.#graph;
    const now = context.currentTime;

    master.gain.setTargetAtTime(nextPatch.output.masterVolume, now, 0.02);
    contour.gain.setTargetAtTime(nextPatch.filter.contourAmount * 2200, now, 0.02);
    noiseLevelGain.gain.setTargetAtTime(nextPatch.noise.enabled ? nextPatch.noise.volume : 0, now, 0.02);
    lfoSourceGain.gain.setTargetAtTime(nextPatch.oscillators[2].lfoMode ? 1 : 0, now, 0.02);

    oscillatorNodes.forEach((node, index) => {
      const osc = nextPatch.oscillators[index];
      node.mixGain.gain.setTargetAtTime(osc.enabled && !osc.lfoMode ? osc.mixerVolume : 0, now, 0.02);
      applyWaveform(node.source, osc.wave, periodicWaves);
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
    await this.unlock();
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
    const workletUrl = `${import.meta.env.BASE_URL}worklets/moog-ladder.worklet.js`;
    await context.audioWorklet.addModule(workletUrl);

    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;

    const master = context.createGain();
    const amp = context.createGain();
    const loopGain = context.createGain();
    const mixer = context.createGain();
    const contour = context.createGain();
    const contourSource = context.createConstantSource();
    const lfoSourceGain = context.createGain();
    const pitchModGain = context.createGain();
    const filterModGain = context.createGain();
    const mediaDestination = context.createMediaStreamDestination();
    const periodicWaves = createPeriodicWaves(context);

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

      applyWaveform(source, osc.wave, periodicWaves);
      source.connect(mixGain).connect(mixer);
      pitchGain.connect(source.detune);
      pitchModGain.connect(pitchGain);

      mixGain.gain.value = osc.enabled && !osc.lfoMode ? osc.mixerVolume : 0;
      source.start();

      return { source, mixGain, pitchGain };
    });

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = this.#createNoiseBuffer(context, this.#patch.noise.color);
    noiseSource.loop = true;
    const noiseLevelGain = context.createGain();
    const noiseEnvelopeGain = context.createGain();
    noiseLevelGain.gain.value = this.#patch.noise.enabled ? this.#patch.noise.volume : 0;
    noiseEnvelopeGain.gain.value = 0;
    noiseSource.connect(noiseLevelGain).connect(noiseEnvelopeGain).connect(mixer);
    noiseSource.start();

    contourSource.offset.value = 1;
    contourSource.connect(contour).connect(filter.parameters.get("cutoff")!);
    contourSource.start();

    mixer.connect(filter).connect(amp).connect(master);
    amp.connect(mediaDestination);
    loopGain.connect(master);
    master.connect(analyser);
    analyser.connect(context.destination);
    amp.gain.value = 0;
    loopGain.gain.value = 1;
    master.gain.value = this.#patch.output.masterVolume;

    const lfoNode = oscillatorNodes[2];
    lfoSourceGain.gain.value = this.#patch.oscillators[2].lfoMode ? 1 : 0;
    lfoNode.source.connect(lfoSourceGain);
    lfoSourceGain.connect(pitchModGain);
    lfoSourceGain.connect(filterModGain);
    filterModGain.connect(filter.parameters.get("cutoff")!);

    this.#graph = {
      context,
      analyser,
      master,
      amp,
      loopGain,
      filter,
      mixer,
      contour,
      contourSource,
      lfoSourceGain,
      pitchModGain,
      filterModGain,
      oscillatorNodes,
      noiseSource,
      noiseLevelGain,
      noiseEnvelopeGain,
      mediaDestination,
      periodicWaves,
    };

    this.updatePatch(this.#patch);
  }

  #createNoiseBuffer(context: AudioContext, color: SynthPatch["noise"]["color"]): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;

    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      if (color === "pink") {
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
    return destination === "oscillator" || destination === "mix" ? 1 : 0;
  }

  #filterModDepth(destination: ModulationDestination): number {
    return destination === "filter" || destination === "mix" ? this.#modDepth() * 180 : 0;
  }

  #modDepth(): number {
    return this.#patch.modulation.wheel * (0.15 + this.#patch.modulation.mix * 0.85) * 24;
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
      this.#triggerNoiseEnvelope(true);
      return;
    }

    amp.gain.setValueAtTime(Math.max(amp.gain.value, 0.0001), now);
    amp.gain.linearRampToValueAtTime(0, now + seconds(release));
    this.#triggerNoiseEnvelope(false);
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

  #triggerNoiseEnvelope(noteOn: boolean): void {
    if (!this.#graph) return;

    const { context, noiseEnvelopeGain } = this.#graph;
    const { attack, decay, sustain, release } = this.#patch.noise.envelope;
    const now = context.currentTime;

    noiseEnvelopeGain.gain.cancelScheduledValues(now);

    if (!this.#patch.noise.enabled) {
      noiseEnvelopeGain.gain.setValueAtTime(0, now);
      return;
    }

    if (noteOn) {
      noiseEnvelopeGain.gain.setValueAtTime(0, now);
      noiseEnvelopeGain.gain.linearRampToValueAtTime(1, now + seconds(attack));
      noiseEnvelopeGain.gain.linearRampToValueAtTime(sustain, now + seconds(attack) + seconds(decay));
      return;
    }

    noiseEnvelopeGain.gain.setValueAtTime(Math.max(noiseEnvelopeGain.gain.value, 0), now);
    noiseEnvelopeGain.gain.linearRampToValueAtTime(0, now + seconds(release));
  }

  startLoopPlayback(fromStart = false): void {
    if (!this.#graph || !this.#loop.buffer || this.#loop.isRecording) return;
    if (this.#loop.isPlaying && !fromStart) return;
    if (this.#loop.isPlaying && fromStart) this.stopLoopPlayback();

    const source = this.#graph.context.createBufferSource();
    source.buffer = this.#loop.buffer;
    source.loop = true;
    source.connect(this.#graph.loopGain);
    source.addEventListener("ended", () => {
      if (this.#loop.source === source) {
        this.#loop.source = null;
        this.#loop.isPlaying = false;
      }
    });
    source.start();
    this.#loop.source = source;
    this.#loop.isPlaying = true;
  }

  stopLoopPlayback(): void {
    const source = this.#loop.source;
    if (!source) {
      this.#loop.isPlaying = false;
      return;
    }

    this.#loop.source = null;
    this.#loop.isPlaying = false;
    source.stop();
    source.disconnect();
  }

  #mergeLoopBuffers(base: AudioBuffer, overdub: AudioBuffer, context: BaseAudioContext): AudioBuffer {
    const channels = Math.max(base.numberOfChannels, overdub.numberOfChannels);
    const merged = context.createBuffer(channels, base.length, base.sampleRate);

    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const output = merged.getChannelData(channelIndex);
      const baseData = base.getChannelData(Math.min(channelIndex, base.numberOfChannels - 1));
      const overdubData = overdub.getChannelData(Math.min(channelIndex, overdub.numberOfChannels - 1));

      output.set(baseData.subarray(0, base.length));

      for (let sampleIndex = 0; sampleIndex < overdub.length; sampleIndex += 1) {
        const loopIndex = sampleIndex % base.length;
        output[loopIndex] = clamp(output[loopIndex] + overdubData[sampleIndex], -1, 1);
      }
    }

    return merged;
  }
}
