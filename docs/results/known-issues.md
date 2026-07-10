# Results & Rankings — Known Issues & Suspected Bugs

> **Status:** Findings register. Written 2026-07-10, verified against commit `ed88567`.
> **Companion to:** `docs/results/launch-readiness.md` (architecture, reachability map, launch verdict). The reachability-class gaps (feature has no production driver/UI) live **there**, in §6; this file registers concrete defects in the code that exists.
> **How to use:** Each finding is self-contained — evidence (`file:line`), a concrete failure scenario, how to verify, and a suggested fix direction — so an agent or engineer can pick one up independently. Confidence describes how sure we are the *defect is real as described*; severity assumes results is live at launch **and the currently-unwired write paths get wired** (most defects below sit on paths that are unreachable today — that context is flagged per finding).
>
> Confidence scale: **CONFIRMED** = the failing path was verified by direct code reading; **HIGH** = code verified, failure needs a specific but realistic trigger; **MEDIUM** = behavior verified, but it may be intended design — needs a product/intent decision; **LOW** = edge case or cosmetic.

---

## Priority findings

### RES-1 — Sibling correction publications silently revert each other

- **Severity:** High (published results regress) · **Confidence:** CONFIRMED (path verified; trigger = two corrections on the same source version, the normal post-race pattern)
- **Where:** `lib/events/results/actions/corrections.ts:383-416` (source version = `request.resultVersionId`), `:506-556` (entries copied from that source)
- **What:** Correction publication rebuilds the new corrected version by copying **the version the request was filed against**, not the currently active version. Requests are filed against the active version at *request time*; nothing re-anchors them when a sibling correction publishes first.
- **Failure scenario:** Runners A and B both file corrections against official v1 in the same week. Organizer approves both. Publishing A's request creates corrected v2 (A fixed). Publishing B's request copies **v1** again into v3 (B fixed, **A's fix reverted**). v3 is the active pointer — A's published correction has silently disappeared, contradicting the public trust copy ("we publish a new version instead of silently overwriting").
- **Verify:** DB test — seed official v1 with two entries, file+approve two correction requests, publish both; assert the final active version contains only the second fix.
- **Fix direction:** Publish from the *active* version for the edition (re-resolve at publish time) and validate the target entry still exists there (match by entry lineage or bib/name); or hard-block publication when `request.resultVersionId` is no longer the active version and require re-filing.

### RES-2 — Placements are computed across all distances of an edition

- **Severity:** High (wrong numbers on the public trust surface) · **Confidence:** CONFIRMED
- **Where:** `lib/events/results/derivation/placement.ts:140-226` (`RankingEntry` has no `distanceId`; one global sort, one counter per gender/age-group); callers select no distance: `lib/events/results/actions.ts:144-163`
- **What:** `deriveResultPlacements` ranks every entry in a result version in a single pool. A result version spans the whole edition (all distances), so `overallPlace`, `genderPlace`, and `ageGroupPlace` are computed across 5K, 10K, and marathon finishers together, ordered by raw finish time.
- **Failure scenario:** Any multi-distance edition (the norm). The 21K winner shows `overallPlace` ≈ 150 (behind every 5K/10K finisher) on the public results page, next to a "21K" distance label. Gender/age-group places are equally wrong.
- **Verify:** Unit test — two distances, two finishers each; assert each distance winner gets place 1 (currently fails).
- **Fix direction:** Partition by `distanceId` before ranking (placements per distance), and decide whether cross-distance "overall" has any meaning worth keeping. Ties: see RES-17.

### RES-3 — National ranking is a cross-discipline, cross-distance raw-time sort; the ruleset is never applied

- **Severity:** High (rankings are semantically meaningless; "reproducibility" UI is decorative) · **Confidence:** CONFIRMED — *currently unreachable (no compute driver, see launch-readiness §6.4); blocks wiring rankings*
- **Where:** `lib/events/results/rankings.ts:329-357` (`buildRankingSnapshotRowsFromEntries` — one global sort by `finishTimeMillis`, rank = index+1), `:399-419` (all `finish` entries of every included version pooled); ruleset content never read — `rulesDefinitionJson` has zero consumers outside the rulesets module itself (repo grep, see appendix)
- **What:** A snapshot ranks a 16-minute 5K trail run above every marathon and every cycling result. There is no per-discipline partitioning, no distance normalization, no per-runner aggregation (the same runner appears once per race), and `rankingRulesets.rulesDefinitionJson` never influences computation — the public "Rules version {tag}" / "Open ranking rules" copy (`messages/pages/rankings/*.json`) points at a ruleset that is only a foreign key.
- **Also:** the public copy claims cross-race runner *grouping* ("results from different races that clearly belong to the same runner may be shown together", `messages/pages/rankings/es.json:29`) — no grouping logic exists anywhere in the pipeline; commit `ed88567` clarified copy, not computation. And "{rows} corredores clasificados" counts rows, not runners.
- **Fix direction:** Decide ranking semantics before wiring any driver (per-discipline at minimum; likely per-distance-bracket, possibly points-based per runner); make the ruleset either drive computation or remove the reproducibility framing.

### RES-4 — Ranking filters are applied after the row limit: filtered leaderboards silently lose everyone ranked below the global cut

- **Severity:** High (a women's/age-group leaderboard drops most of its members) · **Confidence:** CONFIRMED — *unreachable until rankings have data*
- **Where:** `lib/events/results/rankings.ts:605-621` (fetch first `limit` (default 300) rows by global rank), `:655-662` (discipline/gender/age-group filters applied in memory afterwards)
- **Failure scenario:** Snapshot has 2,000 rows. Filter `gender=female` returns only the women who happen to sit inside the top 300 *global* ranks — everyone else is silently absent, with no indication. Rank numbers shown are the global ones (gaps like 3, 17, 41).
- **Fix direction:** Push filters into the SQL query before `limit`, and decide whether filtered views should re-rank (1..n within filter) or keep global ranks with an explanation.

### RES-5 — Approved/auto-linked claims never write `resultEntries.userId`, so linkage doesn't propagate anywhere that reads it

- **Severity:** Medium-high (claims don't produce the ownership they promise) · **Confidence:** CONFIRMED — *claims flow itself is unwired (no UI), see launch-readiness §6.2*
- **Where:** auto-link insert `lib/events/results/actions/claims.ts:545-555`, rejected-claim reopen `:459-478`, organizer approve `:669-688` — none touch `resultEntries`; corrections eligibility reads only `entry.userId` (`lib/events/results/actions/corrections.ts:177`); correction publication copies `entry.userId` (`corrections.ts:528`), not claim links
- **What:** "Linked" lives only in `result_entry_claims.linkedUserId`. Everything that gates on entry ownership — athlete correction submission, the `LINK_CONFLICT` protections in `upsertDraftResultEntry`/`linkDraftResultEntryToUser`, `findUnclaimedResultClaimCandidates`' `isNull(resultEntries.userId)` filter — sees the entry as still unowned. A runner whose claim was approved still cannot file a correction; a copied (corrected) version carries no trace of the claim.
- **Fix direction:** Decide the source of truth. Either linking writes `resultEntries.userId` (transactionally with the claim update, CAS-guarded like `linkDraftResultEntryToUser`), or every ownership consumer joins through active claims. Mixed reads are the bug.

### RES-6 — Claim auto-link is reachable with public data, and a wrong link is permanent (no revocation path)

- **Severity:** High if claims ship as-is (identity capture on a public trust surface) · **Confidence:** behavior CONFIRMED; auto-link is intended design (fixtures in `__tests__/lib/events/results/identity-model.server.test.ts` exercise ≥0.8 auto-link) — the *threshold/signals* need a product decision; the *missing revocation* is a defect regardless
- **Where:** scoring `lib/events/results/actions/claims.ts:151-260` (exact normalized name = 0.62, gender match = +0.18 → 0.80 ≥ `DEFAULT_AUTO_LINK_CLAIM_CONFIDENCE`), auto-link `:454-455`; review only from `pending_review` (`:661-663`); no unlink/revoke function exists anywhere in the domain; official entries can't be re-linked (`lib/events/results/actions.ts:518-524` blocks link mutations on non-draft versions)
- **Failure scenario:** Public results pages display full names (baseline identity policy). Anyone sets their profile name to a displayed name and gender to match → `confirmRunnerResultClaim` auto-links instantly, **no organizer review**. The real runner now hits `CLAIM_ALREADY_LINKED_ERROR`; the organizer has no tool to undo (review requires `pending_review`); the entry is on an official version so `linkDraftResultEntryToUser` refuses. Recovery = manual DB surgery. Additionally, a *rejected* claim can be re-submitted and auto-link past the organizer's explicit rejection (`:458-478` reopen path re-runs auto-link).
- **Fix direction:** Before wiring any claim UI: require organizer review for all claims (drop auto-link) or add a non-public verification signal; add an unlink/revoke transition (linked → rejected/revoked) with audit; make reopen-after-rejection always `pending_review`.

### RES-7 — Claim candidates come from *all* official/corrected versions, not the active pointer

- **Severity:** Medium (duplicate/stale candidates after any correction) · **Confidence:** CONFIRMED — *unwired flow*
- **Where:** `lib/events/results/queries.ts:839` and `:911` (`inArray(resultVersions.status, ['official','corrected'])` with no per-edition latest-version filter — compare `listActiveOfficialVersionPointers` `:562-591` which the public search correctly uses)
- **Failure scenario:** Edition has official v1 superseded by corrected v2. Both versions' entries match a runner's name → the candidate list shows the same race twice (possibly with different times); the runner can claim the superseded v1 copy while v2's copy stays unclaimed, or claim both.
- **Fix direction:** Filter candidates to active-pointer versions (reuse `listActiveOfficialVersionPointers`) and dedupe by lineage.

### RES-8 — Organizer capture/import lanes render fabricated runners when no draft exists

- **Severity:** Medium (production UI shows fake data as real rows) · **Confidence:** CONFIRMED — *wired and reachable today; every event shows this, since no UI can create a draft*
- **Where:** `lib/events/results/workspace.ts:191-304` (`getFallbackRowsForLane` — hardcoded "Ana Rivera", "Carlos Mendoza", "Lucia Torres", "Mateo Silva", "Elena Cruz", "Diego Lara" with fake bibs, times, conflict states); enabled for capture/import lanes at `app/[locale]/(protected)/dashboard/events/[eventId]/results/_results-workspace.ts:101-104` (`allowFallback: lane !== 'review'`)
- **What:** With no draft version (the default state of every edition in production), `/dashboard/events/[id]/results/capture` and `/import` show a populated results table of invented people with localized detail strings like "Duplicate bib conflict flagged for review". Nothing labels them as sample data.
- **Fix direction:** Delete the fallback rows (render the honest empty state) or clearly frame them as an onboarding example outside the real table.

### RES-9 — Organizer rail reports `draft` lifecycle after a correction is published

- **Severity:** Medium-low (misleading state on wired UI) · **Confidence:** CONFIRMED
- **Where:** `lib/events/results/workspace.ts:367-368` — `lifecycle = latestVersion?.status === 'official' ? 'official' : 'draft'`; the latest version after a correction has status `corrected`
- **Failure scenario:** Organizer publishes results (rail: "Official"), then a correction version is published → the rail flips back to "Draft" with next action "Review draft", implying the results were unpublished.
- **Fix direction:** Treat `corrected` as official (`ACTIVE_OFFICIAL_POINTER_STATUSES` already exists in `lifecycle/state-machine.ts:12-15`).

### RES-10 — Unlisted editions are listed in the public results directory and search

- **Severity:** Medium (breaks "unlisted" semantics; inconsistent with events domain) · **Confidence:** CONFIRMED — *wired, public*
- **Where:** `lib/events/results/queries.ts:620` (directory) and `:698` (search) accept `visibility IN ('published','unlisted')`; contrast the events domain, where listings are published-only (`lib/events/public/queries.ts:396`) and unlisted is reachable only by direct slug (`:151-152`); indexability policy also treats unlisted as noindex (`lib/events/results/public-official-results-indexability.ts:8`)
- **Failure scenario:** An organizer sets an edition to `unlisted` expecting link-only access; its results (full runner names) appear in `/resultados` browse and name/bib search for everyone.
- **Fix direction:** Listings/search filter to `published` only; keep `unlisted` working on the direct edition results URL (current `getPublicOfficialResultsPageData` behavior is correct).

### RES-11 — Finalization is non-atomic and always targets "the newest draft"; there is no way to discard a draft

- **Severity:** Medium (integrity + operational dead end) · **Confidence:** HIGH (structure confirmed; triggers = concurrency or a stray newer draft)
- **Where:** `lib/events/results/actions/finalization.ts:49-56` (selects latest draft by edition, not a version id), `:75-113` (gate → placements → transition as separate commits); entry upsert checks status only at read time (`lib/events/results/actions.ts:340-354`) with the insert at `:466-473`; lifecycle transition has no status CAS in its `UPDATE ... WHERE` (`lib/events/results/lifecycle/state-machine.ts:87-96`); no delete/discard path exists for versions or entries anywhere in the domain (repo grep, see appendix)
- **Failure scenarios:**
  1. Entry upserted concurrently with finalization lands after placements were derived but inside the now-official version — an official version with an unplaced (or post-attestation) row.
  2. Two drafts exist (e.g. a re-upload created v3 while v2 was being reviewed): the attestation input is only `editionId`, so the organizer publishes **v3 sight-unseen**; if the *newer* draft is the bad one there is no way to finalize the older one — and no way to delete the bad draft. The workspace UI reviews and publishes "the latest draft" with no version selector.
  3. Audit-log failure after the transition leaves the version official but returns an error to the organizer (`finalization.ts:127-148`), and cache revalidation is skipped (bounded by the 60s cache expiry).
- **Fix direction:** Finalize a specific `resultVersionId` (thread it through the gate UI); add a status CAS to `transitionResultVersionLifecycle`'s UPDATE; wrap placements+transition (and ideally the audit write) in one transaction; add a draft discard action (soft-delete is already modeled but unused).

### RES-12 — Public official results page truncates at 200 entries with no pagination or truncation notice

- **Severity:** Medium-high for launch traffic (finishers beyond 200 can't find themselves) · **Confidence:** CONFIRMED — *wired, public*
- **Where:** `app/[locale]/(public)/results/[seriesSlug]/[editionSlug]/page.tsx:73` (no `entryLimit` passed → default 200), cap 500 at `lib/events/results/queries.ts:434-437`, `:526`; no pagination UI, no "showing X of Y" (verified across the page); search (`limit: 80`) and rankings (300) likewise have no paging affordance
- **Failure scenario:** A 1,500-finisher race publishes. Places 201+ are simply absent from the canonical results page; a runner scrolling for their name concludes their result was lost (search still finds them, if they try it).
- **Fix direction:** Server-driven pagination (by place) or per-distance tabs with paging; at minimum render an explicit "showing first N of M" with a search hint.

### RES-13 — Approved correction with an unusable patch is a terminal dead end; the patch is requester-shaped JSON reviewed as a raw dump

- **Severity:** Medium (payments BUG-4 class: status with no exit) · **Confidence:** CONFIRMED
- **Where:** review transitions only `pending → approved|rejected` (`lib/events/results/actions/corrections.ts:284-309`); publication requires a schema-valid patch in `requestContext` (`:374-381`, schema `:60-72`) and there is no un-approve/cancel transition; `requestContext` is arbitrary requester JSON (`lib/events/results/schemas.ts:81-85`); the reviewer UI renders it only as `JSON.stringify` (`components/results/organizer/correction-review-queue.tsx:219-227`) with entry finish time shown as raw milliseconds (`:198-202`)
- **Failure scenarios:**
  1. A request whose `requestContext` lacks a valid `correctionPatch` gets approved (the approve button doesn't validate the patch) → publication permanently fails `CORRECTION_PUBLICATION_PATCH_REQUIRED_ERROR`; the request can never be rejected, cancelled, or fixed — it sits "approved" in metrics forever.
  2. Reviewer-blindness: approval is based on the free-text reason plus a raw JSON blob; a millisecond value (`"finishTimeMillis": 5243000`) is easy to misread — and once wired for athletes, the requester controls that JSON.
- **Fix direction:** Validate the patch at review time (block approve on invalid patch); add `approved → rejected`/`cancelled` exits; render the patch as a before→after field diff with formatted times.

### RES-14 — Per-entry placement rewrite makes sequential ingestion O(n²)

- **Severity:** Medium (scale; blocks the row-by-row ingestion model at real race sizes) · **Confidence:** CONFIRMED — *matters as soon as ingestion is wired*
- **Where:** `lib/events/results/actions.ts:441` and `:475` — every single `upsertDraftResultEntry` call re-reads **all** version entries and issues per-row UPDATEs for changed placements (`:144-215`, no transaction, `mutationClient` defaults to `db`); correction publication likewise copies entries row-by-row inside its transaction (`corrections.ts:506-556`)
- **Failure scenario:** Importing 3,000 finishers via the intended per-row action ≈ 3,000 reads of up-to-3,000 rows plus up to ~4.5M placement UPDATE statements against Neon. Also a mid-stream crash leaves placements half-updated (they're recomputed at finalization, which bounds the damage).
- **Fix direction:** Add a bulk ingestion action (insert N rows + derive placements once, in a transaction); defer placement persistence to finalize/preview instead of per-upsert.

### RES-15 — Bib uniqueness is per version, not per distance; name uniqueness rejects homonyms without bibs

- **Severity:** Medium (real Mexican race data will hit both) · **Confidence:** CONFIRMED — *bites when ingestion is wired*
- **Where:** `db/schema.ts:1076-1078` (`result_entries_version_bib_unique_idx` on `(resultVersionId, bibNumber)`) and `:1079-1081` (`(resultVersionId, runnerFullName)` where bib is null)
- **Failure scenarios:**
  1. Editions that number bibs per distance (5K #1-500, 10K #1-800 — common) cannot ingest both distances into one version: the second "bib 101" errors `CONFLICT` (`actions.ts:448-462`).
  2. Two different runners named "María Guadalupe Hernández García", neither with a bib → second row rejected. Homonyms are frequent in Mexican naming.
- **Fix direction:** Scope bib uniqueness to `(resultVersionId, distanceId, bibNumber)`; drop the name-based unique index in favor of a soft duplicate warning (the import preview already flags duplicates).

### RES-16 — Import parsing coerces unknown statuses to `finish`, only speaks English status vocabulary, and mis-parses plain-number times

- **Severity:** Medium (data integrity at ingestion; Spanish-first platform) · **Confidence:** CONFIRMED — *client-side today; becomes the ingestion gate when wired*
- **Where:** `lib/events/results/ingestion/validation.ts:138-150` (unknown status → warning + treated as `finish`), `:37-48` (recognizes only `finish/finished/dnf/dns/dq/disqualified` — no `descalificado`, `no terminó`, `DSQ`, `ret`), `:78-82` (a bare integer parses as **milliseconds**, so a seconds column like `5400` becomes 5.4s), duplicate bibs only a warning (`:165-180`) though the DB constraint is fatal (RES-15); no encoding handling — `csv-parser.ts:164-184` decodes UTF-8 only, so Windows-1252 exports (Excel es-MX default) mojibake accented names ("José" → "JosÃ©"); the shared CSV parser is comma-delimiter-only (`lib/events/group-registrations/csv.ts`)
- **Failure scenario:** A Spanish timing export marks a cheat "DESCALIFICADO"; the row imports as a *finisher* with their time and wins their category. Separately, a seconds-based time column imports as milliseconds and every runner "finishes" in under a minute (blockers won't fire — the values are valid).
- **Fix direction:** Unknown status must be a blocker (or an explicit mapping step); add Spanish/common timing vocabularies; treat bare integers as seconds (or require explicit unit choice in mapping); make duplicate bibs a blocker while the DB constraint stands; detect/allow choosing file encoding; support `;` delimiters.

### RES-17 — Exact-tie finishers get different places, broken by alphabet

- **Severity:** Low-medium (product correctness for dead heats) · **Confidence:** CONFIRMED
- **Where:** `lib/events/results/derivation/placement.ts:182-194` and `lib/events/results/rankings.ts:332-344` (tie-break by normalized name → bib → id assigns distinct sequential places); `db/schema.ts:1351-1353` makes shared ranks impossible in snapshots (`(snapshotId, rank)` unique)
- **What:** Two runners with identical `finishTimeMillis` receive places n and n+1 ordered by name — standard timing practice gives both place n ("1224" ranking). The snapshot-row unique index would need relaxing to support shared ranks.
- **Fix direction:** Product decision; if shared placement is wanted, assign competition ranking in derivation and drop/adjust the unique index.

### RES-18 — Rankings page bypasses the public identity policy; snapshots freeze names at compute time

- **Severity:** Medium (policy enforcement hole) · **Confidence:** CONFIRMED — *renders once rankings have data*
- **Where:** `app/[locale]/(public)/rankings/page.tsx:360-361` renders `row.runnerFullName`/`bibNumber` directly — no `resolvePublicResultIdentityDisplay` (results pages apply it: `app/[locale]/(public)/results/page.tsx:221-226`, `[editionSlug]/page.tsx:285-291`); snapshot rows denormalize names/gender/age at compute time (`rankings.ts:446-465`)
- **What:** If `RESULTS_PUBLIC_IDENTITY_POLICY_MODE` is ever set to `initials_with_bib`/`bib_only`, results pages mask names but the rankings page keeps publishing full names; corrections to a runner's name also don't reach promoted snapshots until a recompute (which currently has no trigger — launch-readiness §6.4).
- **Fix direction:** Apply the identity policy at rankings render; document that snapshots require recompute to reflect corrections (or resolve display fields at read time via `resultEntryId`).

### RES-19 — Snapshot promotion is non-transactional and `isCurrent` has no uniqueness

- **Severity:** Medium-low · **Confidence:** CONFIRMED (schema + code); trigger = concurrent/failed promotions — *unwired today*
- **Where:** `lib/events/results/ranking-publication.ts:48-74` (demote-all then promote as two commits); `db/schema.ts:1309-1311` (index on `isCurrent=true` is not unique)
- **What:** A crash between demote and promote leaves no current snapshot (read side falls back to newest by `promotedAt` — `rankings.ts:585-588` — so the page still renders); interleaved concurrent promotions can leave **two** current snapshots. `getPublicRankingLeaderboard` also falls back to `snapshotHistory[0]` when nothing is current, which can surface a **never-promoted** compute artifact, and the history dropdown exposes unpromoted snapshots (`:575-583`).
- **Fix direction:** Single transaction for demote+promote; partial unique index on `(scope, organizationId) WHERE is_current`; exclude never-promoted snapshots from public fallback/history.

### RES-20 — `getPublicRankingLeaderboard` swallows all errors into the empty state

- **Severity:** Medium-low (operability/trust) · **Confidence:** CONFIRMED
- **Where:** `lib/events/results/rankings.ts:693-710` — any thrown error (DB down, bad snapshot) logs to console and returns `state: 'empty'`
- **What:** A production incident renders as "no rankings yet" — indistinguishable from the legitimate empty state for users and monitoring alike. The rankings page also has no `use cache`, so every hit (including crawlers) runs ~5 uncached queries (`:523+`; contrast the cached results queries `queries.ts:431-432`).
- **Fix direction:** Let errors propagate to an error boundary (or a distinct degraded state); add `use cache: remote` + `rankingsNationalTag`/`rankingsOrganizerTag` so the existing revalidation calls actually target something (see RES-22).

---

## Secondary notes (lower grade)

### RES-21 — Domain error strings and claim guidance are hardcoded English on a Spanish-first platform

- **Confidence:** CONFIRMED · **Severity:** Low-medium (UX/i18n parity on the mutation path).
- All `ActionResult.error` strings in `lib/events/results/shared/errors.ts` are English and render verbatim in the UI (e.g. `correction-review-queue.tsx:114` shows `failurePrefix + result.error` — Spanish prefix, English error). `CLAIM_PENDING_REVIEW_STEPS` and `DEFAULT_CLAIM_EMPTY_STATE` (`errors.ts:44-60`) are English response payloads intended for athlete-facing UI. `pnpm validate:locales` can't see these. Map domain error *codes* to localized messages at the UI layer.

### RES-22 — Rankings cache tags are revalidated but never attached; search tag attached but never revalidated

- **Confidence:** CONFIRMED · **Severity:** Low today (bounded staleness).
- `rankingsNationalTag`/`rankingsOrganizerTag`/`rankingsRulesetCurrentTag` are revalidated (`shared/cache.ts:18-21`, `ranking-publication.ts:76-81`) but no `use cache` scope ever attaches them (the leaderboard is uncached) — dead invalidation. Conversely `resultsSearchTag()` is attached (`queries.ts:603`, `:680`) but `revalidateResultsPublicationArtifacts` never revalidates it, so the public directory/search rely solely on the 60s/30s `expire` to pick up newly published or corrected results. Bounded and acceptable pre-launch; align when touching caching.

### RES-23 — Directory/search/rankings dates ignore the edition timezone

- **Confidence:** CONFIRMED · **Severity:** Low (date can shift ±1 day).
- The edition results page formats with `edition.timezone` (`[editionSlug]/page.tsx:37-49`, `:77-80`), but `/results` search+directory (`results/page.tsx:112-118`) and `/rankings` (`rankings/page.tsx:62-65`) format without a timezone — on UTC servers an evening `startsAt` renders as the next day. Pass `edition.timezone` (or `DEFAULT_TIMEZONE`).

### RES-24 — Unbounded/arbitrarily-capped scans on public read paths

- **Confidence:** CONFIRMED · **Severity:** Low at launch scale, silent at growth.
- `listActiveOfficialVersionPointers()` loads **every** official/corrected version repo-wide with no limit on each search/directory cache miss (`queries.ts:562-591`). `listRankingSourceVersionCandidates(limit = 1000)` silently drops versions beyond 1000, ordered by `editionId` (UUID — effectively arbitrary) (`rankings.ts:359-386`) — at ~1000 lifetime versions, national rankings silently exclude races. The sitemap runs one `getPublicOfficialResultsPageData` per published event (`app/sitemap.ts:117-158`). Fine now; all three need pagination/aggregation before scale.

### RES-25 — Correction/queue polish items

- **Confidence:** CONFIRMED · **Severity:** Low.
- Duplicate correction requests: nothing dedupes an open `pending` request per (entry, requester) — a user can file unlimited identical requests (`corrections.ts:215-226`).
- Correction metrics count published and unpublished `approved` together (`queries.ts:1645-1650`); the publication marker lives only in `requestContext`, so "approved but never published" is invisible in the dashboard stats.
- Review queue shows requester as a raw UUID (`correction-review-queue.tsx:168`).
- `resultVersions.deletedAt`/`resultEntries.deletedAt` and claim soft-deletes exist in schema but have zero writers — the deletedAt-blind unique indexes on `result_entries` (RES-15) can't currently bite via soft-delete, but will if soft-delete is ever wired without revisiting them.
- Ruleset lifecycle: `retired` status has no writer, `publishRankingRuleset` defaults to immediately-`active`, and the activation-window overlap check is application-level only (`rulesets.ts:95-174`).

---

## Verified clean (checked, no defect — don't re-chase)

These were investigated as bug candidates during this review and found sound:

1. **Cross-org access to dashboard results pages** — the event layout enforces `canUserAccessSeries` per event (`app/[locale]/(protected)/dashboard/events/[eventId]/layout.tsx:44-48`) before rendering nested results pages, and every write action independently re-checks `assertCanWriteResultsForEdition` (`lib/events/results/actions.ts:220-235`). Reads and writes are both scoped.
2. **Correction publication atomicity** — version insert + entry copies + placement derivation + `draft → corrected` flip (with a status CAS in the WHERE) + request marker + audit all commit in one transaction (`corrections.ts:470-642`); double-publish is blocked by the `requestContext.publication` marker check plus the CAS; a concurrent version-number collision surfaces as a retryable `CONFLICT`, and the error message correctly says the request remains approved for retry.
3. **Public read paths never leak drafts or superseded versions** — the edition page, directory, and search all resolve the active pointer (max `versionNumber` with status `official|corrected`) and filter entries to those version ids (`queries.ts:472-487`, `:562-591`, `:688-694`). Drafts are invisible publicly; superseded entries are excluded from search.
4. **SEO/indexability behaves as designed** — robots noindex for anything not official+published (`public-official-results-indexability.ts`), the sitemap re-checks indexability per edition (`app/sitemap.ts:123`), metadata contains no athlete PII (title/description from message templates only), and the results URL is stable across `official → corrected` (asserted in `__tests__/app/public-official-results-metadata.server.test.ts`).
5. **Identity policy on results pages** — `/results` search and the edition page both resolve display through `resolvePublicResultIdentityDisplay` (env-configurable mode); the gap is only the rankings page (RES-18).
6. **Link/claim race handling** — `linkDraftResultEntryToUser` uses a CAS UPDATE (`or(isNull(userId), eq(userId, target))`) with a conflict re-read (`actions.ts:576-604`); concurrent claim inserts are serialized by the one-claim-per-entry unique index with a careful conflict re-read path (`claims.ts:544-621`). The *policy* concerns are RES-5/RES-6; the mechanics are sound.
7. **Official immutability** — entry upserts and link mutations are refused on non-draft versions (`actions.ts:348-354`, `:518-524`); corrections are the only mutation path for published data, matching the public copy.
8. **Finalization gate honesty** — the publish action recomputes the gate server-side over *all* rows (`actions.ts:93-130`), so the 30-row workspace preview (`workspace.ts` review summary) can under-display issues but can never over-approve; empty drafts are blocked.
9. **Version-number allocation race** — concurrent draft creation converges via the `(editionId, versionNumber)` unique index plus a bounded retry loop (`actions/ingestion.ts:93-133`, same pattern inside the correction-publication transaction).
10. **Unknown gender values can't crash the rankings page** — rendering guards with a known-key map and falls back to the raw value (`rankings/page.tsx:34-39`, `:267`); the residual issue is unlocalized labels, not a missing-message crash.
11. **es/en message parity for results/rankings namespaces** — both locfiles mirror each other key-for-key (spot-checked broadly; `pnpm validate:locales` gates it in CI). The parity gap is only the hardcoded domain strings (RES-21).
12. **`use cache` discipline on results queries** — cached scopes take no dynamic APIs, tag correctly, and use bounded `expire`; `revalidateResultsPublicationArtifacts` fires after both finalization and correction publication, so the official edition page updates immediately after a correction (staleness on search/directory is only the bounded RES-22 window).
13. **Time parser bounds** — `parseResultFinishTimeToMillis` rejects minutes/seconds ≥ 60 and non-positive values; DB check constraints enforce positive times and non-negative ages (`db/schema.ts:1082-1086`).

---

Findings reflect commit `ed88567` (2026-07-10). Re-verify line numbers before acting; the grep appendix in `docs/results/launch-readiness.md` covers the reachability claims these findings build on.
