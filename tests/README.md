# Database Testing with Neon, Drizzle, and Jest

## Overview

This project uses **Neon database branching** for isolated, real-database testing with Jest and Drizzle ORM. Instead of mocks, tests run against actual PostgreSQL databases with your production schema.

## Architecture

### Branch Isolation
- **Main branch**: Production data
- **Dev branch**: Development work
- **Test branch**: Automated testing (isolated from main/dev)

Each branch is a complete PostgreSQL database clone with full schema and constraints.

### Test Organization

Tests are organized into three projects:

1. **Client tests** (`*.client.test.ts`): React components, hooks (jsdom environment)
2. **Server tests** (`*.server.test.ts`): API routes, server utilities (node environment)
3. **Database tests** (`*.db.test.ts`): Database operations, queries (node + test DB)

## Setup

### Environment Variables

- `.env.local`: Development database (dev branch)
- `.env.test`: Test database (test branch)

The test environment automatically loads `.env.test` when running database tests.

### Database Helpers

Located in `tests/helpers/`:

- **`db.ts`**: Database setup, cleanup, and reset utilities
- **`fixtures.ts`**: Factory functions for creating test data

## Writing Tests

### Database Tests

Create tests with the `.db.test.ts` suffix:

```typescript
import { cleanDatabase, getTestDb } from "../../helpers/db";
import { createTestUser } from "../../helpers/fixtures";

describe("My Database Tests", () => {
  const db = getTestDb();

  beforeEach(async () => {
    // Clean database before each test for isolation
    await cleanDatabase(db);
  });

  it("should create a user", async () => {
    const user = await createTestUser(db);
    expect(user.id).toBeDefined();
  });
});
```

### Test Fixtures

Use fixtures to create consistent test data:

```typescript
// Create user with defaults
const user = await createTestUser(db);

// Create user with custom data
const user = await createTestUser(db, {
  email: "custom@example.com",
  firstName: "Jane",
});

// Create and assign role
const role = await createTestRole(db, { name: "admin" });
await assignUserRole(db, user.id, role.id);
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run only database tests
pnpm test --selectProjects database

# Run specific test file
pnpm test users.db.test.ts

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

## Best Practices

### 1. Clean State
Always clean the database before each test to ensure isolation:

```typescript
beforeEach(async () => {
  await cleanDatabase(db);
});
```

### 2. Use Fixtures
Avoid duplicating test data creation logic. Use fixtures for consistency:

```typescript
// ✅ Good
const user = await createTestUser(db, { email: "test@example.com" });

// ❌ Avoid
const [user] = await db.insert(users).values({ ... }).returning();
```

### 3. Test Real Constraints
Test actual database constraints (unique indexes, foreign keys, cascades):

```typescript
it("should enforce unique email", async () => {
  await createTestUser(db, { email: "duplicate@example.com" });
  await expect(
    createTestUser(db, { email: "duplicate@example.com" })
  ).rejects.toThrow();
});
```

### 4. Test Relationships
Verify cascade deletes and relationship integrity:

```typescript
it("should cascade delete related records", async () => {
  const user = await createTestUser(db);
  const role = await createTestRole(db);
  await assignUserRole(db, user.id, role.id);

  await db.delete(users).where(eq(users.id, user.id));

  const userRoles = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));

  expect(userRoles).toHaveLength(0);
});
```

## Benefits of This Approach

✅ **Real Database Testing**: Test against actual PostgreSQL, not mocks
✅ **Full Isolation**: Each test runs in a clean database state
✅ **Production Schema**: Tests use the same schema as production
✅ **Fast Branching**: Neon branches are lightweight and instant
✅ **Type Safety**: Drizzle provides full TypeScript safety
✅ **CI/CD Ready**: Easy to integrate with GitHub Actions/CI pipelines

## Resources

- [Neon Testing Guide](https://neon.com/blog/neon-testing-a-vitest-library-for-your-integration-tests)
- [Neon Branch Testing](https://neon.com/flow/branch-per-test-run)
- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Jest Documentation](https://jestjs.io)
