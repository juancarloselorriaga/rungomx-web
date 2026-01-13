# RunGoMX E2E Tests

End-to-end regression tests for Phase 0 (Foundations) and Phase 1 (Event Management) features using Playwright.

## Prerequisites

1. **Install Playwright:**
   ```bash
   pnpm add -D @playwright/test
   pnpm exec playwright install chromium
   ```

2. **Test Accounts:**
   - Organizer: jetsam-elector92@icloud.com / rungomxpassword
   - Athlete: hiss-cheek9l@icloud.com / rungomxpassword

3. **Database:**
   - Neon PostgreSQL dev branch: `br-solitary-mud-a4da2uaw`
   - Ensure test accounts exist in database

## Running Tests

### Run all tests
```bash
pnpm test:e2e
```

### Run specific test file
```bash
pnpm test:e2e phase-0-auth
pnpm test:e2e phase-1-event-creation
pnpm test:e2e phase-1-event-management
pnpm test:e2e phase-1-registration
pnpm test:e2e phase-1-capacity
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
pnpm test:e2e --debug phase-0-auth
```

## Test Organization

```
e2e/
├── playwright.config.ts          # Playwright configuration
├── tests/
│   ├── phase-0-auth.spec.ts      # Authentication & access control
│   ├── phase-1-event-creation.spec.ts    # Event creation flow
│   ├── phase-1-event-management.spec.ts  # Settings, distances, publication
│   ├── phase-1-registration.spec.ts      # Athlete registration
│   └── phase-1-capacity.spec.ts          # Capacity enforcement & race conditions
├── fixtures/
│   └── test-data.ts              # Test data constants
└── utils/
    └── helpers.ts                # Shared test utilities
```

## Test Suites

### Phase 0: Foundations (5 tests)
- Non-authenticated access control
- Organizer authentication
- Profile completion enforcement
- Public page access
- Invalid credential handling

### Phase 1: Event Creation (5 tests)
- Organization creation
- Event creation with details
- Event appears in organizer list
- Draft events hidden from public
- Unique slug generation

### Phase 1: Event Management (11 tests)
- Settings page access
- Distance management (add single, add multiple)
- Event publication
- Public directory visibility
- Public event page access
- Registration pause/unpause
- Public page reflects registration status
- Event detail editing

### Phase 1: Registration (11 tests)
- Non-authenticated user flow
- Sign-in redirect with callback
- Distance selection
- Participant information form
- Order summary display
- Registration completion
- Duplicate prevention
- Capacity decrement
- Form validation

### Phase 1: Capacity Enforcement (7 tests)
- Initial capacity display
- Capacity fill
- Sold out display
- Direct URL blocking
- Concurrent registration (race condition)
- Multiple distances with different capacities
- Partial capacity handling

**Total: 39 automated tests**

## Test Features

### Idempotency
- Tests use unique timestamps in entity names
- Can run multiple times without conflicts
- Example: `E2E Test Event ${Date.now()}`

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

All test data is defined in `fixtures/test-data.ts`:
- Account credentials
- Profile information
- Event configurations
- Distance presets
- Registration data

## Helpers

Common operations extracted to `utils/helpers.ts`:
- `signInAsOrganizer(page)` - Authenticate as organizer
- `signInAsAthlete(page)` - Authenticate as athlete
- `createOrganization(page, name?)` - Create unique organization
- `createEvent(page, options?)` - Create event with defaults
- `addDistance(page, options)` - Add distance to event
- `publishEvent(page)` - Change visibility to Published
- `pauseRegistration(page)` - Pause event registration
- `resumeRegistration(page)` - Resume event registration
- `completeRegistrationForm(page, options?)` - Fill athlete registration
- `fillPhoneInput(page, label, phone)` - Handle phone input validation

## Debugging

### View test report
```bash
pnpm exec playwright show-report
```

### Trace viewer (after failed test)
```bash
pnpm exec playwright show-trace <trace-file>
```

### Screenshots and videos
Located in `test-results/` directory after test run

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
- [Test Plan](../docs/testing/phase-0-1-test-plan.md)
- [Previous Test Results](../docs/testing/phase-0-1-automated-smoke-test-results.md)
