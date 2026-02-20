# Meta Delivery Radar Checklist

- [ ] Run generator and confirm both files exist:
  - `_bmad-output/implementation-artifacts/meta/delivery-radar.json`
  - `_bmad-output/implementation-artifacts/meta/delivery-radar.md`
- [ ] Confirm `metrics.readinessScore` is present and numeric.
- [ ] Confirm `freshness.level` is one of `fresh`, `warm`, `aging`, `stale`, `unknown`.
- [ ] Confirm status counts include epics, stories, and retrospectives.
- [ ] Confirm script coverage and missing signals are reported.
- [ ] If score is below 70, run with `--strict` and validate non-zero exit.
- [ ] Assign PM, Delivery Ops, Dev, QA, and Platform parallel lanes from instructions.
- [ ] Capture owners + due times for each lane.
- [ ] Re-run generator after follow-up actions and compare trend vs previous run.
