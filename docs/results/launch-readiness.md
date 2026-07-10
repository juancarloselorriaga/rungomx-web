# Results & Rankings — Launch-Readiness Audit & State Map

> ## ⚠️ Update 2026-07-10 — remediated & wired
> This document was the **pre-implementation** audit (verdict: *not launch-ready*). On branch
> `docs/results-launch-readiness` the findings were fixed **and the feature was wired
> end-to-end**, changing the verdict. Read this section first; the original audit below is
> retained for context and traceability.
>
> **What changed:**
> - **Ingestion now exists (§6.1 closed).** A bulk `importResultDraftRows` server action
>   creates/append-into a single draft version per edition (all distances in one version),
>   validates rows server-side, and derives placements once per version. The import lane is
>   wired to it with a distance selector; the review lane finalizes; a draft-discard action
>   exists.
> - **Corrections wired end-to-end (§6.3 closed).** Organizer intake form + review + a
>   **publish** action; publication re-anchors to the active version (RES-1).
> - **Rankings have a driver (§6.4 closed).** Finalization and correction publication trigger
>   a national recompute+promote against an auto-bootstrapped baseline ruleset; computation is
>   per-discipline and ruleset-driven (RES-3).
> - **All 25 defects (RES-1..25)** addressed — 23 fixed, 2 partial. See
>   `docs/results/known-issues.md` for per-finding status.
> - **Verified live in a browser** (local Postgres, the provided test accounts): organizer
>   imports two distances (bibs reused, accented names), finalizes, the public page shows
>   per-distance places with a shared-rank tie and the corrected version, national rankings
>   render per-discipline, and a non-organizer is redirected away from the dashboard.
>
> **Revised verdict:** the coherent slice — **import → review → finalize → public results →
> national rankings → correction round-trip** — is implemented, tested, and browser-verified.
> **Claims remain intentionally unwired** (domain hardened per RES-5/6/7; ship behind no UI
> until a product decision — see §6.2). Remaining pre-launch items are the two PARTIALs
> (RES-21 localized error messages, RES-24 scan pagination) and running `test:e2e:isolated`
> in CI.
>
> **Design decision recorded (§7.1):** a result *version* is **per edition** (holds all
> distances), not per distance — the import appends distances into one draft so the
> single-active-version model surfaces every distance publicly.

---

> **Status (original audit):** Awareness / launch-verdict document. Written 2026-07-10, verified against commit `ed88567`.
> **Audience:** Whoever decides what ships at launch, and the engineer(s) who wire the missing drivers. Read this before touching anything under `lib/events/results/`, and re-verify the reachability claims against the code at that time (grep commands in the appendix).
> **Companion:** `docs/results/known-issues.md` — the defect register (evidence, confidence, repro, fix directions). This document owns architecture, reachability, and dispositions; that one owns the bugs.
> **Context:** The platform is greenfield and has not launched. Unlike payments (deliberately dormant until a provider exists), **results is a core launch feature and the platform's public face** — the standard here is "trustworthy on day one".

---

## 1. Executive summary and launch verdict

The results domain is ~9.7k LOC of domain code (`lib/events/results/`), plus organizer/public UI, 45+ test files, and a public read surface (`/resultados`, `/resultados/[series]/[edition]`, `/clasificaciones`) with careful caching, SEO gating, and identity-policy plumbing.

**The verdict in one paragraph:** the public **read path is genuinely good** — active-version resolution, draft/superseded isolation, noindex/sitemap gating, identity policy, correction transparency copy, and cache invalidation on publish are all implemented and mostly verified clean. But the platform currently has **no production path for result data to enter the system**: manual capture saves to `localStorage` and its "sync" never calls the server; the CSV import page is a mapping *preview*; every entry-write, claim, correction-intake, correction-publication, and rankings-pipeline server action has **zero UI callers**. Only two mutations are wired end-to-end: *finalize the newest draft* and *approve/reject a correction request* — both operating on rows that no UI can create. `/clasificaciones` can never show data because no ruleset can be created and no snapshot can be computed or promoted from any production surface. On top of the wiring gap, the two central computations are wrong for real races: placements pool all distances of an edition (RES-2), and rankings are a cross-discipline raw-time sort that ignores the ruleset it advertises (RES-3). **Results, as the launch feature it is meant to be, is not launch-ready.** The honest launch options are: (a) wire the minimal ingestion path + fix the two computation findings and ship results without claims/rankings, or (b) ship the read-only shell fed by operator-run scripts, with rankings/claims hidden. Either way several public-surface fixes (RES-10, RES-12) and copy adjustments are needed first.

