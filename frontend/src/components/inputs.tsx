import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import { Button } from "antd";

// Small controlled inputs in the style of consumer booking apps; both work inside antd Form.Item (value / onChange).
export function Stepper({ value = 1, onChange, min = 1, max = 24 }: { value?: number; onChange?: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="stepper">
      <Button shape="circle" icon={<MinusOutlined />} disabled={value <= min} onClick={() => onChange?.(Math.max(min, value - 1))} aria-label="minus" />
      <span className="stepper-value">{value}</span>
      <Button shape="circle" icon={<PlusOutlined />} disabled={value >= max} onClick={() => onChange?.(Math.min(max, value + 1))} aria-label="plus" />
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, options }: { value?: T; onChange?: (v: T) => void; options: { value: T; label: string; dot?: string }[] }) {
  return (
    <div className="chips" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`chip${value === o.value ? " on" : ""}`} onClick={() => onChange?.(o.value)}>
          {o.dot && <i style={{ background: o.dot }} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function MultiChips<T extends string>({ value = [], onChange, options }: { value?: T[]; onChange?: (v: T[]) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o.value);
        return <button key={o.value} type="button" aria-pressed={on} className={`chip${on ? " on" : ""}`} onClick={() => onChange?.(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>{o.label}</button>;
      })}
    </div>
  );
}
