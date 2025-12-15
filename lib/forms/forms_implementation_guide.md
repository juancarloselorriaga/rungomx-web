# Reusable Form Validation System – Quick Guide

Use this to wire new forms with the shared server-side validation stack. Everything lives in `lib/forms/` and `components/ui/`.

## Pieces

- Hook: `useForm` manages values, errors, submit state; API mirrors React Hook Form (`register`, `handleSubmit`, etc.).
- Components: `Form`, `FormError`, `FormField`, `FieldLabel`, `FieldError`.
- Server helpers: `createFormAction`, `validateInput`, `extractFieldErrors`.
- Types: `FormActionResult`, `UseFormReturn`, `UseFormOptions`, `FieldErrors`.

## Standard Flow

1. **Define server action** (server-only Zod validation)

```typescript
'use server';
import { z } from 'zod';
import { createFormAction } from '@/lib/forms';

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(1000),
});

export const submitContactAction = createFormAction(contactSchema, async (data) => {
  // business logic
  return { id: '123', timestamp: new Date() };
});
```

2. **Build client form** (server-side validation only; errors come from action)

```typescript
'use client';
import { useForm, Form, FormError } from '@/lib/forms';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { submitContactAction } from '@/app/actions/contact';

type ContactFormValues = { name: string; email: string; message: string };

export function ContactForm() {
  const form = useForm<ContactFormValues>({
    defaultValues: { name: '', email: '', message: '' },
    onSubmit: submitContactAction,
    onSuccess: () => { alert('Message sent!'); form.reset(); },
  });

  return (
    <Form form={form}>
      <FormError />
      <FormField label="Name" required error={form.errors.name}>
        <input {...form.register('name')} className="w-full rounded-md border px-3 py-2" disabled={form.isSubmitting} />
      </FormField>
      <FormField label="Email" required error={form.errors.email}>
        <input type="email" {...form.register('email')} className="w-full rounded-md border px-3 py-2" disabled={form.isSubmitting} />
      </FormField>
      <FormField label="Message" required error={form.errors.message}>
        <textarea {...form.register('message')} className="min-h-[100px] w-full rounded-md border px-3 py-2" disabled={form.isSubmitting} />
      </FormField>
      <Button type="submit" disabled={form.isSubmitting}>
        {form.isSubmitting ? 'Sending...' : 'Send Message'}
      </Button>
    </Form>
  );
}
```

## Key Rules

- **Server-side validation only**: Zod runs on the server action; client just shows errors.
- **Error mapping**: Use `createFormAction` or return `FormActionResult` with `error: 'INVALID_INPUT'` and `fieldErrors` to show field errors.
- **Do not wrap components with built-in errors** (e.g., `PhoneInput`). Use `FieldLabel` + pass `error` prop directly.
- **onChange handling**: `register` accepts either DOM `ChangeEvent` or direct values, so spread `...form.register('field')` on native inputs, or call `onChange` with a value in custom components.
- **FormError** renders form-level error banner; `form.error` is set from action `message`.

## Common Patterns

- **Custom component without error prop**: Wrap with `FormField` and pass `error={form.errors.field}`.
- **Custom component with error prop**: Do NOT use `FormField`; use `FieldLabel` + `error` prop.
- **Manual error**: `form.setError('field', 'Message')` and `form.clearError('field')`.
- **Reset**: `form.reset()` resets to `defaultValues`.

## Files

- Hook/components: `lib/forms/use-form.ts`, `lib/forms/form.tsx`, `components/ui/form-field.tsx`, `components/ui/field-label.tsx`, `components/ui/field-error.tsx`.
- Server utils: `lib/forms/server-helpers.ts`.
- Types/barrel: `lib/forms/types.ts`, `lib/forms/index.ts`.
