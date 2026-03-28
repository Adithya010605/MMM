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

  const snap = (next: number) => {
    onChange(Number(next.toFixed(step < 1 ? 3 : 0)));
  };

  return (
    <div className="knob-field">
      <button
        type="button"
        className="knob"
        aria-label={label}
        onPointerDown={(event) => {
          const startY = event.clientY;
          const startValue = value;
          const target = event.currentTarget;

          const handleMove = (moveEvent: PointerEvent) => {
            const totalDelta = startY - moveEvent.clientY;
            const precision = moveEvent.shiftKey ? 18 : 6;
            const steps = totalDelta / precision;
            const next = clamp(startValue + steps * step, min, max);
            snap(next);
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
            snap(clamp(value + step, min, max));
          }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            snap(clamp(value - step, min, max));
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          const precision = event.shiftKey ? 0.25 : 1;
          const direction = event.deltaY < 0 ? 1 : -1;
          snap(clamp(value + direction * step * precision, min, max));
        }}
      >
        <span className="knob-face knob-face-unified">
          <span className="knob-ring" />
          <span className="selector-knob-pointer" style={{ transform: `rotate(${angle}deg)` }}>
            <span className="knob-dot knob-dot-outer" />
          </span>
        </span>
      </button>
      <span className="knob-label">{label}</span>
      <span className="knob-value">{formatValue ? formatValue(value) : value.toFixed(2)}</span>
    </div>
  );
}
