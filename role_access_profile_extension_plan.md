## 1. Current State Summary

- **Roles & internal detection**
  - Roles are stored in relational tables for `roles` and `userRoles`; users may have multiple roles.
  - A small auth roles helper loads role names for a user and computes an `isInternal` boolean from a hardcoded list that currently only treats `"admin"` as internal.
  - The resolved `roles` array and `isInternal` flag are projected into the Better Auth session via the custom session plugin and exposed to the app through auth context helpers.

- **Routing and access control**
  - The authenticated experience is grouped under a single protected route shell that:
    - Uses a server-side auth context helper to ensure a valid session exists.
    - Redirects unauthenticated users to the localized sign-in page using the existing i18n routing utilities.
  - All authenticated users (internal and external) currently share the same protected layout and navigation (`/dashboard`, `/settings`, `/profile`), with no separation between internal/admin and regular users.
  - Server-side guards exist for “authenticated” and “profile complete” checks, but there are no role-specific guards (e.g., admin-only, staff-only) and no dedicated admin route group.

- **Profile model and enforcement**
  - The profile domain uses a profile repository, schema, and status helper.
  - Profile completeness is computed by a backend `computeProfileStatus` function that:
    - Receives the profile row (if any) and an optional `isInternal` flag.
    - Applies a single global set of required fields for all non-internal users.
    - Returns a `ProfileStatus` object `{ hasProfile, isComplete, mustCompleteProfile }`, where `mustCompleteProfile` is disabled for internal users.
  - The auth/user-context helper resolves the current user’s profile, roles, and `isInternal`, computes `profileStatus`, and exports them as the canonical backend view of “who is this user?”.
  - The Better Auth custom session plugin adds `isInternal` and `profileStatus` to the session payload so both server and client can consume them.

- **Profile enforcement in the frontend**
  - The shared protected layout wraps its content in a client-side boundary that:
    - Reads `useSession().data?.user` to obtain `profileStatus` and `isInternal`.
    - Shows a captive modal whenever `!isInternal && profileStatus.mustCompleteProfile` is `true`.
    - Uses server actions to read and upsert the profile, then refreshes the session to propagate updated `profileStatus`.
  - The profile modal’s form is built from a local form state; it currently treats shirt size as a free-text input and initializes values by fetching the profile when the modal opens.
  - While the profile is being fetched, the modal shows a loading message using the `"Loading your information..."` translation string, which can cause visible layout shifts as the content changes from a loading message to a full form.

- **Role usage in business logic**
  - Role information is loaded and projected into the session but is not yet used to:
    - Differentiate required profile fields for different external roles.
    - Drive different dashboards, route access, or permissions for admins/staff vs organizers/athletes/volunteers.
  - Internal users are currently “special” only in that profile enforcement is bypassed when `isInternal` is `true`; there is no dedicated admin area or redirection for internal accounts.

---

## 2. Architectural Goals & Principles

- **Backend-authored roles and requirements**
  - All role classification, profile requirements, and permission rules must live on the backend in a small, explicit domain model, not in scattered frontend conditionals.
  - The frontend should only consume a normalized, role-aware auth context and capability set (e.g., flags and role labels), never recomputing completeness rules or internal-vs-external status.

- **Single source of truth for “isInternal” and required fields**
  - Continue treating the auth/user-context helper and profile status computation as the canonical source of truth for:
    - `roles` and `isInternal`.
    - Role-aware profile completeness and enforcement flags.
  - Replace the hardcoded internal-role array with a structured, testable role definition model that can be extended safely.

- **Extensible, role-aware profile enforcement**
  - Extend `computeProfileStatus` to support different mandatory field sets per role (and combinations of roles) without duplicating logic across the app.
  - Keep the shape of `ProfileStatus` small and stable so downstream consumers are insulated from future changes to the rules.

- **Clear separation of internal vs external flows**
  - Introduce distinct access boundaries for internal users vs external users:
    - Internal users (admin and staff) are routed into an admin area and barred from regular protected routes.
    - External users (organizer, athlete, volunteer) remain in the regular protected shell with role-aware dashboards and profile requirements.

