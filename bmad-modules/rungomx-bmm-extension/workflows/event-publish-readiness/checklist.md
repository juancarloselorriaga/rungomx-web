# Event Publish Readiness Checklist

## Setup

- [ ] Workflow loaded from `bmad-modules/rungomx-bmm-extension/workflows/event-publish-readiness/workflow.yaml`
- [ ] Config source confirmed: `_bmad/bmm/config.yaml`
- [ ] Output directory exists: `_bmad-output/event-publish-readiness`
- [ ] Target event identifier captured
- [ ] Report file initialized: `_bmad-output/event-publish-readiness/event-publish-readiness-report.md`

## Technical Gates

- [ ] `pnpm lint` passed
- [ ] `pnpm generate:i18n` passed
- [ ] `pnpm type-check` passed
- [ ] `pnpm validate:locales` passed
- [ ] `pnpm test:results-compliance` passed
- [ ] `pnpm test:app` passed
- [ ] Optional: `pnpm test:e2e` passed or was intentionally skipped with rationale

## Publish Decision Quality

- [ ] Failures include impact and remediation owner
- [ ] Blockers are classified as pre-publish vs post-publish
- [ ] Final recommendation recorded: PUBLISH, HOLD, or BLOCK
- [ ] Rollback or mitigation note exists for unresolved issues

## Artifacts

- [ ] Final report saved at `_bmad-output/event-publish-readiness/event-publish-readiness-report.md`
- [ ] If agent-team mode used, PM/SM/DEV/QA/Tech Writer outputs were merged
- [ ] Sign-off section includes decision owner and date
