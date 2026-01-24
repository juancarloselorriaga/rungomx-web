# Getting Started with E2E Tests

Quick start guide for running RunGoMX regression tests.

## 1. Install dependencies

```bash
pnpm install

# Install Chromium browser (Playwright)
pnpm exec playwright install chromium
```

## 2. Configure test database

E2E tests run against the database specified in `.env.test` (`DATABASE_URL`).

The suite wipes the test database **before and after** the run. Tests create their own users via signup flows.

## 3. Run tests

Playwright starts a dedicated Next.js dev server automatically (defaults to `http://127.0.0.1:43137`).

### Run all tests (headless)
```bash
pnpm test:e2e
```

### Run isolated (unique artifacts + random port)
```bash
pnpm test:e2e:isolated
```

### Run with visible browser
```bash
pnpm test:e2e:headed
```

### Run specific test file
```bash
pnpm test:e2e e2e/tests/auth.spec.ts
pnpm test:e2e e2e/tests/athlete-registration.spec.ts
```

### Interactive mode (recommended for first run)
```bash
pnpm test:e2e:ui
```

## 4. View Results

After test completion:

### HTML Report
```bash
pnpm exec playwright show-report
```

For isolated runs (`pnpm test:e2e:isolated`), the report is written to `playwright-report/<runId>/`:
```bash
pnpm exec playwright show-report playwright-report/<runId>
```

### Check test-results directory
```bash
ls test-results/
```

For isolated runs, artifacts are written to `test-results/<runId>/`.

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
├── auth.spec.ts                     # Authentication & access
├── event-creation.spec.ts           # Organization & event setup
├── event-management.spec.ts         # Settings & publication
├── athlete-registration.spec.ts     # Athlete registration
├── capacity-enforcement.spec.ts     # Capacity enforcement
└── events-location-filter.spec.ts   # Location/map-based discovery
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

### Keep the test DB data after a run
```bash
E2E_SKIP_DB_CLEANUP=1 pnpm test:e2e
```

### Avoid overwriting previous artifacts/reports
```bash
pnpm test:e2e:isolated
```

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
# Make sure the Playwright dev server can start
# - free the default port (43137), or
# - set a custom base URL
PLAYWRIGHT_PORT=3005 pnpm test:e2e
```

### "Another E2E run appears to be active"
The suite uses a local run lock to prevent concurrent runs from clobbering the same test DB.

- Wait for the other run to finish, or
- Use isolated configs (different `DATABASE_URL` and `PLAYWRIGHT_BASE_URL`), or
- Bypass the lock (not recommended): `E2E_SKIP_RUN_LOCK=1 pnpm test:e2e`

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

1. ✅ Install Playwright browsers
2. ✅ Set `DATABASE_URL` in `.env.test`
3. ✅ Run `pnpm test:e2e:ui` for the first run
4. ✅ Review test results
5. ✅ Add to CI/CD pipeline

For detailed documentation, see [README.md](./README.md)