- **Incremental, non-breaking evolution**
  - Roll out new roles, profile requirements, and admin routing in stages.
  - Provide safe defaults and fallbacks for users with missing or misconfigured roles so the app continues to behave reasonably while instrumentation surfaces issues.

---

## 3. Backend Architecture

### 3.1 Role model and classification

- **Canonical role identifiers**
  - Introduce a small, explicit role model that standardizes role identifiers:
    - `internal.admin`
    - `internal.staff`
    - `external.organizer`
    - `external.athlete`
    - `external.volunteer`
  - Treat database role `name` values as opaque strings that are mapped into these canonical identifiers via a backend role definition registry.
  - Allow users to hold multiple canonical roles; the effective permission set is derived as the union of all role definitions with a deterministic precedence (internal roles dominate external).

- **Role definition registry**
  - Define a backend role registry structure (conceptually `Record<RoleName, RoleDefinition>`) that holds:
    - A `category` (`internal` vs `external`).
    - A `kind` (admin, staff, organizer, athlete, volunteer).
    - A `default` flag for external users who have no explicit role mapping (e.g., a “fallback external” concept).
    - A list of **profile requirement categories** (not specific fields) that this role implies (e.g., “basic contact”, “emergency contact”, “physical attributes”, “event management”).
    - A set of **permissions** (e.g., `canAccessAdminArea`, `canAccessUserArea`, `canViewOrganizersDashboard`, `canManageEvents`, `canManageUsers`, `canViewAthleteDashboard`).
  - Keep this registry as the **single backend source of truth** for:
    - Internal vs external determination.
    - Admin vs staff vs organizer/athlete/volunteer semantics.
    - Which conceptual profile data categories are required per role.

- **Role resolution and `isInternal`**
  - Extend the role lookup helper to:
    - Load the user’s raw role names from the database.
    - Map each raw name to a canonical role identifier using the registry (ignoring unknown names).
    - Derive:
      - `canonicalRoles`: an array of canonical identifiers.
      - `isInternal`: `true` if any canonical role has `category: 'internal'`.
      - A `permissions` object merged from all matched role definitions.
      - A `profileRequirementCategories` set merged from all matched role definitions.
  - For users with no mapped roles:
    - Apply a registry-defined default external role (e.g., a “general external user” classification) so they remain treated as external and can access regular routes.
    - Mark `isInternal` as `false` and compute profile requirements from this default role’s configuration.
  - For users whose roles are misconfigured (e.g., database names that do not map to any canonical identifier):
    - Treat them as the same as “no mapped roles”: external default role, `isInternal: false`.
    - Log structured warnings and surface metrics so misconfigurations can be detected and addressed.

### 3.2 Self-signup external role assignment

- **When role assignment happens**
  - For **self-signup users** (sign-ups originating from the public auth flow), role assignment should occur as early as possible in the lifecycle:
    - Initial account creation via Better Auth remains unchanged (no role assumptions).
    - On first authenticated entry into the protected shell, the backend examines the user’s roles:
      - If no canonical external role is assigned, it marks the user as “needsRoleAssignment” in the auth context.
    - A dedicated backend action is responsible for assigning one or more external roles when the user selects them in the UI.
  - Internal users are **not** assigned roles via self-service flows:
    - Admins and staff are assigned via out-of-band mechanisms (e.g., direct database updates or an internal admin tool).
    - The role registry treats these roles as `internal`, and they are never exposed as options in self-signup flows.

- **How role assignment state is exposed**
  - Extend the resolved user context to include:
    - `canonicalRoles`: canonical identifiers as described above.
    - `permissions`: derived from the role registry.
    - `needsRoleAssignment`: boolean flag derived from the absence of any external role and the fact that the user is not internal.
  - Project `canonicalRoles`, `permissions`, and `needsRoleAssignment` into the session (similar to `profileStatus`), so:
    - Server components can gate routes based on role and permission flags.
    - Client-side enforcement boundaries can decide whether to show a role-selection captive step before profile enforcement.

