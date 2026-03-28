import { startTransition, useDeferredValue, useState, type Dispatch, type SetStateAction } from "react";
import { defaultPatch } from "./config/defaultPatch";
import { Knob } from "./components/Knob";
import { Selector } from "./components/Selector";
import { Toggle } from "./components/Toggle";
import { WaveformScope } from "./components/WaveformScope";
import { Keyboard } from "./components/Keyboard";
import { useSynthEngine } from "./audio/engine/useSynthEngine";
import { useKeyboardSynth } from "./hooks/useKeyboardSynth";
import type { ModulationDestination, NoiseColor, OscillatorRange, OscillatorWave, SynthPatch } from "./types/synth";

const RANGE_OPTIONS: { label: string; value: OscillatorRange }[] = [
  { label: "Lo", value: "lo" },
  { label: "32", value: "32" },
  { label: "16", value: "16" },
  { label: "8", value: "8" },
  { label: "4", value: "4" },
  { label: "2", value: "2" },
];

const WAVE_OPTIONS: { label: string; value: OscillatorWave }[] = [
  { label: "Tri", value: "triangle" },
  { label: "Shark", value: "sharktooth" },
  { label: "Saw", value: "sawtooth" },
  { label: "Rev", value: "reverse-saw" },
  { label: "Sq", value: "square" },
  { label: "Wide", value: "wide-pulse" },
  { label: "Narrow", value: "narrow-pulse" },
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
  const deferredPatch = useDeferredValue(patch);
  const engineRef = useSynthEngine(deferredPatch);
  useKeyboardSynth(engineRef);

  const analyser = engineRef.current?.getAnalyser() ?? null;
  const signalSummary = deferredPatch.oscillators.map((oscillator) => `${oscillator.id}:${oscillator.wave}`).join(" / ");

  const setOscillator = (index: number, recipe: (oscillator: SynthPatch["oscillators"][number]) => SynthPatch["oscillators"][number]) => {
    updatePatch(setPatch, (current) => ({
      ...current,
      oscillators: current.oscillators.map((oscillator, oscillatorIndex) =>
        oscillatorIndex === index ? recipe(oscillator) : oscillator,
      ) as SynthPatch["oscillators"],
    }));
  };

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

        <div className="display-grid">
          <div className="scope-frame">
            <WaveformScope analyser={analyser} />
          </div>
          <div className="signal-card">
            <p className="signal-label">Signal Flow</p>
            <p className="signal-value">OSC 1 / OSC 2 / OSC 3 / NOISE / EXT</p>
            <p className="signal-arrow">MIXER &gt; LADDER FILTER &gt; AMP</p>
            <p className="signal-detail">{signalSummary}</p>
            <p className="signal-detail">Keys: Z-M / Q-I</p>
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
              <div key={oscillator.id} className="osc-card">
                <div className="osc-title">
                  <span>{`Osc ${oscillator.id}`}</span>
                  <span className="mini-readout">{oscillator.wave}</span>
                </div>

                <Selector
                  label={`Oscillator ${oscillator.id} range`}
                  value={oscillator.range}
                  options={RANGE_OPTIONS}
                  onChange={(range) => setOscillator(index, (current) => ({ ...current, range }))}
                />

                <Selector
                  label={`Oscillator ${oscillator.id} waveform`}
                  value={oscillator.wave}
                  options={WAVE_OPTIONS}
                  onChange={(wave) => setOscillator(index, (current) => ({ ...current, wave }))}
                />

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
                  ) : null}
                  {oscillator.id === 3 ? (
                    <Toggle
                      label="VCO 3 as LFO"
                      checked={oscillator.lfoMode}
                      onChange={(lfoMode) => setOscillator(index, (current) => ({ ...current, lfoMode, keyboardTracking: !lfoMode }))}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="module">
          <div className="module-head">
            <p className="eyebrow">Mixer</p>
            <h2>Noise And Input</h2>
          </div>

          <div className="module-grid">
            <Selector
              label="Noise Color"
              value={patch.noiseColor}
              options={NOISE_OPTIONS}
              onChange={(noiseColor) => updatePatch(setPatch, (current) => ({ ...current, noiseColor }))}
            />
            <div className="knob-row knob-row-wide">
              <Knob
                label="Noise Volume"
                value={patch.noiseVolume}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => `${Math.round(value * 10)}`}
                onChange={(noiseVolume) => updatePatch(setPatch, (current) => ({ ...current, noiseVolume }))}
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
            </div>
          </div>
        </article>

        <article className="module">
          <div className="module-head">
            <p className="eyebrow">Shaping</p>
            <h2>Filter Contour</h2>
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

          <div className="toggle-row">
            <Toggle
              label="Keyboard Ctrl 1"
              checked={patch.filter.keyboardControl1}
              onChange={(keyboardControl1) =>
                updatePatch(setPatch, (current) => ({ ...current, filter: { ...current.filter, keyboardControl1 } }))
              }
            />
            <Toggle
              label="Keyboard Ctrl 2"
              checked={patch.filter.keyboardControl2}
              onChange={(keyboardControl2) =>
                updatePatch(setPatch, (current) => ({ ...current, filter: { ...current.filter, keyboardControl2 } }))
              }
            />
          </div>
        </article>

        <article className="module">
          <div className="module-head">
            <p className="eyebrow">Amplitude</p>
            <h2>Loudness Contour</h2>
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

          <Selector
            label="Mod Destination"
            value={patch.modulation.destination}
            options={MOD_DEST_OPTIONS}
            onChange={(destination) =>
              updatePatch(setPatch, (current) => ({ ...current, modulation: { ...current.modulation, destination } }))
            }
          />

          <div className="knob-row knob-row-wide">
            <Knob
              label="Mod Mix"
              value={patch.modulation.mix}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onChange={(mix) => updatePatch(setPatch, (current) => ({ ...current, modulation: { ...current.modulation, mix } }))}
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
      </section>

      <Keyboard
        onNoteStart={(note) => {
          void engineRef.current?.noteOn(note);
        }}
        onNoteEnd={(note) => {
          engineRef.current?.noteOff(note);
        }}
      />
    </main>
  );
}
