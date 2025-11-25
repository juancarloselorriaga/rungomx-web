# i18n Developer Guide

## Quick Start: Adding Translations

### 90% Use Case: Add strings to existing namespace

1. **Edit JSON files** (that's it!)
   ```bash
   # Add a new key to both locales
   messages/common/en.json  # Add: "newKey": "Hello"
   messages/common/es.json  # Add: "newKey": "Hola"
   ```

2. **Types update automatically** (if dev server is running)
   - File watcher regenerates types on save
   - Get instant autocomplete in your editor

3. **Use in components**
   ```tsx
   const t = useTranslations('common');
   return <p>{t('newKey')}</p>;
   ```

### Adding a New Page

1. **Create folder and JSON files**
   ```bash
   mkdir -p messages/pages/pricing
   touch messages/pages/pricing/en.json
   touch messages/pages/pricing/es.json
   ```

2. **Add translations**
   [//]: # (messages/pages/pricing/en.json)
   ```json
   {
     "title": "Pricing",
     "subtitle": "Choose your plan"
   }
   ```

3. **Auto-discovered!** No registration needed
   - Types generated automatically
   - Available as `pages.pricing` in code

4. **Use in page component**
   ```tsx
   const t = useTranslations('pages.pricing');
   return <h1>{t('title')}</h1>;
   ```

### Adding a New Component

Same as pages, but in `messages/components/`:

```bash
mkdir -p messages/components/user-menu
# Add en.json and es.json
# Available as components.userMenu (auto-converted to camelCase)
```

## Automatic Code Generation

- Generated files: `i18n/types.generated.ts` and `i18n/loaders.generated.ts` (loader objects + route map). They regenerate in dev watch mode, via `pnpm generate:i18n`, and in the pre-commit hook.
- Route map defaults:
  - Auth slugs (`/sign-in`, `/sign-up`, `/iniciar-sesion`, `/crear-cuenta`) → `authSelection`
  - Protected slugs (`/dashboard`, `/profile`, `/settings`, `/team` plus localized variants) → `protectedSelection`
  - Everything else → `publicSelection`
- Page namespaces come from `messages/pages/*` and are converted from kebab-case to camelCase for keys.

### Manual route overrides

Edit the preserved block in `i18n/loaders.generated.ts` to override mappings:

```ts
// === MANUAL ROUTE OVERRIDES START ===
export const manualRouteOverrides = {
  '/pricing': publicSelection(['pricing']),
};
// === MANUAL ROUTE OVERRIDES END ===
```

Anything between the markers survives regeneration.

## File Structure

```
messages/
├── common/           # Shared across all pages
├── navigation/       # Nav/header strings
├── auth/            # Auth-related strings
├── errors/          # Error messages
├── components/      # Component-specific
│   ├── footer/
│   ├── theme-switcher/
│   └── locale-switcher/
└── pages/           # Page-specific
    ├── home/
    ├── about/
    └── sign-in/
```

## Development Workflow

### Dev Mode (Automatic)
```bash
pnpm dev  # Includes file watcher
```
- Edit any JSON → types and loaders regenerate automatically
- Changes reflect immediately in TypeScript

### Manual Generation
```bash
pnpm generate:i18n
```

## Validation

### Pre-commit Hook (Automatic)
```bash
git commit  # Automatically runs validation
```
- Checks locale parity (en ↔ es)
- Regenerates types
- Prevents commits with missing translations

### Manual Validation
```bash
pnpm validate:locales
```
Example output:
```
❌ Locale parity check failed:

📁 messages/common/es.json:
   Missing key: "newButton"
   Extra key: "oldButton"
```

## Convention over Configuration

### Naming Conventions

- **Folders**: Use `kebab-case`
  - File: `messages/pages/sign-in/`
  - Code: `pages.signIn` (auto-converted)

- **Keys**: Use `camelCase`
  ```json
  {
    "submitButton": "Submit",
    "cancelButton": "Cancel"
  }
  ```

### Auto-detection

- **Routes → Pages**: Path automatically maps to namespace
  - `/about` → loads `pages.about`
  - `/sign-in` → loads `pages.signIn`
  - `/` → loads `pages.home`

- **Layout Types**: Components loaded based on route
  - Public routes: All components (footer, nav, etc.)
  - Auth routes: Minimal (errorBoundary only)
  - Protected routes: No footer, keeps theme/locale switchers

## Best Practices

### ✅ DO
- Keep keys descriptive: `submitButtonLabel` not `btn1`
- Match structure between locales exactly
- Add translations to BOTH locales before committing
- Use nested objects for related keys:
  ```json
  {
    "form": {
      "email": "Email",
      "password": "Password"
    }
  }
  ```

### ❌ DON'T
- Don't manually edit `i18n/types.generated.ts` (auto-generated)
- Don't commit with missing translations (pre-commit hook prevents this)
- Don't create files outside the established structure
- Don't use arrays in translations (not well supported)

## Type Safety

### Autocomplete
```tsx
const t = useTranslations('common');
t('sub')  // ← Shows: submitButton, subtitle, etc.
```

### Compile-time Errors
```tsx
t('typoKey')  // ← TypeScript error: Key doesn't exist
t.rich('htmlKey', { b: (chunks) => <strong>{chunks}</strong> })
```

## Troubleshooting

### Types not updating?
```bash
# Restart dev server
pnpm dev

# Or manually regenerate
pnpm generate:i18n
```

### Locale validation failing?
```bash
# See what's missing
pnpm validate:locales

# Fix by adding missing keys to JSON files
```

### IDE errors in scripts folder?
- Normal! Scripts are excluded from main tsconfig
- They have their own `scripts/tsconfig.json`
- Runtime works fine via `tsx`

## Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with unified i18n watcher |
| `pnpm generate:i18n` | Regenerate loaders + types |
| `pnpm generate:i18n-types` | Regenerate types only |
| `pnpm generate:i18n-loaders` | Regenerate loaders only |
| `pnpm validate:locales` | Check locale parity |
| `pnpm watch:i18n` | Watch types + loaders (no dev server) |
| `pnpm test:ci` | Run full CI pipeline (types + tests + validation) |

## Architecture

### Flow
```
1. Edit JSON → 2. Watcher detects → 3. Generate types → 4. TypeScript updates
```

### Key Files
- `scripts/generate-i18n-types.ts` - Type generator
- `scripts/validate-locales.ts` - Parity checker
- `scripts/watch-i18n-types.ts` - File watcher
- `i18n/utils.ts` - Runtime loader with auto-discovery
- `i18n/types.generated.ts` - Auto-generated (don't edit!)

---

**TL;DR**: Just edit JSON files. Everything else is automatic. ✨
