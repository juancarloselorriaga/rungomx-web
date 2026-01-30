# RunGoMX E2E Tests

End-to-end regression tests for the RunGoMX event platform (Phase 0–2) using Playwright.

## Prerequisites

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Install Playwright browser(s):**
   ```bash
   pnpm exec playwright install chromium
   ```

3. **Database**
   - E2E runs against the **Neon test branch** via `DATABASE_URL` in `.env.test`.
   - The suite **wipes the test database before and after** the run (see `e2e/global-setup.ts` and `e2e/global-teardown.ts`).
   - Tests create their own users via signup flows; no pre-seeded accounts are required.

## Running Tests

### Run all tests
```bash
pnpm test:e2e
```

### Run isolated (unique artifacts + random port)
```bash
pnpm test:e2e:isolated
```

### Run a single test file
```bash
pnpm test:e2e e2e/tests/auth.spec.ts
pnpm test:e2e e2e/tests/event-creation.spec.ts
pnpm test:e2e e2e/tests/event-management.spec.ts
pnpm test:e2e e2e/tests/athlete-registration.spec.ts
pnpm test:e2e e2e/tests/capacity-enforcement.spec.ts
pnpm test:e2e e2e/tests/events-location-filter.spec.ts
```

### Run tests in UI mode (interactive)
```bash
pnpm test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
pnpm test:e2e --headed
```

### Debug specific test
```bash
pnpm test:e2e --debug e2e/tests/auth.spec.ts
```

## Test Organization

```
e2e/
├── playwright.config.ts          # Playwright configuration
├── tests/
│   ├── auth.spec.ts                     # Authentication & access control
│   ├── event-creation.spec.ts           # Organization + event setup
│   ├── event-management.spec.ts         # Settings, distances, publication
│   ├── athlete-registration.spec.ts     # Athlete registration flow
│   ├── capacity-enforcement.spec.ts     # Capacity enforcement & race conditions
│   └── events-location-filter.spec.ts   # Location/map-based discovery
├── fixtures/
│   └── test-data.ts              # Test data constants
└── utils/
    └── helpers.ts                # Shared test utilities
```

**Total:** 39 automated tests

## Test Features

### Idempotency
- Tests use unique timestamps in entity names

### Database cleanup controls
- Default: DB is cleaned **before and after** the suite.
- Debugging: set `E2E_SKIP_DB_CLEANUP=1` to preserve data after the run:
  ```bash
  E2E_SKIP_DB_CLEANUP=1 pnpm test:e2e e2e/tests/event-management.spec.ts
  ```
- The suite also uses a run lock (per `DATABASE_URL` host) to prevent concurrent runs from clobbering the same test DB.
- Can run multiple times without conflicts
- Example: `E2E Test Event ${Date.now()}`

### Avoiding local clashes
- **Port isolation:** default server is `127.0.0.1:43137`. Override with `PLAYWRIGHT_PORT=3005`, `PLAYWRIGHT_BASE_URL=...`, or set `PORT` in `.env.local` for per-worktree defaults.
- **Artifact isolation:** set `E2E_RUN_ID=...` to write results to per-run folders, or run `pnpm test:e2e:isolated`.
- **Parallel runs:** require isolated configs (different `DATABASE_URL` + different `PLAYWRIGHT_BASE_URL`).

### Isolation
- Each test suite is independent
- `beforeAll` hooks set up required state
- Tests run sequentially to avoid conflicts

### Assertions
- Comprehensive checks for UI state
- URL validation
- Content visibility verification
- Database state validation (manual queries recommended)

## Test Data

Deterministic data presets live in `e2e/fixtures/test-data.ts` (event + distance + registration defaults).

Test users/roles are created directly in the DB for speed and isolation:
- `e2e/utils/fixtures.ts` (Better Auth-compatible credentials + profile helpers)

## Helpers

Shared UI flows live in `e2e/utils/helpers.ts` (sign-in, event creation/management, registration helpers).

## Debugging

### View test report
```bash
pnpm exec playwright show-report
```

For isolated runs (`pnpm test:e2e:isolated`), the report is written to `playwright-report/<runId>/`:
```bash
pnpm exec playwright show-report playwright-report/<runId>
```

### Trace viewer (after failed test)
```bash
pnpm exec playwright show-trace <trace-file>
```

### Screenshots and videos
Located in `test-results/` after the run (or `test-results/<runId>/` for isolated runs).

### Browser console logs
Available in test output when tests fail

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Install dependencies
  run: pnpm install

- name: Install Playwright browsers
  run: pnpm exec playwright install --with-deps chromium

- name: Run E2E tests
  run: pnpm test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Maintenance

### Adding new tests
1. Create new `.spec.ts` file in `e2e/tests/`
2. Import helpers and fixtures
3. Use `test.describe()` for grouping
4. Add `test.describe.configure({ mode: 'serial' })` for sequential execution
5. Use `beforeAll` for setup, `afterAll` for cleanup

### Updating helpers
- Modify `e2e/utils/helpers.ts`
- Ensure helpers remain reusable across tests
- Add JSDoc comments for new functions

### Test data changes
- Update `e2e/fixtures/test-data.ts`
- Keep test data isolated and predictable
- Avoid hardcoding values in test files

## Troubleshooting

### Tests timing out
- Increase timeout in `playwright.config.ts`
- Add `await page.waitForTimeout()` for dynamic content
- Use `await page.waitForLoadState('networkidle')`

### Phone input validation fails
- Use `fillPhoneInput()` helper instead of `.fill()`
- Always use E.164 format: `+523318887777`
- Add delay if needed: `pressSequentially(phone, { delay: 100 })`

### Element not found
- Use `await element.waitFor({ state: 'visible' })`
- Check selector with `await page.locator(selector).count()`
- Verify page has loaded: `await expect(page).toHaveURL(...)`

### Race conditions
- Use `test.describe.configure({ mode: 'serial' })`
- Avoid parallel execution for tests that modify same data
- Use unique identifiers (timestamps) for entities

## Best Practices

1. **Always wait for navigation:**
   ```typescript
   await page.goto('/en/events');
   await expect(page).toHaveURL('/en/events');
   ```

2. **Use semantic selectors:**
   ```typescript
   // Good
   await page.getByRole('button', { name: /sign in/i });

   // Avoid
   await page.locator('.btn-submit');
   ```

3. **Verify state before actions:**
   ```typescript
   await expect(registerButton).toBeVisible();
   await registerButton.click();
   ```

4. **Handle dynamic content:**
   ```typescript
   await page.waitForLoadState('networkidle');
   await expect(content).toBeVisible();
   ```

5. **Clean up test data:**
   ```typescript
   // Use unique names
   const orgName = generateTestName('Test Org');

   // Or clean up in afterAll
   test.afterAll(async () => {
     // Delete created entities
   });
   ```

## Performance

- **Sequential execution:** Tests run one at a time to prevent conflicts
- **Test duration:** ~10-15 minutes for full suite
- **Workers:** 1 (configured in `playwright.config.ts`)
- **Retries:** 2 on CI, 0 locally

## Coverage

These tests cover:
- ✅ Authentication flows
- ✅ Profile completion
- ✅ Organization creation
- ✅ Event creation and editing
- ✅ Distance management
- ✅ Event publication
- ✅ Registration controls (pause/resume)
- ✅ Public event pages
- ✅ Athlete registration flow
- ✅ Capacity enforcement
- ✅ Race condition handling

Not covered (Phase 2+):
- Payment processing
- Email notifications
- Waiver acceptance
- QR code generation
- Results management

## Resources

- [Playwright Documentation](https://playwright.dev)
