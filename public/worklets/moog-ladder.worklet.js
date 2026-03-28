class MoogLadderFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "cutoff", defaultValue: 1800, minValue: 20, maxValue: 20000, automationRate: "a-rate" },
      { name: "resonance", defaultValue: 0.8, minValue: 0.1, maxValue: 3.9, automationRate: "a-rate" },
      { name: "drive", defaultValue: 1.0, minValue: 0.5, maxValue: 4.0, automationRate: "a-rate" },
    ];
  }

  constructor() {
    super();
    this.z1 = 0;
    this.z2 = 0;
    this.z3 = 0;
    this.z4 = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;

    const inputChannel = input[0];
    const outputChannel = output[0];
    const cutoffValues = parameters.cutoff;
    const resonanceValues = parameters.resonance;
    const driveValues = parameters.drive;

    for (let index = 0; index < outputChannel.length; index += 1) {
      const inputSample = inputChannel[index] ?? 0;
      const cutoff = cutoffValues.length > 1 ? cutoffValues[index] : cutoffValues[0];
      const resonance = resonanceValues.length > 1 ? resonanceValues[index] : resonanceValues[0];
      const drive = driveValues.length > 1 ? driveValues[index] : driveValues[0];

      const g = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      const feedback = resonance * 0.85;
      const driven = Math.tanh(inputSample * drive - this.z4 * feedback);

      this.z1 += g * (driven - this.z1);
      this.z2 += g * (this.z1 - this.z2);
      this.z3 += g * (this.z2 - this.z3);
      this.z4 += g * (this.z3 - this.z4);

      outputChannel[index] = Math.max(-1, Math.min(1, this.z4));
    }

    return true;
  }
}

registerProcessor("moog-ladder-filter", MoogLadderFilterProcessor);
