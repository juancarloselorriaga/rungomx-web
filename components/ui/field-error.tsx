interface FieldErrorProps {
  error?: string | null;
}

export function FieldError({ error }: FieldErrorProps) {
  if (!error) return null;
  return (
    <p className="mt-1 text-xs text-destructive" role="alert" aria-live="polite">
      {error}
    </p>
  );
}
