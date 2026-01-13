# E2E Testing Standards

## Philosophy & Goals

**Why Playwright for E2E Tests:**
- End-to-end browser automation testing
- Tests the complete user journey from UI to database
- Catches integration issues that unit tests miss
- Validates real user flows in production-like environment

**Isolation & Scalability:**
- Each test file creates its own isolated users
- No shared test accounts across files
- Tests can scale to 20+ files without conflicts
- Clean database state before each test run

**Relationship to Jest Tests:**
- **Jest**: Unit and integration tests (fast, isolated)
- **Playwright E2E**: Full user flows (slower, comprehensive)
- Both use same database utilities pattern for consistency

---

## Test File Organization

### Naming Convention

**✅ DO:** Use semantic names describing what is tested
```typescript
auth.spec.ts              // Authentication & access control
event-creation.spec.ts    // Organization & event creation
athlete-registration.spec.ts // Athlete registration flow
```

**❌ DON'T:** Use phase-based or time-based names
```typescript
phase-0-auth.spec.ts      // ❌ Implementation phase, not what's tested
sprint-3-events.spec.ts   // ❌ Sprint number is irrelevant
v1-registration.spec.ts   // ❌ Version number adds no value
```

### Directory Structure

```
e2e/
├── playwright.config.ts     # Main config
├── global-setup.ts          # Database cleanup before all tests
├── global-teardown.ts       # Database cleanup after all tests
├── tests/
│   ├── auth.spec.ts
│   ├── event-creation.spec.ts
│   └── ...
├── utils/
│   ├── db.ts               # Database utilities (Jest pattern)
│   ├── fixtures.ts         # Test data creation (signup endpoints)
│   └── helpers.ts          # UI interaction helpers
└── fixtures/
    └── test-data.ts        # Static test data (events, distances, etc.)
```

### When to Create New Test Files

**Create a new test file when:**
- Testing a distinct feature area (e.g., payments, email notifications)
- File would exceed ~300 lines with new tests
- Tests require significantly different setup

**Add to existing file when:**
- Testing variations of the same flow
- Tests share the same setup (beforeAll)
- Logically related to existing tests in the file

---

## User Creation Pattern (MANDATORY)

### Core Principle

**Never use hardcoded test accounts. Always create users per-test-file via signup.**

### The Pattern

```typescript
import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import {
  signUpTestUser,
  setUserVerified,
  getUserByEmail,
  createTestProfile
} from '../utils/fixtures';
import { signInAsOrganizer } from '../utils/helpers';

// Store credentials for this test file
let organizerCreds: { email: string; password: string; name: string };
let athleteCreds: { email: string; password: string; name: string };

test.describe('My Feature Tests', () => {
  test.describe.configure({ mode: 'serial' }); // Sequential execution

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create unique users for THIS test file only
    organizerCreds = await signUpTestUser(page, 'org-myfeature-', {
      name: 'My Feature Test Organizer',
    });

    await setUserVerified(db, organizerCreds.email); // Bypass email verification

    const organizer = await getUserByEmail(db, organizerCreds.email);
    await createTestProfile(db, organizer!.id, {
      phone: '+523312345678',
      city: 'Mexico City',
      state: 'CDMX',
      emergencyContactName: 'Test Contact',
      emergencyContactPhone: '+523387654321',
    });

    athleteCreds = await signUpTestUser(page, 'athlete-myfeature-');
    await setUserVerified(db, athleteCreds.email);

    const athlete = await getUserByEmail(db, athleteCreds.email);
    await createTestProfile(db, athlete!.id, { /* ... */ });

    await context.close();
  });

  test('my test', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    // ... test code
  });
});
```

### Rules

**✅ DO:**
- Use `signUpTestUser()` in `beforeAll()` per test file
- Use unique prefixes (e.g., `org-auth-`, `athlete-reg-`, `org-capacity-`)
- Bypass email verification via DB (`setUserVerified()`)
- Create profiles via DB (`createTestProfile()`)
- Store credentials in file-scoped variables

**❌ DON'T:**
- Create users directly in DB with password hashing
- Share users across test files
- Use hardcoded test accounts from test-data.ts
- Create users in individual test() blocks
- Skip email verification bypass (tests will fail)

### Why This Pattern?

1. **Isolation:** Each test file has dedicated users, no conflicts
2. **Scalability:** Can add unlimited test files without interference
3. **Realism:** Tests full signup flow including password hashing
4. **Speed:** Create once per file, not per test
5. **Maintainability:** Follows established Jest pattern

---

## Database Utilities

