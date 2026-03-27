# RunGoMX BMM Extension

RunGoMX extension workflows for BMM implementation operations and delivery meta-tooling.

## Scope

This module provides four workflows:

- `workflows/release-readiness`
- `workflows/event-publish-readiness`
- `workflows/i18n-regression-guard`
- `workflows/meta-delivery-radar`

## Repo Conventions

- Config source: `_bmad/bmm/config.yaml`
- Output root: `_bmad-output` (resolved via `{config_source}:output_folder`)
- Workflow reports:
  - `_bmad-output/release-readiness/`
  - `_bmad-output/event-publish-readiness/`
  - `_bmad-output/i18n-regression-guard/`
  - `_bmad-output/implementation-artifacts/meta/`

## Quality Gate Scripts Referenced

These workflows reference existing `package.json` scripts:

- `pnpm lint`
- `pnpm generate:i18n`
- `pnpm type-check`
- `pnpm validate:locales`
- `pnpm test`
- `pnpm test:app`
- `pnpm test:e2e`
- `pnpm test:results-compliance`
- `pnpm test:ci`

## Notes

- This is an extension scaffold only; no base BMAD files are modified.
- Each workflow includes instructions, checklist validation, and an explicit Agent-Team Mode split/merge section.
- `_bmad/` is git-ignored in this repo. Use the helper script to apply menu entries locally:

```bash
node bmad-modules/rungomx-bmm-extension/tools/apply-menu-customizations.mjs --project-root .
```

Dry run:

```bash
node bmad-modules/rungomx-bmm-extension/tools/apply-menu-customizations.mjs --project-root . --dry-run
```

## Meta Tooling

Delivery radar script:

```bash
node bmad-modules/rungomx-bmm-extension/tools/generate-delivery-radar.mjs --project-root .
```

Strict gate:

```bash
node bmad-modules/rungomx-bmm-extension/tools/generate-delivery-radar.mjs --project-root . --strict
```