### Verdict legend

| Mark | Meaning |
| --- | --- |
| **LAUNCH BLOCKER** | Results cannot honestly launch as a feature while this holds. |
| **FIX BEFORE LAUNCH** | Shippable only if fixed (or the surface is hidden) before public traffic. |
| **FAST-FOLLOW** | Acceptable at launch; schedule immediately after. |
| **ACCEPTED RISK** | Known, documented, deliberately deferred (rationale given). |

### Verdict table

| Area | State | Verdict |
| --- | --- | --- |
| Ingestion — any production write path for entries (capture/import/bulk) | Does not exist (§6.1) | **LAUNCH BLOCKER** — wire it, or launch is a read-only shell fed by scripts (explicit product decision) |
| Placement derivation (overall/gender/age-group) | Pools all distances of an edition (RES-2); alphabetical tie-breaks (RES-17) | **LAUNCH BLOCKER** for RES-2 the moment any multi-distance data enters; RES-17 fast-follow |
| Finalization (draft → official) | Wired and gate-checked; targets "newest draft", non-atomic, no draft discard (RES-11) | **FIX BEFORE LAUNCH** (version-targeted finalize + discard path); atomicity fast-follow |
| Public official results page | Solid states/SEO/identity policy; truncates at 200 with no pagination (RES-12) | **FIX BEFORE LAUNCH** (pagination or honest truncation notice) |
| Public directory & search | Works; lists `unlisted` editions (RES-10); 60s/30s bounded staleness (RES-22) | **FIX BEFORE LAUNCH** (RES-10); RES-22 accepted risk (bounded ≤60s) |
| Corrections — intake | Server action exists, **no UI**; unlinked athletes can never file (RES-5 dependency) | **FIX BEFORE LAUNCH**: either wire intake or soften the public trust copy that implies an operating corrections process |
| Corrections — review | Wired (approve/reject); approve doesn't validate patch (RES-13); raw-JSON review UX | **FIX BEFORE LAUNCH** (patch validation at approve); UX fast-follow |
| Corrections — publication | Server action exists, **no UI** → approved corrections can never take effect (§6.3); sibling-clobber bug when it does (RES-1) | **LAUNCH BLOCKER** if corrections are part of the launch story (they are, per the trust copy); RES-1 must land with the wiring |
| Claims (athlete result claiming) | Entire flow unwired (§6.2); auto-link hijack + no revocation (RES-6); linkage doesn't propagate (RES-5); stale-version candidates (RES-7) | **ACCEPTED RISK at launch only if it stays unwired and unadvertised**; RES-5/6/7 are **blockers for ever wiring it** |
| Rankings — computation | Cross-discipline raw-time sort; ruleset never applied; same runner appears per-race (RES-3); filter-after-limit (RES-4) | **LAUNCH BLOCKER** for shipping rankings with data |
| Rankings — pipeline (ruleset publish, snapshot compute/promote) | Zero production callers, no cron/admin/action (§6.4) → `/clasificaciones` permanently empty | **FIX BEFORE LAUNCH**: hide the rankings nav/page, or build the driver + fix RES-3/4/18/19/20 |
| Rankings — public page | Renders; empty state forever today; swallows errors into "empty" (RES-20); bypasses identity policy (RES-18); uncached | **FIX BEFORE LAUNCH** if shown at all (even empty, RES-20 hides incidents) |
| Organizer workspace (home/rail/versions) | Wired; fabricated fallback rows on capture/import (RES-8); `corrected` shown as draft (RES-9) | **FIX BEFORE LAUNCH** (RES-8 — fake data in production UI); RES-9 fast-follow |
| Offline capture (`offline/`) | Client-side simulation; nothing reaches the server (§6.5); device loss = data loss | **ACCEPTED RISK** only if capture is not advertised for launch; otherwise part of the ingestion blocker |
| Identity policy & PII | Applied on results pages; env-switchable; rankings bypass (RES-18); metadata clean | **FAST-FOLLOW** (RES-18 matters when rankings ship or policy ≠ full-name) |
| Caching & invalidation | Publish/correction revalidate edition tags correctly; search-tag and rankings-tag asymmetries (RES-22) | **ACCEPTED RISK** (bounded ≤60s) — align during rankings work |
| i18n / es-first | Message files at parity; domain error strings hardcoded English (RES-21); import vocab English-only (RES-16) | **FIX BEFORE LAUNCH** (RES-21 for the wired surfaces); RES-16 lands with ingestion |
| Ingestion parsing (CSV/XLSX) | Client-only preview; unknown-status→finish coercion, ms-vs-seconds, encoding gaps (RES-16); DB constraints vs. real bib/name data (RES-15) | Lands with the ingestion blocker — treat RES-15/16 as part of that work |
| Scale posture | O(n²) per-row placement rewrites (RES-14); unbounded pointer scans, 1000-version silent cap (RES-24) | **FAST-FOLLOW** — fine at day-one volumes, silent at growth |
| Tests | Strong unit coverage of policy/lifecycle/identity; e2e = read-only smoke over seeded rows; zero coverage of correction/claims/rankings mutations, concurrency, or real cache behavior (§9) | **FAST-FOLLOW** — add mutation-path e2e as the wiring lands |

