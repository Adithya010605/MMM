type DiscreteOption<T extends string> = {
  label: string;
  value: T;
};

type DiscreteKnobProps<T extends string> = {
  label: string;
  value: T;
  options: DiscreteOption<T>[];
  onChange: (value: T) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function DiscreteKnob<T extends string>({ label, value, options, onChange }: DiscreteKnobProps<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const ratio = options.length > 1 ? activeIndex / (options.length - 1) : 0;
  const angle = -140 + ratio * 280;

  const commitIndex = (index: number) => {
    onChange(options[clamp(index, 0, options.length - 1)].value);
  };

  return (
    <div className="knob-field">
      <button
        type="button"
        className="knob selector-knob"
        aria-label={label}
        onPointerDown={(event) => {
          const startY = event.clientY;
          const startIndex = activeIndex;
          const target = event.currentTarget;

          const handleMove = (moveEvent: PointerEvent) => {
            const totalDelta = startY - moveEvent.clientY;
            const precision = moveEvent.shiftKey ? 28 : 14;
            const deltaIndex = Math.round(totalDelta / precision);
            commitIndex(startIndex + deltaIndex);
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
            commitIndex(activeIndex + 1);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            commitIndex(activeIndex - 1);
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          commitIndex(activeIndex + (event.deltaY < 0 ? 1 : -1));
        }}
      >
        <span className="knob-face selector-knob-face">
          <span className="knob-ring" />
          <span className="selector-knob-pointer" style={{ transform: `rotate(${angle}deg)` }}>
            <span className="knob-dot knob-dot-outer" />
          </span>
        </span>
      </button>
      <span className="knob-label">{label}</span>
      <span className="knob-value">{options[activeIndex].label}</span>
    </div>
  );
}
