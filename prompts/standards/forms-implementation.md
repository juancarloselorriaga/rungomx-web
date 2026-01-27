# Forms Implementation Standard (RungoMX Web)

This guide defines how interactive forms should be implemented in the app, especially in **settings
** (protected + admin) and similar flows. It is written for both humans and AI agents to validate
compliance.

---

## 1. Core building blocks

- **Form state & wiring**
  - Use the shared form system from `lib/forms`:
    - Hook: `useForm` (`lib/forms/use-form.ts`)
    - Components: `Form`, `FormError` (`lib/forms/form.tsx`)
    - Types & helpers: `FormActionResult`, `UseFormOptions`, etc.
  - Do **not** manage form state with ad-hoc `useState` when using server actions.

- **Field layout & errors**
  - Use `FormField`, `FieldLabel`, `FieldError` from `components/ui/form-field.tsx` to render:
    - Label (with required indicator)
    - Input/select/textarea
    - Field-level error text
  - For components that already accept an `error` prop (e.g. `PhoneInput`), prefer:
    - Composed patterns like `PhoneField` that integrate with `FormField` or `FieldLabel`/
      `FieldError`.

- **Reusable field components**
  - Prefer the following shared components instead of hand-rolled inputs:
    - `PhoneField` (`components/settings/fields/phone-field.tsx`) – lazy loads `PhoneInput`.
    - `CountrySelectField` via `CountrySelectField` lazy wrapper (
      `components/settings/fields/country-select-field-lazy.tsx`).
    - `GenderField` (`components/settings/fields/gender-field.tsx`).
    - `MeasurementField` (`components/settings/fields/measurement-field.tsx`).
    - `DatePicker` (`components/ui/date-picker.tsx`) for date-only fields.
      - **Always** use this instead of native `<input type="date">` (browser support/UX differs and
        it breaks consistency).
      - Accepts/emits `YYYY-MM-DD` strings (local date, no timezone conversion).
      - Wiring patterns:
        - `useForm` field: `const field = form.register('myDate')` then pass
          `value={field.value}`, `onChangeAction={(v) => field.onChange(v)}`, and
          `name={field.name as string}`.
        - Non-form filters: keep local state + call your filter updater in `onChangeAction`.
      - Use `useLocale()` to pass `locale`, and use `useTranslations('common')('clear')` (or the
        local equivalent) for `clearLabel`.
      - If a date range needs validation/constraints, use `min` / `max` props.
    - `DateTimePicker` (`components/ui/date-time-picker.tsx`) for datetime fields.
      Composes `DatePicker` + `TimeSelect`. Accepts/emits ISO `YYYY-MM-DDTHH:mm` strings.
      Use instead of native `<input type="datetime-local">` or manual DatePicker + time combos.

- **Dynamic / heavy inputs**
  - Heavy, client-only inputs **must** be loaded via `next/dynamic`:
    - `PhoneInput` (`components/ui/phone-input-lazy.tsx`).
    - `CountrySelectField` (`components/settings/fields/country-select-field-lazy.tsx`).
  - Use `FormFieldSkeleton` (`components/ui/form-field-skeleton.tsx`) in the `loading` state to
    avoid layout shift.

- **Notifications**
  - Use `sonner` (`toast`) for success and non-field error messages within client forms.

---

## 2. Server vs client responsibilities

- **Server components (pages/layouts)**
  - All route `page.tsx` and `layout.tsx` files in `app/*` remain **Server Components**:
    - Configure locale via `configPageLocale` (`utils/config-page-locale.tsx`) **before** any
      i18n usage.
    - Retrieve authenticated user context via `getAuthContext` (`lib/auth/server.ts`), which
      uses:
      - `getSession()` and `'use cache: private'` for user-specific caching.
    - Fetch other data via cached server helpers if needed (using the caching rules in
      `prompts/standards/nextjs-caching/*`).
  - Pass fully prepared initial props into client form components (`profile`, `profileStatus`,
    `profileMetadata`, etc.).

- **Client components (forms)**
  - Every interactive form is a **Client Component**:
    - Mark the file with `'use client';` at the top.
    - Do **not** fetch data via `fetch` or call `headers()`/`cookies()` inside the form.
    - Call server actions imported from `app/actions/*` inside `useForm`’s `onSubmit` or via
      wrapped helpers.
  - Keep client components as leaf nodes when possible:
    - Higher-level route composition and data fetching stays in server components.

