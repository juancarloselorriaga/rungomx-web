import { db } from '@/db';
import { roles, userRoles } from '@/db/schema';
import type { ProfileRequirementCategory } from '@/lib/profiles';
import { eq, inArray, and } from 'drizzle-orm';

export type CanonicalRole =
  | 'internal.admin'
  | 'internal.staff'
  | 'external.organizer'
  | 'external.athlete'
  | 'external.volunteer';

type RoleCategory = 'internal' | 'external';

type RoleKind = 'admin' | 'staff' | 'organizer' | 'athlete' | 'volunteer';

export type PermissionSet = {
  canAccessAdminArea: boolean;
  canAccessUserArea: boolean;
  canManageUsers: boolean;
  canManageEvents: boolean;
  canViewStaffTools: boolean;
  canViewOrganizersDashboard: boolean;
  canViewAthleteDashboard: boolean;
};

type RoleDefinition = {
  id: CanonicalRole;
  category: RoleCategory;
  kind: RoleKind;
  default?: boolean;
  sourceNames: string[];
  profileRequirementCategories: ProfileRequirementCategory[];
  permissions: PermissionSet;
};

const DEFAULT_PERMISSIONS: PermissionSet = {
  canAccessAdminArea: false,
  canAccessUserArea: false,
  canManageUsers: false,
  canManageEvents: false,
  canViewStaffTools: false,
  canViewOrganizersDashboard: false,
  canViewAthleteDashboard: false,
};

const ROLE_REGISTRY: Record<CanonicalRole, RoleDefinition> = {
  'internal.admin': {
    id: 'internal.admin',
    category: 'internal',
    kind: 'admin',
    sourceNames: ['admin'],
    profileRequirementCategories: [],
    permissions: {
      ...DEFAULT_PERMISSIONS,
      canAccessAdminArea: true,
      canManageUsers: true,
      canManageEvents: true,
      canViewStaffTools: true,
    },
  },
  'internal.staff': {
    id: 'internal.staff',
    category: 'internal',
    kind: 'staff',
    sourceNames: ['staff'],
    profileRequirementCategories: [],
    permissions: {
      ...DEFAULT_PERMISSIONS,
      canAccessAdminArea: true,
      canManageEvents: true,
      canViewStaffTools: true,
    },
  },
  'external.organizer': {
    id: 'external.organizer',
    category: 'external',
    kind: 'organizer',
    sourceNames: ['organizer'],
    profileRequirementCategories: ['basicContact', 'emergencyContact', 'demographics'],
    permissions: {
      ...DEFAULT_PERMISSIONS,
      canAccessUserArea: true,
      canManageEvents: true,
      canViewOrganizersDashboard: true,
    },
  },
  'external.athlete': {
    id: 'external.athlete',
    category: 'external',
    kind: 'athlete',
    sourceNames: ['athlete'],
    profileRequirementCategories: [
      'basicContact',
      'emergencyContact',
      'demographics',
      'physicalAttributes',
    ],
    permissions: {
      ...DEFAULT_PERMISSIONS,
      canAccessUserArea: true,
      canViewAthleteDashboard: true,
    },
  },
  'external.volunteer': {
    id: 'external.volunteer',
    category: 'external',
    kind: 'volunteer',
    default: true,
    sourceNames: ['volunteer', 'user'],
    profileRequirementCategories: ['basicContact', 'emergencyContact', 'demographics'],
    permissions: {
      ...DEFAULT_PERMISSIONS,
      canAccessUserArea: true,
    },
  },
};

const ROLE_NAME_MAP: Record<string, CanonicalRole> = Object.values(ROLE_REGISTRY).reduce(
  (acc, role) => {
    role.sourceNames.forEach((name) => {
      acc[name.toLowerCase()] = role.id;
    });
    return acc;
  },
  {} as Record<string, CanonicalRole>
);

const DEFAULT_EXTERNAL_ROLE =
  Object.values(ROLE_REGISTRY).find((role) => role.category === 'external' && role.default) ??
  ROLE_REGISTRY['external.athlete'];

const unique = <T>(values: Iterable<T>) => Array.from(new Set(values));

function mergePermissions(canonicalRoles: CanonicalRole[]): PermissionSet {
  return canonicalRoles.reduce<PermissionSet>((merged, role) => {
    const definition = ROLE_REGISTRY[role];
    if (!definition) return merged;

    return {
      canAccessAdminArea: merged.canAccessAdminArea || definition.permissions.canAccessAdminArea,
      canAccessUserArea: merged.canAccessUserArea || definition.permissions.canAccessUserArea,
      canManageUsers: merged.canManageUsers || definition.permissions.canManageUsers,
      canManageEvents: merged.canManageEvents || definition.permissions.canManageEvents,
      canViewStaffTools: merged.canViewStaffTools || definition.permissions.canViewStaffTools,
      canViewOrganizersDashboard:
        merged.canViewOrganizersDashboard || definition.permissions.canViewOrganizersDashboard,
      canViewAthleteDashboard:
        merged.canViewAthleteDashboard || definition.permissions.canViewAthleteDashboard,
    };
  }, { ...DEFAULT_PERMISSIONS });
}

