# Auth & Roles – Agent Guide

Usage for AI agents: read this once for mental model; when implementing features, rely on the helpers and guards listed here instead of re-deriving roles or permissions.

---

## 1. Role Model Overview

- **Canonical roles (backend truth)**
  - `CanonicalRole` values:
    - `internal.admin`
    - `internal.staff`
    - `external.organizer`
    - `external.athlete`
    - `external.volunteer`
  - Stored DB roles live in `roles`/`user_roles` (`db/schema.ts`) and have string `name`s (e.g. `admin`, `staff`, `organizer`, `athlete`, `volunteer`, `user`).
  - `lib/auth/roles.ts` maps raw DB names → canonical roles using `ROLE_REGISTRY.sourceNames`.

- **Internal vs external**
  - Canonical roles are tagged with:
    - `category: 'internal' | 'external'`
    - `kind: 'admin' | 'staff' | 'organizer' | 'athlete' | 'volunteer'`
  - Internal roles (`internal.*`) imply `isInternal: true` and **do not** require profile completion.
  - External roles (`external.*`) imply `isInternal: false` and are subject to profile enforcement based on their requirement categories.

- **Defaults and unknown roles**
  - If a user has mapped canonical roles:
    - All mapped roles are kept (multi-role supported).
  - If no canonical role maps:
    - User is treated as external with the **default** canonical role (`external.athlete` today).
    - `needsRoleAssignment: true` so the role-selection modal runs.
  - Unknown DB role names:
    - Are ignored and logged via `console.warn('[roles] Unknown role names ignored', …)`.
    - Never grant internal privileges.

- **Requirement categories & permissions**
  - Each canonical role declares:
    - `profileRequirementCategories: ProfileRequirementCategory[]` (e.g. `basicContact`, `emergencyContact`, `demographics`, `physicalAttributes`).
    - `permissions: PermissionSet` (e.g. `canAccessAdminArea`, `canAccessUserArea`, `canManageUsers`, `canManageEvents`, `canViewStaffTools`, `canViewOrganizersDashboard`, `canViewAthleteDashboard`).
  - Users with multiple roles get the **union** of permissions and requirement categories.

---

## 2. Core Backend APIs

All of these are already wired into the auth pipeline; prefer them over manual queries.

- **Auth context (primary entrypoint) – `lib/auth/server.ts`**
  - `getAuthContext(): Promise<AuthContext>` returns:
    - `session`, `user` (Better Auth session & user)
    - `canonicalRoles: CanonicalRole[]`
    - `roles: string[]` (raw DB names)
    - `isInternal: boolean`
    - `permissions: PermissionSet`
    - `needsRoleAssignment: boolean`
    - `profile` (current profile row or `null`)
    - `profileStatus: ProfileStatus`
    - `profileRequirements: ProfileRequirementSummary`
    - `profileMetadata: ProfileMetadata` (includes `shirtSizes`, required categories/fields)
    - `availableExternalRoles: CanonicalRole[]`
  - Use this in server components / route handlers when you need read-only access to user + roles + profile.

- **Role resolution – `lib/auth/roles.ts`**
  - `getUserRolesWithInternalFlag(userId: string): Promise<RoleLookupResult>`:
    - Loads current DB roles for the user.
    - Returns:
      - `roles: string[]` (raw names)
      - `canonicalRoles: CanonicalRole[]`
      - `isInternal: boolean`
      - `permissions: PermissionSet`
      - `profileRequirementCategories: ProfileRequirementCategory[]`
      - `needsRoleAssignment: boolean`
      - `unmappedRoles: string[]` (ignored, logged)
  - `getSelectableExternalRoles(): CanonicalRole[]`:
    - Returns canonical external roles usable in self-service role selection.
  - `updateUserExternalRoles(userId: string, canonicalRoles: CanonicalRole[])`:
    - Filters to external canonical roles only.
    - Ensures underlying `roles` rows exist (auto-creates as needed using `sourceNames`).
    - Replaces existing **external** roles for that user in `user_roles` with the desired set.
    - Leaves internal roles untouched.
  - `getRoleDefinition(role: CanonicalRole)`:
    - Returns full `RoleDefinition` from the registry (useful for introspection in backend-only utilities).
  - `getDefaultExternalRole()`:
    - Returns the canonical default external role (currently `external.volunteer`).