---

## 2. What actually works today (production posture)

With current wiring, in production:

1. **If result rows exist in the DB** (seeded by an operator/script — no UI can create them): the public edition page renders the active official/corrected version with placements, distance labels, status badges, version number, finalized/updated timestamps, correction summaries, and correct SEO (noindex until official+published; sitemap only for indexable pages).
2. `/resultados` renders a directory of editions with an active version and a name/bib search across active versions only. (Both include `unlisted` editions — RES-10.)
3. `/clasificaciones` renders its **empty state** (no snapshot can ever exist — §6.4) with working filter UI.
4. Organizers can open the results workspace (`/dashboard/events/[id]/results` + capture/import/review/corrections/investigation lanes). Capture writes to `localStorage` only. Import parses/maps files client-side only. Review shows the newest draft (if one exists in the DB) and can **finalize** it (`finalizeResultVersionAttestation` — the one fully wired mutation, with a server-side gate). The corrections lane lists requests (if any exist in the DB) and can **approve/reject** them (`reviewResultCorrectionRequest` — the other wired mutation). Approved corrections then sit forever: publication has no UI.
5. The investigation lane (internal) shows version lineage, correction transitions, and trust audit logs — read-only, wired.

Registration/claims/corrections **athlete-side**: there is no athlete-facing surface at all (no "claim your result", no "request correction" button anywhere).

---

## 3. Architecture

```
                    (organizer, dashboard)                       (public)
  capture (localStorage only)   import (preview only)     /resultados  /resultados/[s]/[e]  /clasificaciones
          │ ✂ not wired               │ ✂ not wired             │              │                  │
          ▼                           ▼                         ▼              ▼                  ▼
   [intended] upsertDraftResultEntry / bulk ingestion      directory      edition page       leaderboard
          │                                                & search       (cached 60s,       (uncached,
          ▼                                                (cached        tags: edition/     reads promoted
   resultVersions (draft) ← createResultDraftVersion /     30–60s,        official)          snapshot rows)
   resultEntries             initializeResultIngestionSession  tag: search)      ▲                  ▲
          │                                                      ▲              │                  │
          ▼  finalizeResultVersionAttestation ✅ wired            └── active-pointer resolution ────┘
   gate (server-side) → deriveResultPlacements → draft→official → revalidate edition/official/rankings tags
          │
          ▼
   correction request ✂ no intake UI → review ✅ wired (approve/reject)
          → publishApprovedCorrectionVersion ✂ no UI
             └─ tx: new version (source = request's version ⚠ RES-1) + entry copies + placements
                + draft→corrected CAS + request marker + audit → revalidate tags
          │
          ▼
   rankings pipeline ✂ fully unwired:
   publishRankingRuleset → computeRankingSnapshot (ignores ruleset ⚠ RES-3) → publishRankingSnapshot (isCurrent)
```