### Setup

Database utilities in `e2e/utils/db.ts` follow Jest pattern exactly:

```typescript
import { getTestDb } from './utils/db';

const db = getTestDb(); // Uses DATABASE_URL from .env.test
```

### Environment

- **Always use `.env.test`** for database connection
- Test database should be a separate Neon branch
- Never run E2E tests against production database

### Cleanup

Global setup/teardown handles cleanup:
- `global-setup.ts`: Cleans database before all tests
- `global-teardown.ts`: Cleans database after all tests

**FK-Safe Deletion Order:**
Database cleanup must delete in dependency order to avoid foreign key violations. See `e2e/utils/db.ts` for complete order.

### Worker Configuration

**Always use single worker:**
```typescript
// playwright.config.ts
{
  workers: 1, // Prevent Neon deadlocks
  fullyParallel: false, // Sequential execution
}
```

---

## Test Data Creation

### Uniqueness

Always use `Date.now()` for unique identifiers:

```typescript
const timestamp = Date.now();
const email = `test-${timestamp}@example.com`;
const orgName = `Test Org ${timestamp}`;
```

### Fixture Functions

All fixture functions support `overrides` parameter:

```typescript
await createTestProfile(db, userId, {
  phone: '+523312345678', // Override default
  city: 'Mexico City',    // Override default
  // Other fields use defaults
});
```

### Always Use `.returning()`

Get created records immediately:

```typescript
const [organization] = await db
  .insert(schema.organizations)
  .values({ /* ... */ })
  .returning(); // ✅ Returns created org

return organization; // Can use org.id immediately
```

---

## Best Practices

### Sequential Execution

Always configure test files for sequential execution:

```typescript
test.describe('My Tests', () => {
  test.describe.configure({ mode: 'serial' }); // ← REQUIRED

  // Tests run one at a time
});
```

**Why:** Prevents race conditions when modifying shared data (events, registrations, etc.)

### Semantic Selectors

**✅ DO:** Use role-based selectors
```typescript
await page.getByRole('button', { name: /sign in/i });
await page.getByLabel(/email/i);
await page.getByRole('textbox', { name: /phone/i });
```

**❌ DON'T:** Use CSS selectors
```typescript
await page.locator('.btn-primary'); // Brittle
await page.locator('#email-input'); // Breaks on refactors
```

### Phone Input Handling

React phone inputs require special handling:

```typescript
import { fillPhoneInput } from '../utils/helpers';

await fillPhoneInput(page, /phone/i, '+523318887777');
// Uses pressSequentially() with delay for proper validation
```

**Never use `.fill()` for phone inputs** - validation will fail.

### Wait for Navigation

Always verify navigation completed:

```typescript
await page.goto('/en/sign-in');
await expect(page).toHaveURL(/\/sign-in/); // ✅ Verify

await page.getByRole('button').click();
await page.waitForLoadState('networkidle'); // ✅ Wait for completion
```

---

## Example Test File Structure

Complete example showing all patterns:

```typescript
import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import {
  signUpTestUser,
  setUserVerified,
  getUserByEmail,
  createTestProfile
} from '../utils/fixtures';
import {
  signInAsOrganizer,
  createOrganization,
  createEvent,
} from '../utils/helpers';

// File-scoped credentials
let organizerCreds: { email: string; password: string; name: string };

test.describe('Event Creation', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create test user via signup
    organizerCreds = await signUpTestUser(page, 'org-events-', {
      name: 'Event Test Organizer',
    });

    // Bypass email verification
    await setUserVerified(db, organizerCreds.email);

    // Create profile
    const user = await getUserByEmail(db, organizerCreds.email);
    await createTestProfile(db, user!.id, {
      phone: '+523312345678',
      city: 'Mexico City',
      state: 'CDMX',
      emergencyContactName: 'Emergency Contact',
      emergencyContactPhone: '+523387654321',
    });

    await context.close();
  });

  test('organizer can create event', async ({ page }) => {
    // Sign in with created credentials
    await signInAsOrganizer(page, organizerCreds);

    // Create organization
    await page.goto('/en/dashboard/events/new');
    const orgName = await createOrganization(page);

    // Create event
    const event = await createEvent(page, {
      seriesName: 'E2E Test Event',
      editionLabel: '2026',
    });

    // Verify event created
    expect(event.eventId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page).toHaveURL(/\/dashboard\/events/);
  });
});
```

---

## Verification & Testing

### Verify Isolation

Run same test file multiple times:

```bash
pnpm test:e2e auth
pnpm test:e2e auth
pnpm test:e2e auth
```

