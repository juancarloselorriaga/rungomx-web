import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';

type MeasurementFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  placeholder?: string;
};

export function MeasurementField({
  label,
  name,
  value,
  onChange,
  required,
  error,
  disabled,
  min,
  max,
  step,
  unit,
  hint,
  placeholder,
}: MeasurementFieldProps) {
  return (
    <FormField label={label} required={required} error={error}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            type="number"
            name={name}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            min={min}
            max={max}
            step={step}
            inputMode="decimal"
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              error && 'border-destructive focus-visible:border-destructive'
            )}
            placeholder={placeholder}
            disabled={disabled}
          />
          {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </FormField>
  );
}
