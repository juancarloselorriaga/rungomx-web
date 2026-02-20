# RunGoMX i18n Regression Guard Instructions

<critical>The workflow execution engine is governed by: {project-root}/_bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {installed_path}/workflow.yaml</critical>
<critical>Use config source: {config_source}</critical>
<critical>Write all artifacts under {output_folder} (repo path: {project-root}/_bmad-output)</critical>
<critical>Communicate in {communication_language}</critical>

## Gate Commands

Primary guard sequence:

1. `pnpm generate:i18n`
2. `pnpm validate:locales`
3. `pnpm type-check`
4. `pnpm test:app`
5. `pnpm test:results-compliance`

Optional full pipeline confirmation:

- `pnpm test:ci`

Optional local watch loop while fixing regressions:

- `pnpm watch:i18n`

## Agent-Team Mode (Parallel Split + Merge)

Use this mode when multiple agents or contributors are available.

Role split:

- PM: define i18n quality threshold and release impact policy.
- SM: orchestrate sequence, issue tracking, and rerun policy.
- DEV: repair generation/type issues and run `generate:i18n` + `type-check`.
- QA: validate locale parity and run regression tests (`validate:locales`, `test:app`, `test:results-compliance`).
- Tech Writer: curate regression log, changed namespaces summary, and final guard decision.

Merge protocol:

1. Each role appends evidence and decisions into `{guard_report}` under role headings.
2. SM merges all findings into one defects table with severity and owner.
3. PM confirms stop-ship vs acceptable-risk decisions for unresolved items.
4. Tech Writer finalizes report wording and publishes a clear PASS/WARN/FAIL status.

<workflow>

<step n="1" goal="Initialize guard run">
  <action>Read {config_source} and confirm output folder is _bmad-output</action>
  <action>Create {guard_dir} if missing</action>
  <action>Initialize {guard_report} with changed_scope and run metadata</action>
</step>

<step n="2" goal="Run i18n guard sequence">
  <action>Execute primary gate commands in order</action>
  <check if="a gate fails">
    <action>Log failing command, suspected root cause, and exact impacted namespace/files</action>
    <action>If fixes are applied, rerun failed gates plus downstream dependent gates</action>
  </check>
</step>

<step n="3" goal="Summarize regression risk">
  <action>Document parity issues, missing keys, stale generated artifacts, and test regressions</action>
  <action>Classify each issue: blocking, high, medium, low</action>
  <action>Set final guard status: PASS, WARN, or FAIL</action>
</step>

<step n="4" goal="Write guard artifact">
  <action>Write final status, issue table, and follow-up actions to {guard_report}</action>
  <output>i18n regression guard report generated at {guard_report}</output>
</step>

</workflow>