- **Relationship to profile enforcement**
  - Role assignment sits **before** profile enforcement in the onboarding pipeline:
    - External users must first declare at least one external role (organizer, athlete, volunteer).
    - Once roles are assigned, subsequent `profileStatus` computations for those users use the role-aware requirement model.
  - This preserves a clear conceptual ordering:
    - “Who are you?” (role selection) → “What information do we need from you?” (role-aware profile completion).

### 3.3 Role-aware profile requirements and status computation

- **Requirement categories and field mapping**
  - Introduce an intermediate **profile requirement model** that:
    - Maps each canonical role to one or more high-level requirement categories (e.g., “basic contact”, “emergency contact”, “demographics”, “physical attributes”, “event-operations profile”).
    - Maps each requirement category to a concrete set of profile fields.
  - This two-level design decouples:
    - Role definitions from concrete fields (roles only talk in terms of categories).
    - Profile enforcement from role naming (categories can be reused across multiple roles).
  - The actual field-to-category mapping remains centralized in the profile domain and is the only place that knows, for example, which fields fall under “basic contact” vs “emergency contact”.

- **Extending `computeProfileStatus`**
  - Extend `computeProfileStatus` so it receives:
    - The profile record (if any).
    - The `isInternal` flag.
    - The set of `profileRequirementCategories` for the current user, as computed from roles.
  - Inside the profile status computation:
    - If `isInternal` is `true`, continue bypassing enforcement (`mustCompleteProfile: false`).
    - Otherwise:
      - Expand `profileRequirementCategories` into the union of actual required fields via the centralized mapping.
      - Compute `isComplete` based on the presence of all required fields in the profile.
      - Derive `mustCompleteProfile` from `isInternal` and `isComplete`.
  - For backward compatibility:
    - If no requirement categories are provided (e.g., older callers or as a migration step), fall back to the existing global required field set.
    - This allows staged rollout of role-aware requirements without breaking existing code paths.

- **Exposing requirement hints**
  - Optionally extend the resolved auth context with a **profile requirement summary**:
    - `requiredCategories`: the set of requirement category identifiers applicable to this user.
    - `requiredFieldKeys`: a derived set of field identifiers useful for building front-end hints or labeling.
  - The frontend is encouraged to rely on requirement categories for UI hints rather than re-implementing field-level logic; however, the core enforcement remains strictly backend-driven via `ProfileStatus`.

### 3.4 Shirt size canonical options

- **Canonical source of shirt sizes**
  - Define a small, backend-owned **shirt size enumeration** as part of the profile domain’s metadata, representing the only allowed shirt size values.
  - This enumeration should be used by:
    - The profile schema/validation layer (to constrain acceptable values).
    - Any backend code that performs profile validation or normalization involving shirt size.
  - The enumeration contains only internal identifiers; display labels remain in the translation messages.

