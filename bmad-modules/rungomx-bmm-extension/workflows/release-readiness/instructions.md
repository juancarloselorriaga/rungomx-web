# RunGoMX Release Readiness Instructions

<critical>The workflow execution engine is governed by: {project-root}/_bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {installed_path}/workflow.yaml</critical>
<critical>Use config source: {config_source}</critical>
<critical>Write all artifacts under {output_folder} (repo path: {project-root}/_bmad-output)</critical>
<critical>Communicate in {communication_language}</critical>

## Gate Commands

Run in this order unless the user asks for a different sequence:

1. `pnpm lint`
2. `pnpm generate:i18n`
3. `pnpm type-check`
4. `pnpm validate:locales`
5. `pnpm test`
6. `pnpm test:e2e`

Optional aggregation command:

- `pnpm test:ci`

## Agent-Team Mode (Parallel Split + Merge)

Use this mode when multiple agents or contributors are available.

Role split:

- PM: define release scope, acceptance threshold, and final GO/NO-GO decision.
- SM: orchestrate execution order, track blockers, and keep status cadence.
- DEV: execute build and type-safety gates (`lint`, `generate:i18n`, `type-check`).
- QA: execute validation and test gates (`validate:locales`, `test`, `test:e2e`).
- Tech Writer: maintain the readiness report and risk register in `{readiness_report}`.

Merge protocol:

1. Each role appends findings to a role section in `{readiness_report}` with PASS/FAIL and evidence.
2. SM consolidates into one summary table (Gate, Owner, Result, Evidence, Action).
3. PM reviews unresolved failures and records final decision: GO, HOLD, or NO-GO.
4. Tech Writer finalizes publication-ready report language and next steps.

<workflow>

<step n="1" goal="Initialize run context">
  <action>Read {config_source} and confirm output_folder resolves to _bmad-output</action>
  <action>Create {readiness_dir} if missing</action>
  <action>Initialize {readiness_report} with run metadata (date, branch, actor)</action>
</step>

<step n="2" goal="Execute release gates">
  <action>Run gate commands in the listed order</action>
  <action>Capture command output, exit code, and short notes for each gate</action>
  <check if="a gate fails">
    <action>Mark gate as FAIL and capture immediate remediation recommendation</action>
    <action>Continue only if user requests continued execution after failures</action>
  </check>
</step>

<step n="3" goal="Assess readiness and risks">
  <action>Summarize pass/fail counts and unresolved blockers</action>
  <action>Classify each blocker as release-blocking or post-release follow-up</action>
  <action>Recommend GO/HOLD/NO-GO with rationale tied to gate evidence</action>
</step>

<step n="4" goal="Publish report">
  <action>Write final decision and evidence table to {readiness_report}</action>
  <output>Release readiness report generated at {readiness_report}</output>
</step>

</workflow>
