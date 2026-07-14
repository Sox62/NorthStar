export interface TabOption {
  value: string;
  label: string;
}

export interface TabBarProps {
  value: string;
  onChange: (value: string) => void;
  options: TabOption[];
}

export function TabBar({ value, onChange, options }: TabBarProps) {
  return (
    <div className="nsTabBar" role="tablist" aria-label="Portfolio ownership scope">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`nsTab ${value === opt.value ? "isActive" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
