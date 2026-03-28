import { startTransition, useDeferredValue, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { defaultPatch } from "./config/defaultPatch";
import { Knob } from "./components/Knob";
import { DiscreteKnob } from "./components/DiscreteKnob";
import { Toggle } from "./components/Toggle";
import { WaveformScope } from "./components/WaveformScope";
import { FilterScope } from "./components/FilterScope";
import { AmplitudeScope } from "./components/AmplitudeScope";
import { useSynthEngine } from "./audio/engine/useSynthEngine";
import { useKeyboardSynth } from "./hooks/useKeyboardSynth";
import type { ModulationDestination, NoiseColor, OscillatorRange, OscillatorWave, SynthPatch } from "./types/synth";

type LoopUiState = {
  hasLoop: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  duration: number;
  mode: "replace" | "overdub" | null;
};

const RANGE_OPTIONS: { label: string; value: OscillatorRange }[] = [
  { label: "Lo", value: "lo" },
  { label: "32", value: "32" },
  { label: "16", value: "16" },
  { label: "8", value: "8" },
  { label: "4", value: "4" },
  { label: "2", value: "2" },
];

const WAVE_OPTIONS: { label: string; value: OscillatorWave }[] = [
  { label: "△", value: "triangle" },
  { label: "◁", value: "sharktooth" },
  { label: "╱", value: "sawtooth" },
  { label: "╲", value: "reverse-saw" },
  { label: "▢", value: "square" },
  { label: "▰", value: "wide-pulse" },
  { label: "▮", value: "narrow-pulse" },
];

const NOISE_OPTIONS: { label: string; value: NoiseColor }[] = [
  { label: "White", value: "white" },
  { label: "Pink", value: "pink" },
];

const MOD_DEST_OPTIONS: { label: string; value: ModulationDestination }[] = [
  { label: "Osc", value: "oscillator" },
  { label: "Mix", value: "mix" },
  { label: "Filter", value: "filter" },
];

function updatePatch(setter: Dispatch<SetStateAction<SynthPatch>>, recipe: (patch: SynthPatch) => SynthPatch) {
  startTransition(() => {
    setter((current) => recipe(current));
  });
}

export function App() {
  const [patch, setPatch] = useState(defaultPatch);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [loopState, setLoopState] = useState<LoopUiState>({
    hasLoop: false,
    isPlaying: false,
    isRecording: false,
    duration: 0,
    mode: null,
  });
  const deferredPatch = useDeferredValue(patch);
  const engineRef = useSynthEngine(deferredPatch);
  useKeyboardSynth(engineRef);

  const analyser = engineRef.current?.getAnalyser() ?? null;
  const signalSummary = deferredPatch.oscillators.map((oscillator) => `${oscillator.id}:${oscillator.wave}`).join(" / ");

  useEffect(() => {
    setLoopState(engineRef.current?.getLoopSnapshot() ?? {
      hasLoop: false,
      isPlaying: false,
      isRecording: false,
      duration: 0,
      mode: null,
    });
  }, [engineRef]);

  const setOscillator = (index: number, recipe: (oscillator: SynthPatch["oscillators"][number]) => SynthPatch["oscillators"][number]) => {
    updatePatch(setPatch, (current) => ({
      ...current,
      oscillators: current.oscillators.map((oscillator, oscillatorIndex) =>
        oscillatorIndex === index ? recipe(oscillator) : oscillator,
      ) as SynthPatch["oscillators"],
    }));
  };

  async function armAudio(): Promise<void> {
    try {
      await engineRef.current?.unlock();
      setAudioEnabled(true);
      setAudioError(null);
    } catch {
      setAudioError("Audio could not start. Reload and allow browser audio.");
    }
  }

  async function startLoopRecording(mode: "replace" | "overdub"): Promise<void> {
    try {
      await armAudio();
      const snapshot = await engineRef.current?.startLoopRecording(mode);
      if (snapshot) setLoopState(snapshot);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Loop recording could not start.");
    }
  }

  async function stopLoopRecording(): Promise<void> {
    try {
      const snapshot = await engineRef.current?.stopLoopRecording();
      if (snapshot) setLoopState(snapshot);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Loop recording could not stop.");
    }
  }

  async function toggleLoopPlayback(): Promise<void> {
    try {
      const snapshot = await engineRef.current?.setLoopPlayback(!loopState.isPlaying);
      if (snapshot) setLoopState(snapshot);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Loop playback could not change.");
    }
  }

  function clearLoop(): void {
    setLoopState(engineRef.current?.clearLoop() ?? loopState);
  }

  useEffect(() => {
    const enable = () => {
      void armAudio();
    };

    window.addEventListener("pointerdown", enable, { once: true });
    window.addEventListener("keydown", enable, { once: true });

    return () => {
      window.removeEventListener("pointerdown", enable);
      window.removeEventListener("keydown", enable);
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="display-panel" aria-labelledby="display-title">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Monophonic Browser Synth</p>
            <h1 id="display-title">MMM-01</h1>
          </div>
          <div className="status-cluster" aria-label="Current synth status">
            <span>React + TS + Vite</span>
            <span>Mono Keyboard</span>
            <span>Audio Engine</span>
          </div>
        </div>

        <div className="arm-bar">
          <button type="button" className={audioEnabled ? "arm-button is-live" : "arm-button"} onClick={() => void armAudio()}>
            {audioEnabled ? "Audio Enabled" : "Click To Enable Audio"}
          </button>
          {audioError ? <p className="signal-detail">{audioError}</p> : null}
        </div>

        <div className="display-grid">
          <div className="scope-frame">
            <WaveformScope analyser={analyser} oscillators={deferredPatch.oscillators} />
          </div>
          <div className="signal-card">
            <p className="signal-label">Signal Flow</p>
            <div className="flow-pill-row">
              <span className="flow-pill">OSC 1</span>
              <span className="flow-pill">OSC 2</span>
              <span className="flow-pill">OSC 3</span>
              <span className="flow-pill">NOISE</span>
            </div>
            <p className="signal-arrow">MIXER  →  LADDER FILTER  →  AMP</p>
            <p className="signal-value">Hardwired monophonic path</p>
            <p className="signal-detail">{signalSummary}</p>

            <div className="looper-card">
              <div className="looper-head">
                <p className="signal-label">Looper</p>
                <span className="mini-readout">
                  {loopState.hasLoop ? `${loopState.duration.toFixed(1)}s` : "Empty"}
                </span>
              </div>
              <div className="looper-actions">
                <button
                  type="button"
                  className={loopState.isRecording && loopState.mode === "replace" ? "arm-button is-live" : "arm-button"}
                  onClick={() => (loopState.isRecording ? void stopLoopRecording() : void startLoopRecording("replace"))}
                >
                  {loopState.isRecording && loopState.mode === "replace" ? "Stop Rec" : "Record"}
                </button>
                <button
                  type="button"
                  className={loopState.isRecording && loopState.mode === "overdub" ? "arm-button is-live" : "arm-button"}
                  onClick={() => (loopState.isRecording ? void stopLoopRecording() : void startLoopRecording("overdub"))}
                  disabled={!loopState.hasLoop && !loopState.isRecording}
                >
                  {loopState.isRecording && loopState.mode === "overdub" ? "Stop Dub" : "Overdub"}
                </button>
                <button
                  type="button"
                  className={loopState.isPlaying ? "arm-button is-live" : "arm-button"}
                  onClick={() => void toggleLoopPlayback()}
                  disabled={!loopState.hasLoop || loopState.isRecording}
                >
                  {loopState.isPlaying ? "Stop Loop" : "Play Loop"}
                </button>
                <button type="button" className="arm-button" onClick={clearLoop} disabled={!loopState.hasLoop && !loopState.isRecording}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="control-grid" aria-label="Synth controls">
        <article className="module">
          <div className="module-head">
            <p className="eyebrow">Source</p>
            <h2>Oscillator Bank</h2>
          </div>

          <div className="osc-grid">
            {patch.oscillators.map((oscillator, index) => (
              <div key={oscillator.id} className={`osc-card osc-card-${oscillator.id} ${oscillator.enabled ? "is-enabled" : ""}`}>
                <div className="osc-title">
                  <span>{`Osc ${oscillator.id}`}</span>
                  <span className="mini-readout">{oscillator.wave}</span>
                </div>

                <div className="knob-row">
                  <Knob
                    label="Fine Tune"
                    value={oscillator.fineTune}
                    min={-7}
                    max={7}
                    step={0.1}
                    formatValue={(value) => `${value.toFixed(1)} st`}
                    onChange={(fineTune) => setOscillator(index, (current) => ({ ...current, fineTune }))}
                  />
                  <Knob
                    label="Mixer Volume"
                    value={oscillator.mixerVolume}
                    min={0}
                    max={1}
                    step={0.01}
                    formatValue={(value) => `${Math.round(value * 10)}`}
                    onChange={(mixerVolume) => setOscillator(index, (current) => ({ ...current, mixerVolume }))}
                  />
                  <DiscreteKnob
                    label={`Oscillator ${oscillator.id} range`}
                    value={oscillator.range}
                    options={RANGE_OPTIONS}
                    onChange={(range) => setOscillator(index, (current) => ({ ...current, range }))}
                  />

                  <DiscreteKnob
                    label={`Oscillator ${oscillator.id} waveform`}
                    value={oscillator.wave}
                    options={WAVE_OPTIONS}
                    onChange={(wave) => setOscillator(index, (current) => ({ ...current, wave }))}
                  />
                </div>

                <div className="toggle-row">
                  <Toggle
                    label="Enabled"
                    checked={oscillator.enabled}
                    onChange={(enabled) => setOscillator(index, (current) => ({ ...current, enabled }))}
                  />
                  {oscillator.id === 2 ? (
                    <Toggle
                      label="Keyboard Ctrl"
                      checked={oscillator.keyboardTracking}
                      onChange={(keyboardTracking) => setOscillator(index, (current) => ({ ...current, keyboardTracking }))}
                    />
                  ) : (
                    <div className="toggle-spacer" aria-hidden="true" />
                  )}
                  {oscillator.id === 3 ? (
                    <Toggle
                      label="VCO 3 as LFO"
                      checked={oscillator.lfoMode}
                      onChange={(lfoMode) => setOscillator(index, (current) => ({ ...current, lfoMode, keyboardTracking: !lfoMode }))}
                    />
                  ) : (
                    <div className="toggle-spacer" aria-hidden="true" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>

        <div className="middle-grid">
          <article className="module">
            <div className="module-head">
              <p className="eyebrow">Mixer</p>
              <h2>Noise And Input</h2>
            </div>

            <div className="mixer-grid">
              <Knob
                label="Noise Volume"
                value={patch.noise.volume}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => `${Math.round(value * 10)}`}
                onChange={(volume) =>
                  updatePatch(setPatch, (current) => ({
                    ...current,
                    noise: { ...current.noise, volume },
                  }))
                }
              />
              <Knob
                label="External Volume"
                value={patch.externalVolume}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => `${Math.round(value * 10)}`}
                onChange={(externalVolume) => updatePatch(setPatch, (current) => ({ ...current, externalVolume }))}
              />
              <Knob
                label="Master Volume"
                value={patch.output.masterVolume}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => `${Math.round(value * 10)}`}
                onChange={(masterVolume) =>
                  updatePatch(setPatch, (current) => ({
                    ...current,
                    output: { ...current.output, masterVolume },
                  }))
                }
              />
              <Knob
                label="Noise Attack"
                value={patch.noise.envelope.attack}
                min={0.005}
                max={2}
                step={0.01}
                formatValue={(value) => `${value.toFixed(2)} s`}
                onChange={(attack) =>
                  updatePatch(setPatch, (current) => ({
                    ...current,
                    noise: { ...current.noise, envelope: { ...current.noise.envelope, attack } },
                  }))
                }
              />
              <Knob
                label="Noise Decay"
                value={patch.noise.envelope.decay}
                min={0.005}
                max={4}
                step={0.01}
                formatValue={(value) => `${value.toFixed(2)} s`}
                onChange={(decay) =>
                  updatePatch(setPatch, (current) => ({
                    ...current,
                    noise: { ...current.noise, envelope: { ...current.noise.envelope, decay } },
                  }))
                }
              />
              <Knob
                label="Noise Sustain"
                value={patch.noise.envelope.sustain}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => `${Math.round(value * 100)}%`}
                onChange={(sustain) =>
                  updatePatch(setPatch, (current) => ({
                    ...current,
                    noise: { ...current.noise, envelope: { ...current.noise.envelope, sustain } },
                  }))
                }
              />
              <Knob
                label="Noise Release"
                value={patch.noise.envelope.release}
                min={0.005}
                max={4}
                step={0.01}
                formatValue={(value) => `${value.toFixed(2)} s`}
                onChange={(release) =>
                  updatePatch(setPatch, (current) => ({
                    ...current,
                    noise: { ...current.noise, envelope: { ...current.noise.envelope, release } },
                  }))
                }
              />
              <DiscreteKnob
                label="Noise Color"
                value={patch.noise.color}
                options={NOISE_OPTIONS}
                onChange={(color) =>
                  updatePatch(setPatch, (current) => ({
                    ...current,
                    noise: { ...current.noise, color },
                  }))
                }
              />
              <div className="mixer-toggle-cell">
                <Toggle
                  label="Noise Enabled"
                  checked={patch.noise.enabled}
                  onChange={(enabled) =>
                    updatePatch(setPatch, (current) => ({
                      ...current,
                      noise: { ...current.noise, enabled },
                    }))
                  }
                />
              </div>
            </div>
          </article>

          <article className="module">
          <div className="module-head">
            <p className="eyebrow">Shaping</p>
            <h2>Filter Contour</h2>
          </div>

          <div className="shaping-top">
            <FilterScope
              cutoff={patch.filter.cutoff}
              emphasis={patch.filter.emphasis}
              contourAmount={patch.filter.contourAmount}
              attack={patch.filter.envelope.attack}
              decay={patch.filter.envelope.decay}
              sustain={patch.filter.envelope.sustain}
              release={patch.filter.envelope.release}
            />
          </div>

          <div className="knob-row knob-row-wide">
            <Knob
              label="Cutoff"
              value={patch.filter.cutoff}
              min={40}
              max={12000}
              step={10}
              formatValue={(value) => `${Math.round(value)} Hz`}
              onChange={(cutoff) => updatePatch(setPatch, (current) => ({ ...current, filter: { ...current.filter, cutoff } }))}
            />
            <Knob
              label="Emphasis"
              value={patch.filter.emphasis}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 10)}`}
              onChange={(emphasis) => updatePatch(setPatch, (current) => ({ ...current, filter: { ...current.filter, emphasis } }))}
            />
            <Knob
              label="Contour"
              value={patch.filter.contourAmount}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 10)}`}
              onChange={(contourAmount) =>
                updatePatch(setPatch, (current) => ({ ...current, filter: { ...current.filter, contourAmount } }))
              }
            />
            <Knob
              label="Filter Attack"
              value={patch.filter.envelope.attack}
              min={0.005}
              max={2}
              step={0.01}
              formatValue={(value) => `${value.toFixed(2)} s`}
              onChange={(attack) =>
                updatePatch(setPatch, (current) => ({
                  ...current,
                  filter: { ...current.filter, envelope: { ...current.filter.envelope, attack } },
                }))
              }
            />
            <Knob
              label="Filter Decay"
              value={patch.filter.envelope.decay}
              min={0.005}
              max={4}
              step={0.01}
              formatValue={(value) => `${value.toFixed(2)} s`}
              onChange={(decay) =>
                updatePatch(setPatch, (current) => ({
                  ...current,
                  filter: { ...current.filter, envelope: { ...current.filter.envelope, decay } },
                }))
              }
            />
            <Knob
              label="Filter Sustain"
              value={patch.filter.envelope.sustain}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onChange={(sustain) =>
                updatePatch(setPatch, (current) => ({
                  ...current,
                  filter: { ...current.filter, envelope: { ...current.filter.envelope, sustain } },
                }))
              }
            />
            <Knob
              label="Filter Release"
              value={patch.filter.envelope.release}
              min={0.005}
              max={4}
              step={0.01}
              formatValue={(value) => `${value.toFixed(2)} s`}
              onChange={(release) =>
                updatePatch(setPatch, (current) => ({
                  ...current,
                  filter: { ...current.filter, envelope: { ...current.filter.envelope, release } },
                }))
              }
            />
          </div>

          </article>
        </div>

        <div className="lower-grid">
          <article className="module">
            <div className="module-head">
              <p className="eyebrow">Amplitude</p>
              <h2>Loudness Contour</h2>
            </div>

            <div className="amplitude-top">
              <AmplitudeScope
                attack={patch.amplifier.envelope.attack}
                decay={patch.amplifier.envelope.decay}
                sustain={patch.amplifier.envelope.sustain}
                release={patch.amplifier.envelope.release}
                decayEnabled={patch.amplifier.decayEnabled}
              />
            </div>

            <div className="knob-row knob-row-wide">
            <Knob
              label="Amp Attack"
              value={patch.amplifier.envelope.attack}
              min={0.005}
              max={2}
              step={0.01}
              formatValue={(value) => `${value.toFixed(2)} s`}
              onChange={(attack) =>
                updatePatch(setPatch, (current) => ({
                  ...current,
                  amplifier: { ...current.amplifier, envelope: { ...current.amplifier.envelope, attack } },
                }))
              }
            />
            <Knob
              label="Amp Decay"
              value={patch.amplifier.envelope.decay}
              min={0.005}
              max={4}
              step={0.01}
              formatValue={(value) => `${value.toFixed(2)} s`}
              onChange={(decay) =>
                updatePatch(setPatch, (current) => ({
                  ...current,
                  amplifier: { ...current.amplifier, envelope: { ...current.amplifier.envelope, decay } },
                }))
              }
            />
            <Knob
              label="Amp Sustain"
              value={patch.amplifier.envelope.sustain}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onChange={(sustain) =>
                updatePatch(setPatch, (current) => ({
                  ...current,
                  amplifier: { ...current.amplifier, envelope: { ...current.amplifier.envelope, sustain } },
                }))
              }
            />
            <Knob
              label="Amp Release"
              value={patch.amplifier.envelope.release}
              min={0.005}
              max={4}
              step={0.01}
              formatValue={(value) => `${value.toFixed(2)} s`}
              onChange={(release) =>
                updatePatch(setPatch, (current) => ({
                  ...current,
                  amplifier: { ...current.amplifier, envelope: { ...current.amplifier.envelope, release } },
                }))
              }
            />
            </div>

            <div className="toggle-row">
              <Toggle
                label="Decay On"
                checked={patch.amplifier.decayEnabled}
                onChange={(decayEnabled) =>
                  updatePatch(setPatch, (current) => ({ ...current, amplifier: { ...current.amplifier, decayEnabled } }))
                }
              />
            </div>
          </article>

          <article className="module">
            <div className="module-head">
              <p className="eyebrow">Performance</p>
              <h2>Modulation And Glide</h2>
            </div>

            <div className="performance-grid">
              <Knob
                label="Mod Mix"
                value={patch.modulation.mix}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => `${Math.round(value * 100)}%`}
                onChange={(mix) =>
                  updatePatch(setPatch, (current) => ({ ...current, modulation: { ...current.modulation, mix } }))
                }
              />
              <Knob
                label="Mod Wheel"
                value={patch.modulation.wheel}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => `${Math.round(value * 100)}%`}
                onChange={(wheel) =>
                  updatePatch(setPatch, (current) => ({ ...current, modulation: { ...current.modulation, wheel } }))
                }
              />
              <Knob
                label="Pitch Bend"
                value={patch.modulation.pitchBend}
                min={-1}
                max={1}
                step={0.01}
                formatValue={(value) => `${value.toFixed(2)} st`}
                onChange={(pitchBend) =>
                  updatePatch(setPatch, (current) => ({ ...current, modulation: { ...current.modulation, pitchBend } }))
                }
              />
              <Knob
                label="Glide"
                value={patch.modulation.glideTime}
                min={0}
                max={1.5}
                step={0.01}
                formatValue={(value) => `${value.toFixed(2)} s`}
                onChange={(glideTime) =>
                  updatePatch(setPatch, (current) => ({ ...current, modulation: { ...current.modulation, glideTime } }))
                }
              />
              <Knob
                label="Transpose"
                value={patch.performance.transpose}
                min={-24}
                max={24}
                step={1}
                formatValue={(value) => `${Math.round(value)} st`}
                onChange={(transpose) =>
                  updatePatch(setPatch, (current) => ({ ...current, performance: { ...current.performance, transpose } }))
                }
              />
              <DiscreteKnob
                label="Mod Destination"
                value={patch.modulation.destination}
                options={MOD_DEST_OPTIONS}
                onChange={(destination) =>
                  updatePatch(setPatch, (current) => ({ ...current, modulation: { ...current.modulation, destination } }))
                }
              />
            </div>

            <div className="toggle-row">
              <Toggle
                label="Glide On"
                checked={patch.modulation.glideEnabled}
                onChange={(glideEnabled) =>
                  updatePatch(setPatch, (current) => ({ ...current, modulation: { ...current.modulation, glideEnabled } }))
                }
              />
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
