# Test Reliability Policy

## Green Signal

The only reliable green signal is:

```bash
pnpm -s test:ci:isolated
```

A passing single spec, a partial gate, or a subset of suites is not enough to
claim the branch is stable.

## Root Fixes Only

When a test fails:

- isolate the first actionable failure
- identify the real product, runtime, or harness state that is wrong
- fix that state directly

Do not commit workaround-style fixes such as:

- blind retries
- fallback assertions that bypass the real path
- extra sleeps added only to "make it green"
- DB backdoors that replace the UI path under test

## Readiness Rules

Use explicit readiness signals:

- visible headings
- enabled controls
- URL assertions
- persisted state checks when the test validates a mutation

Do not use `page.waitForLoadState('networkidle')` as a generic readiness check.
This app often performs background work after the page is already interactive,
so `networkidle` is a common source of false timeouts and flaky sequencing.

Avoid generic `waitForTimeout()` unless it represents a real debounce or
polling window that cannot be asserted more directly.

## Shared Helper Discipline

Changes in `e2e/utils/helpers.ts` are high-risk because one helper can affect
multiple feature areas.

Whenever a shared E2E helper changes:

- run the directly affected specs first
- then run isolated E2E
- then run the full isolated gate

Do not merge helper changes validated only by one local spec.

## Stateful Mutation UIs

Components that both:

- trigger server mutations
- mirror server props into local client state

are high-risk for refresh races.

When reviewing or changing those components:

- inspect prop-sync effects for whether they can erase in-progress local UI state
- do not assume a rebase onto a green base branch removes branch-local state bugs
- rerun the targeted E2E specs that exercise repeated mutations in the same screen

Typical danger signs:

- add/edit forms closing unexpectedly after a successful mutation
- newly created items disappearing until a hard refresh
- local optimistic state being overwritten by a stale server payload

## Branch Hygiene

Long-lived branches must be rebased onto a known-green base regularly.

If a feature branch starts collecting test-only drift:

- stop layering more fixes onto it
- rebase onto the latest green branch
- re-verify from there

Do not preserve workaround commits just because they made one branch pass once.

## Failure Triage

When a full run fails:

1. record the exact failing file and assertion
2. isolate that failure
3. verify whether the failure is domain-specific or shared-harness fallout
4. inspect shared auth, helper, and route-readiness layers before adding test code
