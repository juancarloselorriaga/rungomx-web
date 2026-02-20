# Release Readiness Checklist

## Setup

- [ ] Workflow loaded from `bmad-modules/rungomx-bmm-extension/workflows/release-readiness/workflow.yaml`
- [ ] Config source confirmed: `_bmad/bmm/config.yaml`
- [ ] Output directory exists: `_bmad-output/release-readiness`
- [ ] Report file initialized: `_bmad-output/release-readiness/release-readiness-report.md`

## Quality Gates

- [ ] `pnpm lint` passed
- [ ] `pnpm generate:i18n` passed
- [ ] `pnpm type-check` passed
- [ ] `pnpm validate:locales` passed
- [ ] `pnpm test` passed
- [ ] `pnpm test:e2e` passed (or documented exception)

## Decision Quality

- [ ] Every failed gate has owner and remediation action
- [ ] Blockers are labeled release-blocking vs follow-up
- [ ] Final decision recorded: GO, HOLD, or NO-GO
- [ ] Decision rationale references actual gate evidence

## Artifacts

- [ ] Final report saved at `_bmad-output/release-readiness/release-readiness-report.md`
- [ ] If agent-team mode used, PM/SM/DEV/QA/Tech Writer sections are merged
- [ ] Next actions are explicit and actionable