- **Server actions & validation**
  - Server actions live under `app/actions/*` and are responsible for:
    - Validating input (typically with Zod schemas).
    - Returning a `FormActionResult`-shaped object with:
      - `ok: true` + `data` on success.
      - `ok: false`, `error`, `fieldErrors`, `message` on failure.
  - Validation is **server-side only**; client-side logic should display errors from the action,
    not revalidate.

---

## 3. Standard client form pattern

**Step 1: Define form values**

- Define a local `FormValues` type for the form (e.g. `ProfileFormValues`,
  `AccountPasswordFormValues`).
- Map server records to these values via a helper:
  - Example for profile settings: `toFormValues(profile)` in
    `components/settings/profile/profile-settings-form.tsx:41`.
  - Prefer using shared mappers where available (e.g. `toProfileFormValuesFromRecord` in
    `lib/profiles/profile-form-utils.ts`).

**Step 2: Initialize `useForm`**

- Use `useForm<FormValues, TResult>` from `lib/forms`:
  - `defaultValues`: the result of `toFormValues(...)`.
  - `onSubmit`: async function calling the server action and returning a `FormActionResult`.
  - `onSuccess`: updates form state from server data, clears errors, shows toast, and optionally
    calls `router.refresh()`.

Example pattern (see `ProfileSettingsForm` for the full implementation):

- Initialize:
  - `const form = useForm<ProfileFormValues, UpsertProfileSuccess>({ ... })`.
  - Use `form.register('fieldName')` for simple inputs/selects/textarea.
  - For controlled components, use `form.setFieldValue` and `form.clearError`.

**Step 3: Render with `Form` and `FormField`**

- Wrap the JSX in `<Form form={form}>` to provide context.
- Place `<FormError />` at the top to show form-level errors.
- For each field:
  - Use `FormField` with `label`, `required`, and `error={form.errors.fieldName}`.
  - Inside, render the input wired with `...form.register('fieldName')` or controlled handlers.

**Step 4: Handling updates from server**

- When server data changes (e.g. after a successful save or new props from parent):
  - Synchronize local form state using `useEffect`:
    - Compute `nextValues = toFormValues(newData)`.
    - Compare serialized shape to previous to avoid loops.
    - For each key, call `form.setFieldValue(key, nextValues[key])` and `form.clearError(key)`.
  - Pattern is visible in:
    - `ProfileSettingsForm` (`components/settings/profile/profile-settings-form.tsx:84`).
    - `ProfileCompletionForm` (`components/profile/profile-completion-form.tsx:108`).

**Step 5: Reset / cancel behavior**

- Store “last saved” values in a ref (`lastSavedValuesRef`).
- On reset, restore from that ref and clear field errors:
  - See `handleReset` in `ProfileSettingsForm` (
    `components/settings/profile/profile-settings-form.tsx:116`).

---

## 4. Profile-specific helpers & patterns

For profile-related forms (settings and completion), use the shared utilities in
`lib/profiles/profile-form-utils.ts` for value normalization and mapping:

- `formatProfileDateInput`:
  - Normalizes `Date` and string inputs into `YYYY-MM-DD` for date fields.
  - Used in `toProfileFormValuesFromRecord` and `ProfileCompletionForm`.

- `formatNumericProfileInput`:
  - Converts numeric values to strings, trimming whitespace and ignoring non-finite numbers.

- `normalizeCountryCode`:
  - Uppercases and ensures a fallback country code (e.g. `MX`).

- `applyGenderToPayload`:
  - Applies both `gender` and `genderDescription` to the payload.
  - Guarantees that `genderDescription` is cleared when gender is not `'self_described'`.

- `toProfileFormValuesFromRecord`:
  - Builds a `ProfileFormValuesBase` object from a `ProfileRecord` and defaults.
  - Used by `ProfileSettingsForm` to initialize form values.

- `buildProfileUpsertPayloadFromForm`:
  - Converts `ProfileFormValuesBase` into a `ProfileUpsertInput`.
  - Used in `ProfileSettingsForm` to build payloads for `upsertProfileAction`.

**Compliance check for profile-related forms**

- [ ] Uses `useForm` + `Form` + `FormError`.
- [ ] Maps server `ProfileRecord` to form values via shared helpers (where applicable).
- [ ] Builds `ProfileUpsertInput` with `buildProfileUpsertPayloadFromForm` or an equivalent mapped
      payload.
- [ ] Keeps gender and country handling consistent with the helpers.

---

## 5. Settings & admin patterns

### Protected settings (user area)

- Pages:
  - `app/[locale]/(protected)/settings/profile/page.tsx`
  - `app/[locale]/(protected)/settings/account/page.tsx`
