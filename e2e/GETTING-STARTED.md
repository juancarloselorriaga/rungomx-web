# Getting Started with E2E Tests

Quick start guide for running RunGoMX regression tests.

## 1. Install Playwright

```bash
# Install Playwright as dev dependency
pnpm add -D @playwright/test

# Install Chromium browser
pnpm exec playwright install chromium
```

## 2. Verify Test Accounts

Ensure these test accounts exist in your database:

**Organizer:**
- Email: `jetsam-elector92@icloud.com`
- Password: `rungomxpassword`

**Athlete:**
- Email: `hiss-cheek9l@icloud.com`
- Password: `rungomxpassword`

## 3. Start Development Server

In one terminal:
```bash
pnpm dev
```

Wait for server to start on `http://localhost:3000`

## 4. Run Tests

In another terminal:

### Run all tests (headless)
```bash
pnpm test:e2e
```

### Run with visible browser
```bash
pnpm test:e2e --headed
```

### Run specific test file
```bash
pnpm test:e2e phase-0-auth
pnpm test:e2e phase-1-registration
```

### Interactive mode (recommended for first run)
```bash
pnpm test:e2e:ui
```

## 5. View Results

After test completion:

### HTML Report
```bash
pnpm exec playwright show-report
```

### Check test-results directory
```bash
ls test-results/
```

Contains:
- Screenshots (on failure)
- Videos (on failure)
- Traces (on retry)

## Common Commands

| Command | Description |
|---------|-------------|
| `pnpm test:e2e` | Run all tests headless |
| `pnpm test:e2e:ui` | Interactive UI mode |
| `pnpm test:e2e:headed` | Run with visible browser |
| `pnpm test:e2e:debug` | Debug mode with inspector |
| `pnpm test:e2e <test-name>` | Run specific test |

## Test Files Overview

```
e2e/tests/
├── phase-0-auth.spec.ts              # 5 tests - Authentication & access
├── phase-1-event-creation.spec.ts    # 5 tests - Organization & event setup
├── phase-1-event-management.spec.ts  # 11 tests - Settings & publication
├── phase-1-registration.spec.ts      # 11 tests - Athlete registration
└── phase-1-capacity.spec.ts          # 7 tests - Capacity enforcement
```

**Total: 39 automated tests**

## Expected Duration

- Phase 0 tests: ~2 minutes
- Phase 1 tests: ~8 minutes
- **Full suite: ~10 minutes**

## What Gets Tested

### Phase 0 - Foundations ✓
- Authentication (organizer & athlete)
- Access control (protected routes)
- Profile completion enforcement
- Public page accessibility

### Phase 1 - Event Management ✓
- Organization creation
- Event creation with details
- Distance management (pricing, capacity)
- Event publication (Draft → Published)
- Registration controls (pause/resume)
- Public event page display
- Athlete registration flow
- Capacity enforcement
- Concurrent registration handling

## Troubleshooting

### "Test timeout exceeded"
```bash
# Increase timeout in playwright.config.ts
timeout: 90 * 1000  # 90 seconds
```

### "Browser not installed"
```bash
pnpm exec playwright install chromium
```

### "Connection refused"
```bash
# Make sure dev server is running
pnpm dev
```

### "Test accounts not found"
```bash
# Create test accounts in database
# Or update TEST_ACCOUNTS in e2e/fixtures/test-data.ts
```

### Tests fail with "Element not found"
```bash
# Run in headed mode to see what's happening
pnpm test:e2e:headed

# Or use UI mode for debugging
pnpm test:e2e:ui
```

## Best Practices

1. **Run full suite before deployment**
   ```bash
   pnpm test:e2e
   ```

2. **Use UI mode for development**
   ```bash
   pnpm test:e2e:ui
   ```

3. **Check HTML report after failures**
   ```bash
   pnpm exec playwright show-report
   ```

4. **Keep test data unique**
   - Tests use timestamps to avoid conflicts
   - Can run multiple times safely

5. **Monitor test duration**
   - If tests slow down significantly, investigate
   - May indicate performance regression

## Next Steps

1. ✅ Install Playwright
2. ✅ Verify test accounts exist
3. ✅ Start dev server
4. ✅ Run `pnpm test:e2e:ui` for first run
5. ✅ Review test results
6. ✅ Add to CI/CD pipeline

For detailed documentation, see [README.md](./README.md)

For test specifications, see [Test Plan](../docs/testing/phase-0-1-test-plan.md)
