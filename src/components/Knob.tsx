type KnobProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function Knob({ label, value, min, max, step = 0.01, formatValue, onChange }: KnobProps) {
  const ratio = (value - min) / (max - min || 1);
  const angle = -140 + ratio * 280;

  const applyDelta = (delta: number) => {
    const next = clamp(value + delta * step, min, max);
    onChange(Number(next.toFixed(step < 1 ? 3 : 0)));
  };

  return (
    <div className="knob-field">
      <button
        type="button"
        className="knob"
        aria-label={label}
        onPointerDown={(event) => {
          let previousY = event.clientY;
          const target = event.currentTarget;

          const handleMove = (moveEvent: PointerEvent) => {
            const deltaY = previousY - moveEvent.clientY;
            if (Math.abs(deltaY) < 2) return;
            applyDelta(deltaY);
            previousY = moveEvent.clientY;
          };

          const handleUp = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
          };

          target.setPointerCapture(event.pointerId);
          window.addEventListener("pointermove", handleMove);
          window.addEventListener("pointerup", handleUp);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            applyDelta(1);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            applyDelta(-1);
          }
        }}
      >
        <span className="knob-face" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="knob-indicator" />
        </span>
      </button>
      <span className="knob-label">{label}</span>
      <span className="knob-value">{formatValue ? formatValue(value) : value.toFixed(2)}</span>
    </div>
  );
}