- Navigation:
  - Horizontal, route-based “tabs” via `SettingsSectionSubnav`
    (`components/settings/settings-section-subnav.tsx`) between **Profile** and **Account**.
  - These tabs mirror the admin users subnav pattern
    (`components/admin/users/users-section-subnav.tsx`): active tab uses the `secondary` variant
    and `shadow-sm`, inactive tabs use `ghost` + muted text.
  - There is no side navigation shell for protected user settings; `SettingsShell` /
    `SettingsNav` are legacy/utility components and should not be used for new protected
    settings pages.
- Forms:
  - Profile: `ProfileSettingsForm` (`components/settings/profile/profile-settings-form.tsx`).
  - Account: `AccountNameForm`, `AccountPasswordForm` (`components/settings/account/*`).

### Admin settings

- Admin account page:
  - `app/[locale]/(admin)/admin/account/page.tsx` uses the same account forms with
    `variant="admin"` where appropriate.
  - Shares the same `lib/forms` patterns and error-handling conventions.
- Admin users:
  - `AdminUsersClient` and `SelfSignupUsersClient` (`components/admin/users/*`) follow the
    pattern:
    - Server page fetches & normalizes queries.
    - Client component handles interactive filtering, pagination, and table state.
  - Horizontal subnav for internal vs self-signup users uses the same Button + Link “tabs”
    pattern as protected settings.

---

## 6. Error handling & messaging

- **Server actions**
  - On validation failure:
    - Return `error: 'INVALID_INPUT'`.
    - Populate `fieldErrors` with a map of field name -> string[] messages.
    - Provide a user-facing `message` to show in `FormError`.
  - On other failures:
    - Use appropriate `error` code (e.g. `'SERVER_ERROR'`) and a generic `message` localized via
      `next-intl`.

- **Client forms**
  - In `useForm`’s `onSubmit`, simply forward the server action result.
  - `useForm`:
    - Maps `fieldErrors` into `form.errors`.
    - Populates `form.error` for `FormError`.
  - Custom mappings:
    - For profile min-age errors (or other structured validation messages), map the raw
      messages through a localized helper near the form (e.g. the `translateFieldErrors`
      function inside `ProfileSettingsForm`) **before** returning `fieldErrors`.

---

## 7. Caching & protected routes (alignment with Next.js docs)

- Auth-related helpers like `getAuthContext` and `getSession` use:
  - `'use cache: private'` for user-specific data.
  - `cache()` from `react` to memoize per-request.
- Form components:
  - Do **not** directly use caching directives.
  - Rely on server-side helpers for cached data.
- When adding new server helpers used by forms:
  - Choose `'use cache'`, `'use cache: remote'`, or `'use cache: private'` based on:
    - Public vs user-specific data.
    - Whether the route is dynamic (uses `headers()`/`cookies()`/`searchParams`).
  - Always tag cache entries and revalidate on writes as per `prompts/standards/nextjs-caching/*`.

---

## 8. Quick compliance checklist for AI agents

When reviewing or generating a form, verify:

- **Structure**
  - [ ] The route’s `page.tsx` is a Server Component using `configPageLocale` + server helpers.
  - [ ] The interactive form is a Client Component using `useForm` + `Form`.

- **State & fields**
  - [ ] `FormValues` type is defined and used consistently.
  - [ ] `defaultValues` are derived from server data using helper functions.
  - [ ] Inputs use `form.register` or controlled `setFieldValue` patterns.
  - [ ] `FormField` (or `FieldLabel` + `FieldError`) is used for labels and errors.

- **Server interactions**
  - [ ] Form `onSubmit` calls a server action under `app/actions/*`.
  - [ ] Server action returns a proper `FormActionResult` with `fieldErrors` and `message`.
  - [ ] Success handler updates form state, clears errors, and optionally calls
        `router.refresh()`.

- **Reusability**
  - [ ] Shared components (phone, country, gender, measurement, date picker, datetime picker) are
        used where appropriate. Use `DatePicker` / `DateTimePicker` instead of native
        `<input type="date">` / `<input type="datetime-local">`.
  - [ ] Dynamic imports with `FormFieldSkeleton` are used for heavy inputs.
  - [ ] Profile forms reuse `lib/profiles/profile-form-utils.ts` where applicable.

- **UX**
  - [ ] Cancel/reset actions restore last saved values, not just initial defaults.
  - [ ] Success and error messaging is localized and uses consistent tone.
  - [ ] In settings/admin views, related sections use route-based tabs/subnav (matching the admin
        users pattern), not ad-hoc in-page toggles.