### 3.1 Version lifecycle (the core state machine)

- Enum `result_version_status`: `draft → official | corrected`; `official` and `corrected` are terminal (`lib/events/results/lifecycle/state-machine.ts:17-21`). There is **no** retracted/archived/unpublished state and no delete path — once official, the only forward move is a *new* corrected version.
- **Active pointer** = highest `versionNumber` (tiebreak `createdAt`) with status in `official|corrected`, per edition (`state-machine.ts:104-119`). All public reads resolve through this. The old official stays `official` in the DB; supersession is purely positional.
- Version numbers are unique per edition (`db/schema.ts:1027`) and allocated with a retry loop on conflict.
- Corrections create a `draft` (source `correction`, parent = source version) and flip it to `corrected` inside one transaction with a status CAS — the only CAS-guarded transition; plain finalization has none (RES-11).

### 3.2 Data model (db/schema.ts:941-1363)

| Table | Purpose | Notable constraints |
| --- | --- | --- |
| `result_versions` | Versioned result sets per edition | unique `(editionId, versionNumber)`; self-FK `parentVersionId`; soft-delete column (never written) |
| `result_entries` | Rows within a version; `userId` nullable ("unclaimed") | unique `(versionId, bib)` (⚠ per version, not per distance — RES-15); unique `(versionId, name)` where bib null (⚠ homonyms — RES-15); positive-time and non-negative-age checks |
| `result_entry_claims` | One claim slot per entry | unique on `resultEntryId` (where not deleted); status/linked-user consistency checks; `pending_review → linked|rejected`, rejected reopenable |
| `result_ingestion_sessions` | One session per version | unique `resultVersionId` |
| `result_correction_requests` | `pending → approved|rejected`; publication recorded only in `requestContext.publication` (no status change — RES-25) | — |
| `ranking_rulesets` | Versioned rule definitions — **content never read** (RES-3) | unique `versionTag`; `active` requires `publishedAt`; activation-window check |
| `ranking_snapshots` | Computed leaderboards; `isCurrent` promotion flag | scope/org consistency check; ⚠ no uniqueness on current (RES-19) |
| `ranking_snapshot_rows` | Denormalized rows (name/bib/gender/age/time frozen at compute — RES-18) | unique `(snapshotId, rank)` — forbids shared ranks (RES-17) |

### 3.3 The facade and its consumers

`lib/events/results/actions.ts` (stable boundary, 11 exports) → workflows in `actions/{ingestion,finalization,claims,corrections}.ts`. Auth: `withAuthenticatedUser` + `checkEventsAccess` + per-edition `assertCanWriteResultsForEdition` (org permission `canEditRegistrationSettings`, admin bypass `canManageEvents`). Claims intake intentionally requires only an authenticated profile.

**Production reachability of the facade (the load-bearing table — verified 2026-07-10, appendix greps):**

| Export | Production UI caller | Status |
| --- | --- | --- |
| `finalizeResultVersionAttestation` | `components/results/organizer/draft-review-finalization-gate.tsx:97` (review lane) | ✅ wired |
| `reviewResultCorrectionRequest` | `components/results/organizer/correction-review-queue.tsx:91` (corrections lane) | ✅ wired |
| `createResultDraftVersion` | none | ✂ unreachable |
| `initializeResultIngestionSession` | none | ✂ unreachable |
| `upsertDraftResultEntry` | none | ✂ unreachable |
| `linkDraftResultEntryToUser` | none | ✂ unreachable |
| `getRunnerResultClaimCandidates` | none | ✂ unreachable |
| `confirmRunnerResultClaim` | none | ✂ unreachable |
| `reviewRunnerResultClaim` | none | ✂ unreachable |
| `requestRunnerResultCorrection` | none | ✂ unreachable |
| `publishApprovedCorrectionVersion` | none | ✂ unreachable |

