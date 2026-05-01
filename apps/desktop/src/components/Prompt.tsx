import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  initial?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export default function Prompt({
  label,
  initial = "",
  placeholder,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = value.trim();
      if (v.length > 0) onSubmit(v);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    e.stopPropagation();
  }

  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <div className="prompt-box" onClick={(e) => e.stopPropagation()}>
        <label className="prompt-label">{label}</label>
        <input
          ref={inputRef}
          className="prompt-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
