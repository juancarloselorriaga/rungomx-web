'use client';

import { DatePicker } from '@/components/ui/date-picker';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

type TimeSelectProps = {
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
};

export function TimeSelect({ value, onChange, disabled }: TimeSelectProps) {
  const [h, m] = value ? value.split(':') : ['00', '00'];

  const selectClass =
    'h-10 w-16 rounded-md border border-input bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex items-center gap-1 shrink-0">
      <select
        value={h || '00'}
        onChange={(e) => onChange(`${e.target.value}:${m || '00'}`)}
        disabled={disabled}
        className={selectClass}
        aria-label="Hour"
      >
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>{hour}</option>
        ))}
      </select>
      <span className="text-sm font-medium text-muted-foreground">:</span>
      <select
        value={m || '00'}
        onChange={(e) => onChange(`${h || '00'}:${e.target.value}`)}
        disabled={disabled}
        className={selectClass}
        aria-label="Minute"
      >
        {MINUTES.map((min) => (
          <option key={min} value={min}>{min}</option>
        ))}
      </select>
    </div>
  );
}

type DateTimePickerProps = {
  /** ISO datetime string: "YYYY-MM-DDTHH:mm" or "" */
  value?: string | null;
  /** Called with "YYYY-MM-DDTHH:mm" or "" on change */
  onChangeAction?: (value: string) => void;
  locale?: string;
  clearLabel?: string;
  /** Default time when a date is first picked (default "00:00") */
  defaultTime?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
};

export function DateTimePicker({
  value,
  onChangeAction,
  locale,
  clearLabel,
  defaultTime = '00:00',
  disabled,
  className,
  name,
}: DateTimePickerProps) {
  const datePart = value ? value.split('T')[0] : '';
  const timePart = value ? value.split('T')[1] || '' : '';

  return (
    <div className={className}>
      <div className="flex gap-2">
        <DatePicker
          locale={locale}
          value={datePart}
          onChangeAction={(date) => {
            if (!date) {
              onChangeAction?.('');
              return;
            }
            const time = timePart || defaultTime;
            onChangeAction?.(`${date}T${time}`);
          }}
          clearLabel={clearLabel}
          name={name}
          className="min-w-0 flex-1"
        />
        <TimeSelect
          value={timePart || defaultTime}
          onChange={(time) => {
            if (datePart) {
              onChangeAction?.(`${datePart}T${time}`);
            }
          }}
          disabled={disabled || !datePart}
        />
      </div>
    </div>
  );
}