Rankings module (not on the facade): `publishRankingRuleset`, `computeRankingSnapshot`, `computeNationalRankingSnapshot`, `publishRankingSnapshot`, `recomputeAndPublishNationalRankingSnapshot` — **zero callers anywhere in `app/`, `components/`, `hooks/`, `scripts/`, or other `lib/` modules; no cron, no admin page, no API route.** Tests only.

Read-side queries used in production: `getPublicOfficialResultsPageData`, `listPublicOfficialResultsDirectory`, `searchPublicOfficialResultEntries`, `listRecentPublicCorrectionSummaries`, `getPublicRankingLeaderboard`, `listOrganizerCorrectionRequestsForEdition`, `listCorrectionAuditTrailForEdition`, `getCorrectionLifecycleMetrics`, `getInternalResultsInvestigationViewData`, `listResultTrustAuditLogsForEdition`, plus the workspace builders. UI-orphaned exports: `listPendingResultClaimReviewsForEdition`, `getResultClaimResolutionTrace`, `listDraftResultEntries`, `findDraftEntriesByIdentity`, `getRankingSourceEligibilityForEdition`, `listResultVersionHistoryForEdition`, `getPublicNationalRankingLeaderboard`, `getActiveOfficialResultVersionForEdition` (and the full offline store API — §6.5).

### 3.4 Caching

- Cached scopes (`use cache: remote` + `safeCacheLife`/`safeCacheTag`): edition page (60s, tags `results:edition:{id}`, `results:official:{id}`), directory (60s, tag `results:search`), search (30s, tag `results:search`).
- Invalidation: `revalidateResultsPublicationArtifacts` (`shared/cache.ts`) fires on finalization and correction publication — revalidates edition/official + all rankings tags + the public event page. It does **not** revalidate `results:search` (bounded by expiry), and the rankings tags it revalidates are never attached anywhere (RES-22). `/clasificaciones` is fully dynamic (no `use cache`).

---

## 4. Route & component inventory

**Public:** `/results` (directory + search, es route `/resultados`), `/results/[seriesSlug]/[editionSlug]` (official page; robots via `resolvePublicOfficialResultsRobotsDirectives`; metadata PII-free), `/results/how-it-works` (trust explainer), `/rankings` (`/clasificaciones`). Sitemap includes the static routes and per-edition results URLs gated by `isPublicOfficialResultsPageIndexable` (`app/sitemap.ts:117-158`).

**Organizer dashboard** (`/dashboard/events/[eventId]/results`): home (review lane data), `capture` (localStorage bib entry — RES-8 fallback rows), `import` (client-side parse/map preview), `review` (rows + finalization gate), `corrections` (queue + audit trail + lifecycle metrics), `investigation` (version lineage, diffs, trust audit logs; noindex). Auth is enforced by the parent event layout (`canUserAccessSeries`) plus per-action checks — verified clean.

**Components:** `components/results/organizer/` (capture list 705 LOC, import preview 611, finalization gate 265, review queue 294, metrics 313, audit trail 111, versions panel 135, results grid 348, lane 192), `components/results/public/correction-summary-block.tsx`, `components/results/primitives/` (state rail, trust-scan header, density switch, how-it-works box, safe-next-details). No orphan components.

---

## 5. Trust copy vs. system reality

The public explainer (`/results/how-it-works`, strengthened in commit `39c90af`) and rankings page promise, in es/en:

