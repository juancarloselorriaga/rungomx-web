# RunGoMX Event Publish Readiness Instructions

<critical>The workflow execution engine is governed by: {project-root}/_bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {installed_path}/workflow.yaml</critical>
<critical>Use config source: {config_source}</critical>
<critical>Write all artifacts under {output_folder} (repo path: {project-root}/_bmad-output)</critical>
<critical>Communicate in {communication_language}</critical>

## Gate Commands

Run in this order unless the user requests another order:

1. `pnpm lint`
2. `pnpm generate:i18n`
3. `pnpm type-check`
4. `pnpm validate:locales`
5. `pnpm test:results-compliance`
6. `pnpm test:app`

Optional end-to-end confidence gate:

- `pnpm test:e2e`

## Agent-Team Mode (Parallel Split + Merge)

Use this mode when multiple agents or contributors are available.

Role split:

- PM: define publish scope and acceptance criteria for event release.
- SM: coordinate workflow, track blockers, and enforce publish checklist completion.
- DEV: validate implementation integrity and run `lint`, `generate:i18n`, `type-check`.
- QA: run `validate:locales`, `test:results-compliance`, `test:app`, and optional `test:e2e`.
- Tech Writer: document publish readiness decision, risks, rollback notes, and approvals.

Merge protocol:

1. Each role records findings under its section in `{readiness_report}`.
2. SM merges role outputs into one publish gate matrix.
3. PM resolves conflicts and records final publish recommendation: PUBLISH, HOLD, or BLOCK.
4. Tech Writer produces final narrative summary and sign-off block.

<workflow>

<step n="1" goal="Initialize context and identify target event">
  <action>Read {config_source} and ensure output folder points to _bmad-output</action>
  <action>Create {readiness_dir} if missing</action>
  <action>Capture event_identifier from input or user prompt</action>
  <action>Initialize {readiness_report} with event_identifier and run metadata</action>
</step>

<step n="2" goal="Run technical publish gates">
  <action>Execute gate commands in sequence and log status for each command</action>
  <check if="a gate fails">
    <action>Record failure impact on event publication and proposed remediation</action>
  </check>
</step>

<step n="3" goal="Assess publication risks">
  <action>Review command outcomes and event-specific blockers</action>
  <action>Classify each blocker as must-fix-before-publish or monitor-after-publish</action>
  <action>Set final recommendation: PUBLISH, HOLD, or BLOCK</action>
</step>

<step n="4" goal="Publish readiness artifact">
  <action>Write final recommendation and evidence matrix to {readiness_report}</action>
  <output>Event publish readiness report generated at {readiness_report}</output>
</step>

</workflow>