- **Profile requirements & metadata – `lib/profiles`**
  - `PROFILE_REQUIREMENT_CATEGORIES`, `buildProfileRequirementSummary(categories)`:
    - Maps high-level requirement categories → concrete `ProfileRecord` fields.
  - `computeProfileStatus({ profile, isInternal, requirementCategories, requiredFieldKeys })`:
    - Computes `{ hasProfile, isComplete, mustCompleteProfile }` using:
      - Role-derived categories when available.
      - Falling back to a baseline field list otherwise.
  - `buildProfileMetadata(summary)` & `SHIRT_SIZES`:
    - Produces `ProfileMetadata` including:
      - `shirtSizes: readonly ShirtSize[]` (canonical shirt size values).
      - `requiredCategories` and `requiredFieldKeys`.
    - `SHIRT_SIZES` is the single backend source of truth for the shirt size enumeration.

- **External role assignment action – `app/actions/roles.ts`**
  - `assignExternalRoles(input): Promise<RoleAssignmentSuccess | RoleAssignmentError>`:
    - Uses `requireAuthenticatedUser()`; returns `UNAUTHENTICATED` if no session.
    - Rejects internal users with `FORBIDDEN`.
    - Validates payload against a Zod schema based on `getSelectableExternalRoles()`; requires at least one role.
    - Calls `updateUserExternalRoles(user.id, parsedRoles)`.
    - Recomputes the user context via `resolveUserContext(user)` and refreshes the Better Auth session (`disableCookieCache: true`).
    - Returns updated:
      - `canonicalRoles`
      - `permissions`
      - `needsRoleAssignment`
      - `profileStatus`
      - `profileRequirements`
      - `profileMetadata`

---

## 3. Guards & Access Rules

Use guards from `lib/auth/guards.ts` in server actions and backend-only code. Do **not** hand-roll permission checks unless absolutely necessary.

- **Base guard**
  - `requireAuthenticatedUser(): Promise<AuthenticatedContext>`:
    - Ensures user + session exist, otherwise throws `UnauthenticatedError`.
    - Returns `AuthContext` plus non-null `user` and `session`.

- **Profile enforcement (external user area)**
  - `requireProfileCompleteUser(): Promise<AuthenticatedContext>`:
    - Calls `requireAuthenticatedUser()`.
    - If `context.isInternal` **or** `!context.permissions.canAccessUserArea`, returns context **without** profile enforcement.
    - Otherwise, if `context.profileStatus.mustCompleteProfile` is true, throws `ProfileIncompleteError` (carries `profileStatus`).
    - Use for “real app” actions that require an external user with a complete profile (e.g., race registration, ticketing).

- **Admin / staff**
  - `requireAdminUser(): Promise<AuthenticatedContext>`:
    - Requires `context.permissions.canAccessAdminArea && context.permissions.canManageUsers`.
    - Throws `ForbiddenError('Admin access required')` on failure.
    - Use for privileged admin tools (user management, high-risk configuration).
  - `requireStaffUser(): Promise<AuthenticatedContext>`:
    - Requires `context.permissions.canAccessAdminArea && context.permissions.canViewStaffTools`.
    - Throws `ForbiddenError('Staff access required')` on failure.
    - Use for staff tools that should not grant full admin power.

- **Error types**
  - `UnauthenticatedError` (`code: 'UNAUTHENTICATED'`): user not logged in.
  - `ForbiddenError` (`code: 'FORBIDDEN'`): logged-in but wrong permissions.
  - `ProfileIncompleteError` (`code: 'PROFILE_INCOMPLETE'`): external user must complete profile before proceeding.

**Rule of thumb**
- External feature requiring a complete profile → `requireProfileCompleteUser()`.
- Admin-only feature → `requireAdminUser()`.
- Staff-only (non-admin) feature → `requireStaffUser()`.
- Neutral feature that should work for any logged-in user (including internal or incomplete) → `requireAuthenticatedUser()` only.

---

## 4. Frontend Session & Boundaries

- **Session shape (client) – `lib/auth/client.ts` + Better Auth**
  - `useSession()` returns `data` with:
    - `data.user` containing:
      - `isInternal`
      - `canonicalRoles: CanonicalRole[]`
      - `permissions: PermissionSet`
      - `needsRoleAssignment: boolean`
      - `profileStatus: ProfileStatus`
      - `profileRequirements: ProfileRequirementSummary`
      - `profileMetadata: ProfileMetadata`
      - `profile: ProfileRecord | null`
    - Top-level copies (`data.permissions`, `data.canonicalRoles`, etc.) used by some components.

- **Role enforcement boundary – `components/auth/role-enforcement-boundary.tsx`**
  - Wrapped around the entire protected shell (`ProtectedLayoutWrapper`):
    - Reads `isInternal`, `permissions`, `canonicalRoles`, `availableExternalRoles`, `needsRoleAssignment` from `useSession`.
  - Internal users:
    - If `isInternal` and `permissions.canAccessAdminArea` are true, enforces redirect to the localized `/admin` path whenever they are on non-admin protected routes.
  - External users:
    - If `needsRoleAssignment` is true, opens a captive “choose your role(s)” modal.
    - Uses `availableExternalRoles` and `assignExternalRoles` to update roles.
  - Agent rule: do **not** bypass this boundary; new protected experiences should live inside it so that internal redirect + role assignment always happen.