| Public claim (message key) | Reality at `ed88567` |
| --- | --- |
| "Official means the Race Director published that version" (`howItWorks.panel.point1`) | ✅ True — attested finalization, wired. |
| "If a correction is approved, we publish the new version without hiding the change" (`panel.point2`, `correctionProcess.*`) | ⚠ Approval is wired, but **publication has no UI** (§6.3) — approved corrections never become versions; and when wired, sibling publications can silently revert each other (RES-1). |
| "You can see that a correction happened and when" (`correctionProcess.point2`) | ✅ Surface exists (`corrections` block on `/resultados`, version badge + timestamps on the edition page) — it will simply never have content until publication is wired. |
| "Ranking rules version {tag}" / "Open ranking rules" (`rankings.reproducibility.*`) | ⚠ Ruleset content never drives computation (RES-3); the link/reference is decorative. |
| "Results from different races that clearly belong to the same runner may be shown together" (`runnerGrouping.*`) | ⚠ No grouping logic exists anywhere; each race result is an independent row. Commit `ed88567` clarified this copy but the hedge still implies a matching mechanism. |
| "{rows} corredores clasificados" (`snapshot.summary`) | ⚠ Counts rows, not runners (same runner appears once per race). |

If the launch decision is to ship without wiring corrections/rankings, this copy must be softened accordingly — it is the platform's own trust surface making the promises.

---

## 6. Verified gaps and dead ends (the reachability class)

> Concrete in-code defects live in `docs/results/known-issues.md`. These are the structural "feature has no driver" findings, payments-§6-style.

### 6.1 No production path for result data to enter the system

- Manual capture (`capture-bib-entry-list.tsx`) persists to `localStorage` and its "sync" runs `runDeterministicOfflineSync` **entirely client-side** (`capture-bib-entry-list.tsx:305-318`) — no server call exists in the component. Synced ≠ saved to DB; clearing the browser loses the race.
- The import lane parses and maps files client-side (`import-mapping-preview.tsx`) and **stops** — there is no upload/ingest call, and no bulk ingestion server action exists at all (the facade only has per-row `upsertDraftResultEntry`, itself unreachable, and O(n²) at scale — RES-14).
- `createResultDraftVersion` / `initializeResultIngestionSession` / `upsertDraftResultEntry` / `linkDraftResultEntryToUser` have zero UI callers.
- Consequence: every downstream feature (finalization, corrections, claims, rankings, the entire public surface) operates on data that can only arrive via operator scripts or direct DB writes. **This is the launch decision.**

### 6.2 The claims workflow has no UI on either side

