import * as schema from "@/db/schema";
import type { getTestDb } from "./db";

/**
 * Create a test user with default values
 */
export async function createTestUser(
  db: ReturnType<typeof getTestDb>,
  overrides: {
    email?: string;
    firstName?: string;
    lastName?: string;
  } = {},
) {
  const [user] = await db
    .insert(schema.users)
    .values({
      email: overrides.email ?? `test-${Date.now()}@example.com`,
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "User",
    })
    .returning();

  return user;
}

/**
 * Create a test role
 */
export async function createTestRole(
  db: ReturnType<typeof getTestDb>,
  overrides: {
    name?: string;
    description?: string;
  } = {},
) {
  const [role] = await db
    .insert(schema.roles)
    .values({
      name: overrides.name ?? `role-${Date.now()}`,
      description: overrides.description ?? "Test role",
    })
    .returning();

  return role;
}

/**
 * Assign a role to a user
 */
export async function assignUserRole(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  roleId: string,
) {
  const [userRole] = await db
    .insert(schema.userRoles)
    .values({
      userId,
      roleId,
    })
    .returning();

  return userRole;
}
