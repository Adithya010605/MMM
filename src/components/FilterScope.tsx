type FilterScopeProps = {
  cutoff: number;
  emphasis: number;
  contourAmount: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function FilterScope({ cutoff, emphasis, contourAmount, attack, decay, sustain, release }: FilterScopeProps) {
  const width = 360;
  const height = 140;
  const filterPoints: string[] = [];
  const envelopePoints: string[] = [];
  const cutoffNormalized = clamp((Math.log10(cutoff) - Math.log10(40)) / (Math.log10(12000) - Math.log10(40)), 0, 1);
  const resonance = 0.16 + emphasis * 0.58;
  const contourLift = contourAmount * 18;

  for (let index = 0; index <= 52; index += 1) {
    const x = (index / 52) * width;
    const t = index / 52;
    const logistic = 1 / (1 + Math.exp(-(t - cutoffNormalized) * 16));
    const base = 18 + logistic * 84;
    const peak = Math.exp(-((t - cutoffNormalized) ** 2) / 0.0025) * resonance * 52;
    const y = clamp(base - peak - contourLift * (1 - t), 8, height - 8);
    filterPoints.push(`${x},${y}`);
  }

  const total = attack + decay + release + 0.25;
  const attackX = clamp((attack / total) * width * 0.72, 18, width * 0.28);
  const decayX = clamp(attackX + (decay / total) * width * 0.86, attackX + 22, width * 0.72);
  const releaseStartX = clamp(width * 0.78, decayX + 20, width - 42);
  const releaseEndX = width - 14;
  const floorY = height - 18;
  const peakY = 22 - contourLift * 0.2;
  const sustainY = floorY - sustain * 56;
  envelopePoints.push(`14,${floorY}`);
  envelopePoints.push(`${attackX},${peakY}`);
  envelopePoints.push(`${decayX},${sustainY}`);
  envelopePoints.push(`${releaseStartX},${sustainY}`);
  envelopePoints.push(`${releaseEndX},${floorY}`);

  const filterArea = `M 0 ${height - 8} L ${filterPoints.join(" L ")} L ${width} ${height - 8} Z`;
  const envelopeArea = `M 14 ${floorY} L ${attackX} ${peakY} L ${decayX} ${sustainY} L ${releaseStartX} ${sustainY} L ${releaseEndX} ${floorY} L ${releaseEndX} ${floorY} Z`;

  return (
    <div className="filter-scope-frame" aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} className="filter-scope">
        <defs>
          <linearGradient id="filter-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
          <linearGradient id="env-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(180,180,180,0.24)" />
            <stop offset="100%" stopColor="rgba(180,180,180,0.03)" />
          </linearGradient>
        </defs>
        <path d={`M0 ${height / 2} H${width}`} className="filter-grid-mid" />
        <path d={`M0 20 H${width} M0 ${height - 20} H${width}`} className="filter-grid" />
        <path d={filterArea} className="filter-area" />
        <path d={envelopeArea} className="filter-envelope-area" />
        <polyline points={filterPoints.join(" ")} className="filter-curve" />
        <polyline points={envelopePoints.join(" ")} className="filter-envelope-curve" />
      </svg>
    </div>
  );
}