`getRunnerResultClaimCandidates`, `confirmRunnerResultClaim` (athlete) and `reviewRunnerResultClaim`, `listPendingResultClaimReviewsForEdition` (organizer) are fully implemented, tested, and unreachable. Nothing in the product mentions claiming. Before wiring: RES-5 (linkage doesn't propagate), RES-6 (auto-link hijack + no revocation), RES-7 (stale-version candidates) are prerequisites, not fast-follows.

### 6.3 Corrections can be approved but never take effect

Intake (`requestRunnerResultCorrection`) and publication (`publishApprovedCorrectionVersion`) have no UI; only review is wired. In production the corrections queue will always be empty (nothing can create requests) — and if requests were seeded, approving them is a one-way door into "approved forever" (publication unreachable; RES-13 dead end even when reachable). The corrections dashboard (metrics, aging buckets, audit trail) is a well-built display over a pipeline with no inlet and no outlet. Note intake, when wired, is limited to *linked* runners (`entry.userId`) — which RES-5 means is effectively "runners an organizer manually linked at draft time".

### 6.4 The rankings pipeline has no driver of any kind

No production surface creates a ruleset, computes a snapshot, or promotes one — no admin page, no server action caller, no cron (`app/api/cron/` has only cleanup/billing jobs), no API route. Finalization/correction invalidate rankings *cache tags* but never trigger *recomputation*, and the tags aren't attached to anything anyway (RES-22). `/clasificaciones` is a permanent empty state with functional filters. Decide: build the driver (+ fix RES-3/4/18/19/20 first) or hide the page/nav for launch.

### 6.5 The offline module is a client-side simulation

`offline/capture-store.ts` + `offline/sync-engine.ts` implement a deterministic local store, conflict model, and checkpointing — but `runDeterministicOfflineSync` takes no server data and pushes none; "conflicts" can only arise from the store's own contents. It is a rehearsal of an offline-sync design, consumed only by the capture component and tests. Treat as REVISIT: keep as reference for the real capture wiring, do not extend.

### 6.6 No draft discard, no version retraction, no claim revocation

Three one-way doors: a bad draft can never be deleted (and finalization always grabs the newest draft — RES-11); a published version can never be unpublished (only superseded by correction — likely intended, but note there is **no takedown path** for e.g. a legal/privacy removal request short of DB surgery); a wrong claim link can never be undone (RES-6). All three need explicit product answers before launch.

---

## 7. Design assumptions to re-litigate before wiring

1. **What is a "result version"?** Today: one version = whole edition (all distances). That forces per-distance placement partitioning (RES-2) and per-distance bib scoping (RES-15) to happen *inside* the version. Alternative: version per distance. Decide before building bulk ingestion.
2. **What does the national ranking mean?** Raw-time sort across disciplines/distances is not a product (RES-3). Per-discipline? Per-distance-bracket? Points across races per runner? The ruleset table exists to hold this — make it real or remove it.
3. **Claim identity bar.** Name+gender auto-link is below any defensible bar while full names are public (RES-6). Options: organizer-review-always, bib+email challenge, registration-linkage (registrations table already knows who ran).
4. **Correction re-anchoring.** When multiple corrections race, publication must target the active version (RES-1) — decide re-anchor vs. re-file.
5. **`unlisted` semantics** for results surfaces (RES-10) — mirror the events domain (listed nowhere, reachable by link).
6. **Retraction/takedown path** (§6.6) — privacy requests will happen; "publish a correction" cannot remove a person.

---

## 8. Wiring playbook (ordered, if results ships as a real feature)

1. **Decide §7.1 and §7.2 first** (version shape, ranking semantics) — they shape everything below.
2. **Fix placement derivation** (RES-2, RES-17) — pure function + tests; do it before any data enters.
3. **Bulk ingestion server action** (new, on the facade): create version + insert N validated rows + derive placements once, transactionally; server-side re-validation of RES-16 items (status vocab incl. Spanish, time units, encoding); resolve RES-15 constraints first. Wire the import lane to it.
4. **Wire capture** to the same action (batch flush of the localStorage store), or descope capture for launch and delete the fallback rows (RES-8).
5. **Finalize hardening** (RES-11): version-targeted attestation, CAS on the transition, draft discard action.
6. **Corrections end-to-end**: intake UI (organizer-side first; athlete-side depends on claims), patch validation at approve (RES-13), publication UI, and the RES-1 re-anchor fix. Update trust copy if any piece is descoped.
7. **Public page pagination** (RES-12) + `unlisted` filtering (RES-10) + localized domain errors (RES-21).
8. **Rankings**, only after §7.2: make the ruleset drive computation, per-scope filters in SQL (RES-4), identity policy at render (RES-18), transactional promotion + partial unique index (RES-19), error surfacing + caching with the already-plumbed tags (RES-20/22), and a driver (recompute on finalization/correction via `recomputeAndPublishNationalRankingSnapshot`, or a cron).
9. **Claims**, last and only with RES-5/6/7 resolved and a revocation path.
10. Each step: extend the e2e suite past read-only smoke (§9) — upload→finalize→public, correction round-trip, claim round-trip.

---

## 9. Test surface honesty

- **Unit (Jest, ~45 files):** genuinely strong on pure logic — lifecycle transitions, identity scoring/normalization (43 tests), placement derivation, snapshot source selection, indexability, identity policy env modes, correction transparency queries. All DB access is mocked with hand-built chains; no results `.db.test.ts` exists.
- **E2E (Playwright):** `results-rankings-public.spec.ts` seeds `resultVersions`/`resultEntries` **directly into the DB** (status `official`, one entry) and asserts public rendering, search params, rankings *filter UI*, and status/version badges — read path only. The rankings page is only ever exercised in its **empty** state (no snapshot is ever seeded). `public-trust-shell.spec.ts` is contact/help/legal shell smoke — no results data at all.
- **Zero automated coverage of:** any wired or unwired mutation end-to-end (finalize is unit-tested via mocks only), correction create→approve→publish, claims round-trip, ranking compute→promote→render, concurrency (double-finalize, sibling corrections, claim races beyond unit-level), real cache invalidation (revalidateTag is mocked), pagination beyond limit-clamping, non-UTF-8 imports.
- Consequence: CI green (`pnpm test:ci:isolated`) says the *read shell and pure logic* work. It says nothing about the write pipeline — which is consistent with the write pipeline not being wired.

---

## 10. Invariants to preserve (whatever you change)

1. **Active-pointer reads everywhere public:** never render draft or superseded versions; resolve max-version official/corrected per edition (`ACTIVE_OFFICIAL_POINTER_STATUSES`).
2. **Official immutability:** published versions are never edited in place; changes flow through correction versions with lineage (`parentVersionId`, provenance, audit).
3. **Server-derived placements:** `overallPlace`/`genderPlace`/`ageGroupPlace` are never accepted from client input (`actions.ts:402-405` nulls them).
4. **URL stability across corrections:** `/results/[series]/[edition]` never changes when versions supersede (asserted in metadata tests).
5. **Indexability gate:** nothing non-official or non-published is indexable or sitemapped.
6. **Identity policy at every public render** of runner identity (extend to rankings — RES-18).
7. **Facade stability:** `lib/events/results/actions.ts` signatures are a stable boundary (`AGENTS.md`); add (e.g. bulk ingestion), don't reshape.
8. **Auth layering:** event layout guards reads, `assertCanWriteResultsForEdition` guards every write; keep both.
9. **Audit on trust transitions:** ingestion-init, finalization, correction approve/publish write audit logs (`shared/audit.ts`) — extend to claim links and any new transition.
10. **Release signal:** only `pnpm test:ci:isolated` counts.

---

## Appendix — re-verifying the reachability claims

The "zero callers / no UI" claims rot fastest. Re-check from the repo root (multiline calls and barrels are why `-rn` over all extensions matters; e2e specs that seed the DB directly do **not** count as production reachability):

```bash
# facade actions: expect hits only in lib/events/results, lib/events/actions.ts (barrel), __tests__
for fn in createResultDraftVersion initializeResultIngestionSession upsertDraftResultEntry \
          linkDraftResultEntryToUser getRunnerResultClaimCandidates confirmRunnerResultClaim \
          reviewRunnerResultClaim requestRunnerResultCorrection publishApprovedCorrectionVersion; do
  echo "== $fn"; grep -rn "$fn" app components hooks --include='*.ts' --include='*.tsx'; done
# wired pair (expect the two component call sites):
grep -rn 'finalizeResultVersionAttestation\|reviewResultCorrectionRequest' components app --include='*.tsx'

# rankings pipeline drivers (expect: nothing outside lib/events/results + tests)
grep -rn 'publishRankingRuleset\|computeRankingSnapshot\|publishRankingSnapshot\|recomputeAndPublish' \
  app components hooks lib scripts --include='*.ts' --include='*.tsx' | grep -v 'lib/events/results'

# ruleset content actually used? (expect: only types + rulesets.ts itself)
grep -rn 'rulesDefinitionJson' app components lib --include='*.ts*' | grep -v db/schema.ts

# capture really localStorage-only? (expect: no fetch/server-action import in the component)
grep -n 'fetch(\|@/lib/events/results/actions' components/results/organizer/capture-bib-entry-list.tsx

# rankings cache tags attached anywhere? (expect: attachments none; revalidations in shared/cache.ts + ranking-publication.ts)
grep -rn 'rankingsNationalTag\|rankingsOrganizerTag\|rankingsRulesetCurrentTag' app components lib --include='*.ts*'

# delete/discard paths for versions/entries (expect: none)
grep -rn '\.delete(\|deletedAt:' lib/events/results --include='*.ts' | grep -v 'isNull\|deletedAt: true'
```

Findings in this document reflect commit `ed88567` (2026-07-10). Defects register: `docs/results/known-issues.md`.
