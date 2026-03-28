type SelectorOption<T extends string> = {
  label: string;
  value: T;
};

type SelectorProps<T extends string> = {
  label: string;
  value: T;
  options: SelectorOption<T>[];
  onChange: (value: T) => void;
};

export function Selector<T extends string>({ label, value, options, onChange }: SelectorProps<T>) {
  return (
    <div className="selector-group">
      <p className="control-label">{label}</p>
      <div className="selector-row" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? "selector is-active" : "selector"}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