**Expected:** All runs should pass. No conflicts from previous runs.

### Verify Cleanup

Check database before/after:

```bash
# Before tests
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
# Should be 0 (clean state)

pnpm test:e2e

# After tests
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
# Should be 0 (cleaned up)
```

### Run Full Suite

```bash
pnpm test:e2e
```

**Expected:**
- All tests pass
- ~10 minutes duration
- No cross-file conflicts
- Clean database at end

---

## Common Patterns

### Creating Events

```typescript
const { eventId } = await createEvent(page, {
  seriesName: 'Test Event',
  editionLabel: '2026',
});

await navigateToEventSettings(page, eventId);
await addDistance(page, DISTANCE_DATA.trail10k);
await publishEvent(page);
```

### Registration Flow

```typescript
await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);
await page.getByRole('button', { name: /10K/i }).click();
await page.getByRole('button', { name: /continue/i }).click();

await completeRegistrationForm(page, {
  phone: '+523318887777',
  emergencyPhone: '+523319998888',
});

await page.getByRole('button', { name: /complete/i }).click();
await expect(page.getByText(/complete/i)).toBeVisible();
```

---

## Troubleshooting

### "User already exists"

**Cause:** Using same email prefix in multiple test files

**Fix:** Use unique prefix per file:
```typescript
// In auth.spec.ts
await signUpTestUser(page, 'org-auth-');  // ✅

// In events.spec.ts
await signUpTestUser(page, 'org-events-'); // ✅
```

### Tests timing out

**Cause:** Network delay or database operation taking too long

**Fix:** Increase timeout in playwright.config.ts:
```typescript
{
  timeout: 90 * 1000, // 90 seconds
}
```

### Foreign key violations on cleanup

**Cause:** Incorrect deletion order in cleanDatabase()

**Fix:** Update `e2e/utils/db.ts` with correct FK-safe order. Child tables must be deleted before parent tables.

### Phone validation fails

**Cause:** Using `.fill()` instead of `fillPhoneInput()`

**Fix:**
```typescript
// ❌ Wrong
await page.getByRole('textbox', { name: /phone/i }).fill('+523318887777');

// ✅ Correct
await fillPhoneInput(page, /phone/i, '+523318887777');
```

---

## Migration Guide

### Updating Existing Tests

To migrate a test file to use the new pattern:

1. **Add imports:**
   ```typescript
   import { getTestDb } from '../utils/db';
   import { signUpTestUser, setUserVerified, getUserByEmail, createTestProfile } from '../utils/fixtures';
   ```

2. **Add file-scoped credential variables:**
   ```typescript
   let organizerCreds: { email: string; password: string; name: string };
   ```

3. **Add beforeAll hook:**
   ```typescript
   test.beforeAll(async ({ browser }) => {
     // Create users via signup (see example above)
   });
   ```

4. **Update sign-in calls:**
   ```typescript
   // Before
   await signInAsOrganizer(page);

   // After
   await signInAsOrganizer(page, organizerCreds);
   ```

5. **Remove profile completion calls:**
   ```typescript
   // Before
   await signInAsOrganizer(page);
   await completeOrganizerProfile(page); // ← Remove this

   // After
   await signInAsOrganizer(page, organizerCreds); // Profile already exists
   ```

---

## Summary Checklist

Before committing new E2E tests, verify:

- [ ] Test file uses semantic naming (not phase-X)
- [ ] `beforeAll` hook creates users via `signUpTestUser()`
- [ ] Users have unique prefix for this test file
- [ ] `setUserVerified()` called to bypass email
- [ ] Profiles created via `createTestProfile()`
- [ ] `test.describe.configure({ mode: 'serial' })`
- [ ] Sign-in helpers receive credentials parameter
- [ ] No hardcoded emails/passwords
- [ ] Phone inputs use `fillPhoneInput()` helper
- [ ] Navigation waits verified with `expect(page).toHaveURL()`
- [ ] Test can run multiple times without conflicts

---

## Resources

- **Playwright Docs:** https://playwright.dev
- **Test Plan:** `/docs/testing/phase-0-1-test-plan.md`
- **Database Utilities:** `/e2e/utils/db.ts`
- **Test Fixtures:** `/e2e/utils/fixtures.ts`
- **Helper Functions:** `/e2e/utils/helpers.ts`

---

## Questions?

If you need to add a new E2E test suite and have questions about these patterns, refer to existing test files (`auth.spec.ts`, `event-creation.spec.ts`) as examples. All test files follow this exact pattern.