function collectRequirementCategories(canonicalRoles: CanonicalRole[]): ProfileRequirementCategory[] {
  return unique(
    canonicalRoles.flatMap((role) => ROLE_REGISTRY[role]?.profileRequirementCategories ?? [])
  );
}

function deriveCanonicalRoles(rawRoleNames: string[]) {
  const normalized = rawRoleNames.map((role) => role.toLowerCase());
  const mapped: CanonicalRole[] = [];
  const unmapped: string[] = [];

  normalized.forEach((name) => {
    const canonical = ROLE_NAME_MAP[name];
    if (canonical) {
      mapped.push(canonical);
      return;
    }
    unmapped.push(name);
  });

  const distinctMapped = unique(mapped);
  const hasCanonicalRoles = distinctMapped.length > 0;
  const canonicalRoles = hasCanonicalRoles ? distinctMapped : [DEFAULT_EXTERNAL_ROLE.id];
  const isInternal = canonicalRoles.some((role) => ROLE_REGISTRY[role]?.category === 'internal');
  const permissions = mergePermissions(canonicalRoles);
  const profileRequirementCategories = isInternal ? [] : collectRequirementCategories(canonicalRoles);

  if (isInternal) {
    permissions.canAccessUserArea = false;
  }

  return {
    canonicalRoles,
    unmappedRoles: unique(unmapped),
    isInternal,
    permissions,
    profileRequirementCategories,
    needsRoleAssignment: !isInternal && !hasCanonicalRoles,
  };
}

export type RoleLookupResult = ReturnType<typeof deriveCanonicalRoles> & {
  roles: string[];
};

export async function getUserRolesWithInternalFlag(userId: string): Promise<RoleLookupResult> {
  const rows = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const roleNames = unique(rows.map((row) => row.roleName));
  const resolution = deriveCanonicalRoles(roleNames);

  if (resolution.unmappedRoles.length > 0) {
    console.warn('[roles] Unknown role names ignored', {
      userId,
      roleNames: resolution.unmappedRoles,
    });
  }

  return {
    roles: roleNames,
    ...resolution,
  };
}

export function getSelectableExternalRoles(): CanonicalRole[] {
  return Object.values(ROLE_REGISTRY)
    .filter((role) => role.category === 'external')
    .map((role) => role.id);
}

export async function updateUserExternalRoles(userId: string, canonicalRoles: CanonicalRole[]) {
  const externalRoles = canonicalRoles.filter(
    (role) => ROLE_REGISTRY[role]?.category === 'external'
  );
  const desiredRoles = externalRoles.length > 0 ? externalRoles : [DEFAULT_EXTERNAL_ROLE.id];
  const desiredNames = unique(
    desiredRoles.map((role) => ROLE_REGISTRY[role]?.sourceNames[0]).filter(Boolean) as string[]
  );

  if (desiredNames.length === 0) return;

  const existingRoles = await db
    .select({
      userRoleId: userRoles.id,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const existingExternalRoleNames = unique(
    existingRoles
      .map(({ roleName }) => roleName)
      .filter((roleName) => {
        const canonical = ROLE_NAME_MAP[roleName.toLowerCase()];
        return canonical ? ROLE_REGISTRY[canonical]?.category === 'external' : false;
      })
  );

  const roleNamesToEnsure = unique([...desiredNames, ...existingExternalRoleNames]);
  const existingRoleNameSet = new Set(
    existingRoles.map(({ roleName }) => roleName.toLowerCase()).filter(Boolean)
  );
  const namesToInsert = roleNamesToEnsure.filter(
    (name) => !existingRoleNameSet.has(name.toLowerCase())
  );

  if (namesToInsert.length) {
    await db
      .insert(roles)
      .values(
        namesToInsert.map((name) => ({
          name,
          description: `auto-created role ${name}`,
        }))
      )
      .onConflictDoNothing();
  }

  const ensuredRoleRows = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(inArray(roles.name, roleNamesToEnsure));

  const roleIdByName = new Map(ensuredRoleRows.map(({ id, name }) => [name.toLowerCase(), id]));
  const desiredRoleIds = desiredNames
    .map((name) => roleIdByName.get(name.toLowerCase()))
    .filter((id): id is string => Boolean(id));
  const existingRoleIds = new Set(
    existingRoles
      .map(({ roleId, roleName }) => roleId ?? roleIdByName.get(roleName.toLowerCase()))
      .filter((id): id is string => Boolean(id))
  );
  const externalRoleIds = existingExternalRoleNames
    .map((name) => roleIdByName.get(name.toLowerCase()))
    .filter((id): id is string => Boolean(id));

  if (externalRoleIds.length > 0) {
    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, externalRoleIds)));
  }

  const roleIdsToInsert = desiredRoleIds.filter(
    (roleId) => !existingRoleIds.has(roleId)
  );

  if (roleIdsToInsert.length > 0) {
    await db
      .insert(userRoles)
      .values(roleIdsToInsert.map((roleId) => ({ userId, roleId })))
      .onConflictDoNothing();
  }
}

export function getRoleDefinition(role: CanonicalRole) {
  return ROLE_REGISTRY[role];
}

export function getDefaultExternalRole(): CanonicalRole {
  return DEFAULT_EXTERNAL_ROLE.id;
}