- **Profile enforcement boundary – `components/profile/profile-enforcement-boundary.tsx`**
  - Nested inside the role boundary:
    - Reads `profileStatus`, `profile`, `profileMetadata`, `isInternal`, `needsRoleAssignment` from `useSession`.
  - Enforcement:
    - If `!isInternal && !needsRoleAssignment && profileStatus.mustCompleteProfile` is true, opens the profile completion modal.
  - Shirt size & required fields:
    - Uses `profileMetadata.shirtSizes` as the only allowed shirt size values (rendered as a `<select>`).
    - Uses `profileMetadata.requiredFieldKeys` to decide which fields are required (via `isRequiredField` / `FieldLabel`).
  - Layout stability:
    - The modal reuses the profile snapshot from session when possible and updates it after successful `upsertProfileAction`.
    - Avoids showing a transient “loading your information…” layout that shifts the modal structure.

---

## 5. Creating & Attaching Roles

- **External roles (self-service)**
  - Canonical IDs for external roles:
    - `external.organizer`
    - `external.athlete`
    - `external.volunteer`
  - From the frontend:
    - Use `assignExternalRoles({ roles: CanonicalRole[] })` (only external canonical roles are allowed by the Zod schema).
    - The server:
      - Rejects internal users (`FORBIDDEN`).
      - Writes external roles via `updateUserExternalRoles`.
      - Recomputes `permissions`, `profileStatus`, `profileRequirements`, `profileMetadata`, `needsRoleAssignment`.
      - Refreshes the session so `useSession()` sees the new state.

- **External roles (backend tools/tests)**
  - Prefer `updateUserExternalRoles(userId, canonicalRoles)`:
    - Pass only external canonical roles.
    - It ensures DB `roles` rows exist and rewires `user_roles` for external roles.
  - After calling it directly, **also**:
    - Run `resolveUserContext(user)` to recompute derived state.
    - Trigger a session refresh if the change should be visible to the current request/session (see `assignExternalRoles` for the pattern).

- **Internal roles (admin, staff)**
  - Internal roles are **not** assigned via `assignExternalRoles` or self-service flows.
  - To grant internal privileges:
    - Ensure appropriate `roles` rows exist with names that map via `ROLE_REGISTRY.sourceNames` (e.g. `admin` → `internal.admin`, `staff` → `internal.staff`).
    - Attach those roles to users via `user_roles` using migrations, seeds, or dedicated admin tools.
  - `updateUserExternalRoles` intentionally ignores internal roles; it only replaces external role assignments.

---

## 6. Agent Rules of Thumb

- **Always use canonical roles & permissions**
  - Gate behavior using `permissions` or `isInternal`, not raw DB role names.
  - Use `canonicalRoles` for role-specific UI hints; use `permissions` for actual access control.

- **Respect the onboarding order**
  - Internal vs external classification and admin redirect → handled by `RoleEnforcementBoundary` and `permissions`.
  - External role selection (`needsRoleAssignment`) → `RoleEnforcementBoundary` + `assignExternalRoles`.
  - Role-aware profile completion → `ProfileEnforcementBoundary` + `requireProfileCompleteUser`.

- **Shirt size & required fields**
  - Do not hardcode shirt size options or required profile fields in new code.
  - Always derive:
    - Shirt sizes from `profileMetadata.shirtSizes` (backend-generated, canonical).
    - Required fields from `profileMetadata.requiredFieldKeys` or `profileRequirements`.

- **When adding new roles**
  - Update `ROLE_REGISTRY` in `lib/auth/roles.ts`:
    - Add a new `CanonicalRole` with `category`, `kind`, `sourceNames`, `profileRequirementCategories`, and `permissions`.
  - Ensure DB `roles` entries exist (or rely on auto-creation for new **external** roles if you also wire them through `updateUserExternalRoles`).
  - Add tests that assert:
    - Correct `permissions` and `isInternal`.
    - Correct `profileRequirementCategories` and resulting `profileStatus` for that role.

- **When guarding new backend tools**
  - Start by deciding the audience:
    - Internal admin → `requireAdminUser`.
    - Internal staff → `requireStaffUser`.
    - External, profile-complete users only → `requireProfileCompleteUser`.
    - Any signed-in user → `requireAuthenticatedUser`.
  - Handle `UnauthenticatedError`, `ForbiddenError`, and `ProfileIncompleteError` explicitly in server actions to produce structured error responses consumable by the frontend. ***!
