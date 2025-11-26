import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { cleanDatabase, getTestDb } from "../../helpers/db";
import {
  assignUserRole,
  createTestRole,
  createTestUser,
} from "../../helpers/fixtures";

describe("Users Database Tests", () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
  });

  describe("User Creation", () => {
    it("should create a user with valid data", async () => {
      const user = await createTestUser(db, {
        email: "test@example.com",
        name: "John Doe",
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe("test@example.com");
      expect(user.name).toBe("John Doe");
      expect(user.createdAt).toBeDefined();
    });

    it("should enforce unique email constraint", async () => {
      await createTestUser(db, { email: "duplicate@example.com" });

      // Attempting to create another user with the same email should fail
      await expect(
        createTestUser(db, { email: "duplicate@example.com" }),
      ).rejects.toThrow();
    });

    it("should auto-generate UUID for user id", async () => {
      const user = await createTestUser(db);

      expect(user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("User Queries", () => {
    it("should find user by email", async () => {
      const createdUser = await createTestUser(db, {
        email: "findme@example.com",
      });

      const [foundUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, "findme@example.com"));

      expect(foundUser).toBeDefined();
      expect(foundUser.id).toBe(createdUser.id);
    });

    it("should return empty array for non-existent user", async () => {
      const users = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, "nonexistent@example.com"));

      expect(users).toHaveLength(0);
    });
  });

  describe("User Roles", () => {
    it("should assign role to user", async () => {
      const user = await createTestUser(db);
      const role = await createTestRole(db, { name: "admin" });

      const userRole = await assignUserRole(db, user.id, role.id);

      expect(userRole.userId).toBe(user.id);
      expect(userRole.roleId).toBe(role.id);
    });

    it("should enforce unique user-role combination", async () => {
      const user = await createTestUser(db);
      const role = await createTestRole(db, { name: "editor" });

      await assignUserRole(db, user.id, role.id);

      // Attempting to assign the same role again should fail
      await expect(assignUserRole(db, user.id, role.id)).rejects.toThrow();
    });

    it("should cascade delete user roles when user is deleted", async () => {
      const user = await createTestUser(db);
      const role = await createTestRole(db, { name: "viewer" });
      await assignUserRole(db, user.id, role.id);

      // Delete the user
      await db.delete(schema.users).where(eq(schema.users.id, user.id));

      // Check that user role was also deleted
      const userRoles = await db
        .select()
        .from(schema.userRoles)
        .where(eq(schema.userRoles.userId, user.id));

      expect(userRoles).toHaveLength(0);
    });
  });
});