- **Backend exposure of options**
  - Expose shirt size options to the frontend via a lightweight, backend-originated structure (e.g., a `ProfileMetadata` payload delivered through:
    - The resolved auth context, or
    - A simple server-side metadata helper that can be called from server components.
  - This structure should include:
    - The list of allowed shirt size identifiers.
    - Optional metadata needed by the UI (e.g., ordering or grouping), without any locale-specific text.

- **Frontend consumption without duplication**
  - The frontend avoids defining its own shirt size lists:
    - Forms and modals that need shirt size options consume them from the backend-provided metadata.
    - Localized labels are resolved via the messages layer keyed by the canonical identifiers.
  - The existing profile modal continues to own the shirt size field, but now renders it as a select-like control using the canonical options from the shared metadata instead of a free-text input.

### 3.5 Hardened internal-user detection and source of truth

- **Single, robust internal detection path**
  - The role lookup helper becomes the single backend path that determines `isInternal`:
    - It uses the role registry to classify roles as internal or external.
    - It handles missing or unknown roles by safely defaulting to external behavior.
  - `isInternal` is computed once in this helper, then:
    - Propagated to the resolved auth context.
    - Projected into the session payload via the custom session plugin.
    - Reused consistently in profile status computation, guards, and routing decisions.

- **Fallback and migration strategies**
  - For existing deployments where only a simple `"admin"` role exists:
    - The registry maps the existing `"admin"` role name to the `internal.admin` canonical role.
    - No behavior change occurs initially, except that the classification is now expressed via the registry.
  - For environments missing expected internal roles:
    - The helper logs structured events indicating that a user is marked as internal in configuration but no corresponding database role exists.
    - The system safely treats such users as external until the database configuration is corrected.

- **Safe handling of misconfigured roles**
  - Unknown role names are ignored during mapping, with:
    - A telemetry path for operators (logging or metrics).
    - A clear guarantee that unknown roles will not accidentally grant internal privileges.
  - Only canonical roles explicitly marked as `internal` in the registry can yield `isInternal: true`.

### 3.6 Admin/staff permissions and routing constraints

- **Permission model derived from roles**
  - From the role registry, derive a small permission surface, for example:
    - `canAccessAdminArea`
    - `canAccessUserArea`
    - `canManageUsers`
    - `canManageEvents`
    - `canViewStaffTools`
  - `internal.admin` and `internal.staff` both have `canAccessAdminArea: true`, but differ in more granular permissions (e.g., staff may lack `canManageUsers`).
  - External roles (organizer, athlete, volunteer) have `canAccessUserArea: true` and no admin-area permissions.

- **Server-side guards**
  - Extend the existing guard set with role-aware helpers, for example:
    - `requireAdminUser()`:
      - Calls `requireAuthenticatedUser()`.
      - Checks `permissions.canAccessAdminArea` and a stricter admin-specific flag.
      - Throws or redirects if the user is not authorized.
    - `requireStaffUser()`:
      - Similar pattern, but tailored to staff-level permissions.
  - These guards are intended for:
    - Admin-facing server actions and backend workflows.
    - Future admin pages and APIs that should not be callable by external users.

- **Route-level separation for internal users**
  - The protected route layout is conceptually split into:
    - A **user-protected** area, where `canAccessUserArea` is required and internal users are redirected away.
    - An **admin-protected** area, where `canAccessAdminArea` is required and external users are redirected away.
  - For internal users:
    - Attempting to access user-protected routes results in a server-side redirect to the admin landing route.
    - The default admin landing route uses the `permissions` object to select the appropriate dashboard (admin vs staff).

---

## 4. Frontend Architecture

### 4.1 Role-aware enforcement boundary in the app shell

- **Layered enforcement boundaries**
  - Introduce a conceptual layering inside the protected shell:
    - A **RoleEnforcementBoundary** responsible for:
      - Reading `useSession().data` to obtain `isInternal`, `canonicalRoles`, `permissions`, and `needsRoleAssignment`.
      - Redirecting internal users away from user-protected routes based on `permissions`.
      - Triggering an external role-assignment captive step when `needsRoleAssignment` is `true`.
    - The existing **ProfileEnforcementBoundary** remains responsible for:
      - Reading `profileStatus` and `isInternal`.
      - Triggering the profile completion modal when `!isInternal && profileStatus.mustCompleteProfile`.
  - The protected layout composes these boundaries so that:
    - Role assignment enforcement runs first.
    - Profile enforcement runs next, only for users whose role state is already resolved.

- **Consistency with current patterns**
  - The app continues to:
    - Use a server-side protected layout to ensure an authenticated session exists before rendering the shell.
    - Use client-side hooks (`useSession`) and modals for enforcement rather than full-page blocking routes.
  - The new role-aware boundary strictly consumes session-projected data; it does not talk to the database directly.

### 4.2 Captive modal upgrades and shirt size select

- **Shirt size select driven by backend metadata**
  - The profile modal continues as the user-facing enforcement surface but:
    - It renders shirt size as a select-style control backed by the backend-provided shirt size enumeration.
    - It receives the list of allowed identifiers from a shared profile metadata structure, not from hardcoded frontend arrays.
  - Localized labels are resolved via the existing messages for profile fields, keyed by the canonical shirt size identifiers.

- **Reducing layout shift during profile hydration**
  - To avoid layout shift caused by the `"Loading your information..."` message:
    - The modal is opened with a stable layout that does not change structure between loading and loaded states.
    - Initial profile data is sourced from the same backend context that already computes `profileStatus` (e.g., a lightweight profile snapshot included with the auth context) whenever possible.
    - Any additional client-side fetches for profile details occur behind a Suspense boundary or skeleton that preserves the form’s layout dimensions.
  - The loading message becomes an overlay or subtle indicator within a fixed container, avoiding large structural changes that would move content around when the profile is hydrated.

### 4.3 Admin/staff dashboards and navigation

- **Admin area layout**
  - Introduce a dedicated admin layout that:
    - Uses server-side checks on `permissions.canAccessAdminArea` to guard access.
    - Provides an admin-specific navigation structure (reusing existing navigation primitives but with admin-oriented items).
    - Selects between admin-level and staff-level default landing views based on the permission set.
  - Internal users land in this admin area by default after authentication, and any visit to user-protected routes redirects them back here.

- **User vs admin navigation sources**
  - The navigation configuration is split conceptually into:
    - A user navigation set used in the existing protected shell for external roles.
    - An admin navigation set used in the admin layout for internal roles.
  - The components that render navigation read role/permission flags (from session) and choose the correct nav set, rather than branching deep inside JSX.

### 4.4 Role-aware routing boundaries

- **User-protected vs admin-protected route groups**
  - The app’s route structure is logically partitioned into:
    - A user-protected group (dashboard, settings, profile, etc.) guarded by:
      - An authenticated session.
      - `permissions.canAccessUserArea: true`.
      - A check that `isInternal` is `false`; internal users are redirected away.
    - An admin-protected group (admin dashboards, staff tools) guarded by:
      - An authenticated session.
      - `permissions.canAccessAdminArea: true`.
  - Both groups rely on the same backend-projected session data, avoiding duplicate logic for role resolution.

- **Front-end guards aligned with backend permissions**
  - Client-side components that need to hide or show content based on role (e.g., “Admin tools” menu items, organizer-specific views) read from:
    - The canonical role identifiers.
    - The `permissions` object.
  - They do not attempt to interpret raw database role names or reconstruct the internal/external distinction; these concerns remain strictly backend-owned.

---

## 5. Data & State Flow

- **From registration to session**
  - A user signs up through the existing auth flow and is redirected into the application.
  - On each authenticated request:
    - The auth/user-context helper resolves the session user, loads their roles from the database, maps them into canonical roles, computes `isInternal`, `permissions`, profile requirement categories, and the current `profileStatus`.
    - This resolved context is projected into the Better Auth session via the custom session plugin.

- **Server-side consumption**
  - The server-side auth context helper reads the session:
    - If role and profile projections are present, it uses them directly.
    - If projections are missing or stale, it recomputes them using the role and profile domain helpers.
  - Protected route layouts and server actions call into this auth context to:
    - Enforce basic authentication.
    - Apply role-based guards (admin/staff vs external).
    - Use `profileStatus` for backend-level enforcement where necessary.

- **Client-side consumption and enforcement**
  - On the client, `useSession` returns session data including:
    - `user` with `isInternal`, `profileStatus`, canonical roles, and permission flags.
    - Top-level flags like `isInternal` and optional auxiliary session fields as needed.
  - The role-aware boundary:
    - Redirects internal users to the admin area and ensures they do not remain in user-protected shells.
    - Presents a role-assignment captive flow for external users flagged as `needsRoleAssignment`.
  - The profile enforcement boundary:
    - Uses `profileStatus` (which already incorporates role-aware required fields) to open the profile completion modal.
    - Uses backend-provided profile snapshots and metadata (including shirt size options) to render a stable UI with minimal layout shift.

- **Admin/staff redirection**
  - When an internal user hits any user-protected route:
    - The server-side layout reads `isInternal`/`permissions` and returns a redirect to the admin landing route.
  - When an external user hits an admin route:
    - The admin layout checks `permissions.canAccessAdminArea` and either:
      - Returns a redirect to the main dashboard, or
      - Surfaces a “not authorized” experience, depending on product decisions.

---

## 6. Integration & Migration Strategy

- **Phase 1: Role registry and internal detection**
  - Introduce the role registry and mapping from database role names to canonical identifiers.
  - Update the role lookup helper to:
    - Use the registry for classification.
    - Derive `isInternal` and `permissions` from canonical roles.
  - Ensure that current deployments where only `"admin"` exists continue to behave the same (admin → `internal.admin` → `isInternal: true`).

- **Phase 2: Session projection and auth context enrichment**
  - Extend the resolved user context and session projection to include:
    - `canonicalRoles`.
    - `permissions`.
    - `profileRequirementCategories`.
    - `needsRoleAssignment`.
  - Update the server-side auth context helper to:
    - Prefer projected values when present.
    - Recompute them using the registry and profile domain on cache misses or during session refresh.

- **Phase 3: Role-aware profile requirements**
  - Introduce the profile requirement model:
    - Category-to-field mapping in the profile domain.
    - Role-to-category mapping in the role registry.
  - Extend `computeProfileStatus` and its call sites to accept requirement categories and use them to compute `isComplete`.
  - During migration:
    - When requirement categories are not available, fall back to the existing global required fields to avoid breaking behavior.

- **Phase 4: Shirt size enumeration and metadata**
  - Define the canonical shirt size enumeration in the profile domain and wire it into:
    - Backend validation and normalization logic.
    - A profile metadata helper or auth context extension that exposes allowed shirt sizes to the frontend.
  - Update the profile modal to consume this metadata for its shirt size control, ensuring no hardcoded lists remain in client components.

- **Phase 5: Admin/user route separation**
  - Introduce the logical admin-protected and user-protected route groups with:
    - Server-side redirects based on `permissions` and `isInternal`.
    - Skeleton admin landing and staff views that can be expanded later.
  - Update navigation and session-aware UI components to:
    - Use the permission flags to decide which dashboards and menus to show.
    - Avoid exposing user-protected nav items to internal users and vice versa.

- **Phase 6: Self-signup role assignment flow**
  - Implement the self-signup role assignment flow:
    - Add backend actions for assigning/removing external roles based on user selection.
    - Wire the role-aware boundary to show a captive role-selection experience when `needsRoleAssignment` is `true`.
  - Roll this out gradually:
    - Existing users without roles can be treated as belonging to a default external role to avoid blocking them.
    - New self-signup users can be incrementally required to select a role before proceeding to profile completion.

- **Phase 7: Monitoring and hardening**
  - Add logging/metrics around:
    - Users with no mapped roles.
    - Unknown database role names.
    - Attempts by internal users to access user-protected routes and vice versa.
  - Once stability is confirmed:
    - Tighten behavior for misconfigured roles if desired (e.g., deny access to certain areas instead of falling back to default external behavior).

---

## 7. Constraints for the Implementer

- **Backend as the authority**
  - Do not re-implement role classification, internal-vs-external detection, or required profile fields on the frontend.
  - All such logic must flow from the role registry, profile requirement model, and `computeProfileStatus` via the resolved auth context and session.

- **No duplication of shirt size options**
  - Shirt size options must be defined once in the backend profile metadata and consumed everywhere else from that source.
  - Frontend components may only reference shirt size identifiers and labels from translations; they must never define their own lists.

- **Respect existing entrypoints**
  - Reuse the existing auth context helper, guards, and profile domain as the main extension points:
    - Extend `computeProfileStatus` rather than replacing it.
    - Extend the auth/user-context helper and session projection rather than adding parallel session derivations.

- **Separation of concerns for routing**
  - Keep the distinction between:
    - Server-side route/layout guards (authoritative access control).
    - Client-side boundaries and modals (UX-level enforcement and guidance).
  - Do not introduce client-only protections for routes that should be enforced on the server.

- **Incremental, test-driven changes**
  - Evolve the role registry, profile requirement model, and guards in small steps, with unit tests that:
    - Assert correct classification of internal vs external roles.
    - Verify profile status computation for key role combinations.
    - Validate routing behavior for admin/staff vs external roles.
  - Maintain backward compatibility while feature-flagging or staging new behaviors where appropriate.

- **Role scope and ownership**
  - Internal roles (`internal.admin`, `internal.staff`) must not be assignable through public or self-service flows.
  - External roles (organizer, athlete, volunteer) must be assignable only in the explicitly defined role-assignment workflow for self-signup users.

