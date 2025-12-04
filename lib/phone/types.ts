import type { CountryCode } from 'libphonenumber-js';

/**
 * Props for the PhoneInput component
 */
export type PhoneInputProps = {
  /** Phone number value in E.164 format (e.g., "+523317778888") */
  value: string;

  /** Callback when phone number changes - always returns E.164 format or empty string */
  onChangeAction: (value: string) => void;

  /** Error message to display below the input */
  error?: string;

  /** Form field name attribute */
  name?: string;

  /** Whether the field is required (shows asterisk in label) */
  required?: boolean;

  /** Field label - can be a string or React node (for custom labels) */
  label?: string | React.ReactNode;

  /** Placeholder text for the input */
  placeholder?: string;

  /** Whether the input is disabled */
  disabled?: boolean;

  /** Default country code (ISO 3166-1 alpha-2, e.g., "MX", "US") */
  defaultCountry?: CountryCode;

  /** Whether to show the international country selector (default: true) */
  international?: boolean;

  /** Additional CSS classes for the container */
  className?: string;

  /** Additional CSS classes for the input element */
  inputClassName?: string;
};
