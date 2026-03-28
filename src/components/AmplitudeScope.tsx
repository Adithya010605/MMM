type AmplitudeScopeProps = {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  decayEnabled: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function AmplitudeScope({ attack, decay, sustain, release, decayEnabled }: AmplitudeScopeProps) {
  const width = 360;
  const height = 132;
  const floorY = height - 16;
  const peakY = 18;
  const sustainY = decayEnabled ? floorY - sustain * 64 : 22;
  const total = attack + decay + release + 0.2;
  const attackX = clamp((attack / total) * width * 0.7, 20, width * 0.28);
  const decayX = clamp(attackX + (decay / total) * width * 0.82, attackX + 26, width * 0.72);
  const holdX = clamp(width * 0.78, decayX + 22, width - 44);
  const releaseX = width - 14;

  const points = [
    `14,${floorY}`,
    `${attackX},${peakY}`,
    `${decayX},${sustainY}`,
    `${holdX},${sustainY}`,
    `${releaseX},${floorY}`,
  ];

  const area = `M 14 ${floorY} L ${attackX} ${peakY} L ${decayX} ${sustainY} L ${holdX} ${sustainY} L ${releaseX} ${floorY} Z`;

  return (
    <div className="amp-scope-frame" aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} className="amp-scope">
        <defs>
          <linearGradient id="amp-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
          </linearGradient>
        </defs>
        <path d={`M0 18 H${width} M0 ${floorY} H${width}`} className="filter-grid" />
        <path d={`M0 ${height / 2} H${width}`} className="filter-grid-mid" />
        <path d={area} className="amp-area" />
        <polyline points={points.join(" ")} className="amp-curve" />
      </svg>
    </div>
  );
}
