# Meta Delivery Radar Instructions

<critical>The workflow execution engine is governed by: {project-root}/_bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {installed_path}/workflow.yaml</critical>
<critical>Use config source: {config_source}</critical>
<critical>Generator script: {generator_script}</critical>
<critical>Communicate in {communication_language}</critical>

## Objective

Generate a single delivery-health snapshot and immediately convert findings into focused, parallel follow-up work.

## Run Commands

Standard run:

```bash
node {generator_script} --project-root {project_root} --out-dir {out_dir}
```

Strict run:

```bash
node {generator_script} --project-root {project_root} --out-dir {out_dir} --strict
```

Artifacts:

- `{radar_json}`
- `{radar_md}`

## Finding Interpretation

Primary fields:

- `metrics.readinessScore`
- `freshness.level`
- `metrics.storyBacklog`
- `metrics.storyInFlight`
- `scripts.missingSignals`

## Agent-Team Parallel Follow-up Playbook

Trigger matrix:

- If `readinessScore < 70`: execute all lanes in parallel and rerun generator after fixes.
- If `freshness.level` is `aging`, `stale`, or `unknown`: prioritize PM + Delivery Ops lanes.
- If `storyBacklog > 0` or `storyInFlight > 0`: prioritize Dev + QA lanes.
- If `scripts.missingSignals` is non-empty: prioritize Platform lane.

Parallel lanes:

1. PM lane:
   - Reconcile `sprint-status.yaml` with actual story state.
   - Reorder backlog and publish a top-3 next-story sequence.
2. Delivery Ops lane:
   - Refresh artifact timestamps and ensure sprint status is regenerated from source truth.
   - Confirm required implementation artifacts exist in `_bmad-output/implementation-artifacts/`.
3. Dev lane:
   - Pull highest-priority backlog/in-flight stories and drive them to `review` or `done`.
   - Surface blockers with owner and explicit next action.
4. QA lane:
   - Validate in-flight/review stories with focused regression tests.
   - Escalate release blockers before merge windows.
5. Platform lane:
   - Add/repair missing package script signals (`lint`, `type-check`, `test`, `test:e2e`, `test:ci`, `build`).
   - Confirm commands are runnable in local and CI contexts.

<workflow>

<step n="1" goal="Generate radar artifacts">
  <action>Run generator script with project root and output directory from workflow variables</action>
  <action>Ensure both {radar_json} and {radar_md} exist</action>
</step>

<step n="2" goal="Assess findings">
  <action>Read {radar_md} and classify blockers by lane: PM, Delivery Ops, Dev, QA, Platform</action>
  <action>Assign owner and immediate action for each blocker</action>
</step>

<step n="3" goal="Coordinate parallel execution">
  <action>Launch lane execution in parallel where feasible</action>
  <action>Collect lane outcomes and consolidate into a single follow-up summary</action>
</step>

<step n="4" goal="Close loop">
  <action>Rerun the generator and compare readiness trend vs prior output</action>
  <output>Meta delivery radar complete. Current readiness report: {radar_md}</output>
</step>

</workflow>
