# i18n Regression Guard Checklist

## Setup

- [ ] Workflow loaded from `bmad-modules/rungomx-bmm-extension/workflows/i18n-regression-guard/workflow.yaml`
- [ ] Config source confirmed: `_bmad/bmm/config.yaml`
- [ ] Output directory exists: `_bmad-output/i18n-regression-guard`
- [ ] Guard report initialized: `_bmad-output/i18n-regression-guard/i18n-regression-guard-report.md`

## Guard Gates

- [ ] `pnpm generate:i18n` passed
- [ ] `pnpm validate:locales` passed
- [ ] `pnpm type-check` passed
- [ ] `pnpm test:app` passed
- [ ] `pnpm test:results-compliance` passed
- [ ] Optional: `pnpm test:ci` passed or skip rationale documented

## Regression Analysis

- [ ] Missing or extra locale keys are documented
- [ ] Generated i18n artifacts are current and committed as needed
- [ ] All failures include severity and owner
- [ ] Rerun evidence exists after fixes

## Finalization

- [ ] Final status recorded: PASS, WARN, or FAIL
- [ ] Blocking issues are clearly separated from follow-up tasks
- [ ] Final report saved at `_bmad-output/i18n-regression-guard/i18n-regression-guard-report.md`
- [ ] If agent-team mode used, PM/SM/DEV/QA/Tech Writer outputs were merged
