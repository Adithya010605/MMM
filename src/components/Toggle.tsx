type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      className={checked ? "toggle is-on" : "toggle"}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="toggle-pill">
        <span className="toggle-dot" />
      </span>
    </button>
  );
}
