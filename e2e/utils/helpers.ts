import { Page, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { and, eq, isNull } from 'drizzle-orm';
import { eventDistances, eventEditions } from '@/db/schema';
import { getAuthReadinessState, type DestinationPattern } from './auth-readiness';
import { emitDiagnostic } from './diagnostics';
import { getTestDb } from './db';

/**
 * Test helper utilities for RunGoMX E2E tests
 */

async function forceSignOut(page: Page) {
  await page.evaluate(async () => {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }).catch(() => null);
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

async function waitForNextBuildToSettle(page: Page, context: string) {
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (!(await buildIndicator.isVisible().catch(() => false))) return;

  emitDiagnostic('auth.sign_in.waiting_for_build', { context });
  await expect(buildIndicator).not.toBeVisible({ timeout: 60_000 });
}

const DEFAULT_SIGN_IN_DESTINATIONS: DestinationPattern[] = [
  /\/admin(?:\/|$)/,
  /\/dashboard(?:\/|$)/,
  /\/settings(?:\/|$)/,
];

type SignInOptions = {
  role?: 'organizer' | 'athlete' | 'volunteer';
  expectedDestinations?: DestinationPattern[];
  authReadinessTimeoutMs?: number;
};

/**
 * Generate unique timestamp-based identifier
 */
export function generateTimestamp(): string {
  return Date.now().toString();
}

/**
 * Generate unique test entity name
 */
export function generateTestName(prefix: string): string {
  return `${prefix} ${generateTimestamp()}`;
}

/**
 * Sign in as any user with provided credentials
 * Handles role selection and profile completion modals for new users
 */
export async function signInAsUser(
  page: Page,
  credentials: { email: string; password: string },
  options?: SignInOptions,
) {
  const expectedDestinations = options?.expectedDestinations ?? DEFAULT_SIGN_IN_DESTINATIONS;
  const authReadinessTimeoutMs = options?.authReadinessTimeoutMs ?? 45_000;
  const roleModal = page.getByText('Choose your role to continue');

  const waitForDestinationAndClosedModals = async (
    context: string,
    timeoutMs = authReadinessTimeoutMs,
  ) => {
    await expect
      .poll(
        async () => {
          const authState = await getAuthReadinessState(page, expectedDestinations);
          return authState.status === 'destination';
        },
        { timeout: timeoutMs },
      )
      .toBe(true);

    emitDiagnostic('auth.sign_in.ready', { context, url: page.url() });
  };

  const waitForActionableAuthState = async (
    context: string,
    timeoutMs = authReadinessTimeoutMs,
  ) => {
    const startedAt = Date.now();
    let destinationStableSince: number | null = null;
    let lastState = await getAuthReadinessState(page, expectedDestinations);

    while (Date.now() - startedAt <= timeoutMs) {
      lastState = await getAuthReadinessState(page, expectedDestinations);

      if (lastState.status === 'role-modal' || lastState.status === 'profile-modal') {
        return lastState;
      }

      if (lastState.status === 'destination') {
        destinationStableSince ??= Date.now();
        if (Date.now() - destinationStableSince >= 750) {
          return lastState;
        }
      } else {
        destinationStableSince = null;
      }

      await page.waitForTimeout(200);
    }

    emitDiagnostic(
      'auth.sign_in.wait.failed',
      { context, timeoutMs, lastState, url: page.url() },
      'error',
    );
    throw new Error(
      `[auth] ${context} did not settle within ${timeoutMs}ms. Last URL: ${page.url()} (${lastState.status}).`,
    );
  };

  // Ensure we're on the app origin first.
  await page.goto('/en');
  await page.waitForLoadState('domcontentloaded');

  // Ensure a clean session before signing in.
  await forceSignOut(page);

  // Navigate to sign-in page
  await page.goto('/en/sign-in');
  await page.waitForLoadState('domcontentloaded');

  // If the sign-in page redirects away, we're still signed in. Force a clean sign-out.
  if (!page.url().includes('/sign-in')) {
    emitDiagnostic('auth.sign_in.precheck.redirected', { url: page.url() }, 'warn');
    await forceSignOut(page);
    await page.goto('/en/sign-in');
    await page.waitForLoadState('domcontentloaded');
  }

  // Verify we're on sign-in page now
  const emailInput = page.getByLabel(/email/i);
  await expect(emailInput).toBeVisible({ timeout: 5000 });

  // Fill sign-in form
  await emailInput.fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await waitForNextBuildToSettle(page, 'sign-in-submit');

  for (let step = 0; step < 4; step += 1) {
    const authState = await waitForActionableAuthState(
      step === 0 ? 'sign-in-initial' : `sign-in-step-${step + 1}`,
      authReadinessTimeoutMs,
    );

    if (authState.status === 'role-modal') {
      emitDiagnostic('auth.sign_in.role_modal.visible', { role: options?.role || 'organizer' });
      const role = options?.role || 'organizer';
      const roleName = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
      const roleButton = page.locator('button').filter({ hasText: roleName }).first();
      await expect(roleButton).toBeVisible({ timeout: 5000 });
      await roleButton.click();
      await page.getByRole('button', { name: /save roles/i }).click();
      await expect(roleModal).not.toBeVisible({ timeout: 15000 });
      await waitForNextBuildToSettle(page, 'role-modal-save');
      continue;
    }

    if (authState.status === 'profile-modal') {
      emitDiagnostic('auth.sign_in.profile_modal.visible', {});
      const completedProfile = await completeProfileCompletionModal(page);
      if (!completedProfile) {
        throw new Error('[auth] Profile completion modal was visible but could not be completed.');
      }
      await waitForNextBuildToSettle(page, 'profile-modal-continue');
      continue;
    }

    await waitForDestinationAndClosedModals('sign-in-final', authReadinessTimeoutMs);
    return;
  }

  throw new Error('[auth] Sign-in did not settle after processing auth modals.');
}

/**
 * Sign in as organizer with provided credentials
 */
export async function signInAsOrganizer(
  page: Page,
  credentials: { email: string; password: string },
) {
  return signInAsUser(page, credentials, { role: 'organizer' });
}

/**
 * Sign in as athlete with provided credentials
 */
export async function signInAsAthlete(
  page: Page,
  credentials: { email: string; password: string },
) {
  return signInAsUser(page, credentials, { role: 'athlete' });
}

/**
 * Sign out current user
 */
export async function signOut(page: Page) {
  // Click user menu and sign out
  await page.getByRole('button', { name: /test (organizer|athlete)/i }).click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await expect(page).toHaveURL('/en');
}

/**
 * Fill phone input using pressSequentially for proper validation
 */
export async function fillPhoneInput(
  page: Page,
  labelTextOrTestId: string | RegExp,
  phoneNumber: string,
) {
  // For PhoneField components, find the phone input using multiple strategies
  // The PhoneField wraps a react-phone-number-input which creates an input inside a container
  let phoneInput;

  // Strategy 1: Try data-testid first (most reliable for PhoneField component)
  if (typeof labelTextOrTestId === 'string' && !labelTextOrTestId.startsWith('^')) {
    phoneInput = page.getByTestId(`phone-input-${labelTextOrTestId}`);
    try {
      await phoneInput.waitFor({ state: 'visible', timeout: 5000 });
      await phoneInput.click();
      await phoneInput.clear();
      await phoneInput.pressSequentially(phoneNumber, { delay: 50 });
      return;
    } catch {
      // testId not found, try next strategy
    }
  }

  // Strategy 2: Find by label text and locate the input within the form field
  // This works for both old and new phone input implementations
  const labelToFind = typeof labelTextOrTestId === 'string'
    ? new RegExp(labelTextOrTestId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : labelTextOrTestId;

  // Find the label element and then find the input inside the same form field container
  const formField = page.locator('label').filter({ hasText: labelToFind }).locator('xpath=ancestor::div[1]');
  phoneInput = formField.locator('input[type="tel"], input:not([type="hidden"])').first();

  try {
    await phoneInput.waitFor({ state: 'visible', timeout: 10000 });
    await phoneInput.click();
    await phoneInput.clear();
    await phoneInput.pressSequentially(phoneNumber, { delay: 50 });
    return;
  } catch {
    // Form field approach didn't work, try fallback
  }

  // Strategy 3: Fallback - try by role/label (for native phone inputs)
  phoneInput = page.getByRole('textbox', { name: labelTextOrTestId });
  await phoneInput.click();
  await phoneInput.clear();
  await phoneInput.pressSequentially(phoneNumber, { delay: 50 });
}

async function fillPhoneInputWithin(
  root: Page | Locator,
  labelTextOrTestId: string | RegExp,
  phoneNumber: string,
) {
  let phoneInput;

  if (typeof labelTextOrTestId === 'string' && !labelTextOrTestId.startsWith('^')) {
    phoneInput = root.getByTestId(`phone-input-${labelTextOrTestId}`);
    try {
      await phoneInput.waitFor({ state: 'visible', timeout: 5000 });
      await phoneInput.click();
      await phoneInput.clear();
      await phoneInput.pressSequentially(phoneNumber, { delay: 50 });
      return;
    } catch {
      // testId not found, try next strategy
    }
  }

  const labelToFind =
    typeof labelTextOrTestId === 'string'
      ? new RegExp(labelTextOrTestId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : labelTextOrTestId;

  const formField = root.locator('label').filter({ hasText: labelToFind }).locator('xpath=ancestor::div[1]');
  phoneInput = formField.locator('input[type="tel"], input:not([type="hidden"])').first();

  try {
    await phoneInput.waitFor({ state: 'visible', timeout: 10000 });
    await phoneInput.click();
    await phoneInput.clear();
    await phoneInput.pressSequentially(phoneNumber, { delay: 50 });
    return;
  } catch {
    // Form field approach didn't work, try fallback
  }

  phoneInput = root.getByRole('textbox', { name: labelTextOrTestId });
  await phoneInput.click();
  await phoneInput.clear();
  await phoneInput.pressSequentially(phoneNumber, { delay: 50 });
}

type ProfileCompletionModalOptions = {
  phone?: string;
  city?: string;
  state?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  shirtSize?: string;
};

export async function completeProfileCompletionModal(
  page: Page,
  options?: ProfileCompletionModalOptions,
) {
  const modalTitle = page.getByText('Complete your profile to continue');
  const isVisible = await modalTitle.isVisible({ timeout: 2000 }).catch(() => false);
  if (!isVisible) {
    return false;
  }

  const profileDialog = page
    .locator('[role="dialog"], [data-slot="dialog-content"]')
    .filter({ has: modalTitle })
    .first();
  const saveButton = profileDialog.getByRole('button', { name: /continue|save|submit/i }).first();

  const shirtSizeSelect = profileDialog.getByRole('combobox', { name: /shirt size/i });
  if (await shirtSizeSelect.isVisible().catch(() => false)) {
    const shirtSizeValue = await shirtSizeSelect.inputValue().catch(() => '');
    const nextShirtSize = (options?.shirtSize ?? shirtSizeValue) || 'm';
    if (shirtSizeValue !== nextShirtSize) {
      await shirtSizeSelect.selectOption(nextShirtSize);
    }
  }

  const cityInput = profileDialog.getByLabel(/^city$/i);
  if (await cityInput.isVisible().catch(() => false)) {
    const cityValue = await cityInput.inputValue().catch(() => '');
    const nextCity = (options?.city ?? cityValue) || 'Mexico City';
    if (cityValue !== nextCity) {
      await cityInput.fill(nextCity);
    }
  }

  const stateInput = profileDialog.getByLabel(/^state$/i);
  if (await stateInput.isVisible().catch(() => false)) {
    const stateValue = await stateInput.inputValue().catch(() => '');
    const nextState = (options?.state ?? stateValue) || 'CDMX';
    if (stateValue !== nextState) {
      await stateInput.fill(nextState);
    }
  }

  const phoneInput = profileDialog.getByLabel(/^phone$/i);
  if (await phoneInput.isVisible().catch(() => false)) {
    const phoneValue = await phoneInput.inputValue().catch(() => '');
    const nextPhone = (options?.phone ?? phoneValue) || '+523312345678';
    if (options?.phone || !phoneValue) {
      await fillPhoneInputWithin(profileDialog, /^phone$/i, nextPhone);
    }
  }

  const emergencyNameInput = profileDialog.getByLabel(/emergency.*name/i);
  if (await emergencyNameInput.isVisible().catch(() => false)) {
    const emergencyNameValue = await emergencyNameInput.inputValue().catch(() => '');
    const nextEmergencyName = (options?.emergencyName ?? emergencyNameValue) || 'Test Contact';
    if (emergencyNameValue !== nextEmergencyName) {
      await emergencyNameInput.fill(nextEmergencyName);
    }
  }

  const emergencyPhoneInput = profileDialog.getByLabel(/emergency.*phone/i);
  if (await emergencyPhoneInput.isVisible().catch(() => false)) {
    const emergencyPhoneValue = await emergencyPhoneInput.inputValue().catch(() => '');
    const nextEmergencyPhone = (options?.emergencyPhone ?? emergencyPhoneValue) || '+523387654321';
    if (options?.emergencyPhone || !emergencyPhoneValue) {
      await fillPhoneInputWithin(
        profileDialog,
        /emergency.*phone/i,
        nextEmergencyPhone,
      );
    }
  }

  await saveButton.click();
  await expect(modalTitle).not.toBeVisible({ timeout: 15000 });
  return true;
}

// Profile completion functions removed - profiles are now created via DB in beforeAll hooks

/**
 * Create organization
 */
export async function createOrganization(page: Page, name?: string): Promise<string> {
  const timestamp = Date.now();
  const orgName = name || `Test Org ${timestamp}`;
  const orgSlug = orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const createNewOrgBtn = page.getByRole('button', { name: /create new organization/i });
  const orgNameInput = page.getByPlaceholder(/my race organization/i);

  // Check if already on org step or need to navigate
  const isOnEventCreation = page.url().includes('/events/new');
  if (!isOnEventCreation) {
    await page.goto('/en/dashboard/events/new');
  }

  await expect
    .poll(
      async () =>
        (await createNewOrgBtn.isVisible().catch(() => false)) ||
        (await orgNameInput.isVisible().catch(() => false)),
      { timeout: 15000 },
    )
    .toBe(true);

  // Check if the user already has organizations - if so, click "Create new organization"
  if (await createNewOrgBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createNewOrgBtn.click();
    await page.waitForTimeout(300);
  }

  // Wait for org name input to be visible
  await expect(orgNameInput).toBeVisible({ timeout: 10000 });

  // Fill organization name
  await orgNameInput.click();
  await orgNameInput.fill(orgName);

  // Fill slug manually (Playwright doesn't trigger React onChange for auto-generation)
  const slugInput = page.getByPlaceholder(/my-organization/i);
  await slugInput.click();
  await slugInput.fill(orgSlug);

  // Wait for form state to update
  await page.waitForTimeout(500);

  // Continue to event details (wait for button to be enabled)
  const continueBtn = page.getByRole('button', { name: /continue/i });
  await expect(continueBtn).toBeEnabled({ timeout: 5000 });
  await continueBtn.click();

  // Wait for step 2 to be visible
  await expect(page.getByText(/event details/i).first()).toBeVisible({ timeout: 5000 });

  return orgName;
}

/**
 * Create event with basic details
 */
export async function createEvent(
  page: Page,
  options?: {
    seriesName?: string;
    editionLabel?: string;
    eventDate?: string;
    sportType?: string;
    city?: string;
    state?: string;
  },
): Promise<{ seriesName: string; editionLabel: string; eventId: string }> {
  const timestamp = Date.now();
  const seriesName = options?.seriesName || `E2E Test Event ${timestamp}`;
  const seriesSlug = seriesName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const editionLabel = options?.editionLabel || '2026';
  const eventDate =
    options?.eventDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const city = options?.city || 'Monterrey';
  const state = options?.state || 'Nuevo León';

  // Wait for event details step to be visible
  await expect(page.getByText(/event details/i).first()).toBeVisible({ timeout: 10000 });

  // Fill event series name using placeholder
  const seriesNameInput = page.getByPlaceholder(/ultra trail mexico/i);
  await seriesNameInput.click();
  await seriesNameInput.fill(seriesName);

  // Fill series slug manually (Playwright doesn't trigger React onChange)
  const seriesSlugInput = page.getByPlaceholder(/ultra-trail-mx/i);
  await seriesSlugInput.click();
  await seriesSlugInput.fill(seriesSlug);

  // Fill edition label
  const editionLabelInput = page.getByPlaceholder('2025').first();
  await editionLabelInput.click();
  await editionLabelInput.fill(editionLabel);

  // Fill edition slug (same as edition label for simplicity)
  const editionSlugInput = page.getByPlaceholder('2025').last();
  await editionSlugInput.click();
  await editionSlugInput.fill(editionLabel.toLowerCase());

  // Fill location using the new LocationField component
  // Click the location picker button
  const locationBtn = page.getByText(/no location selected yet/i);
  await locationBtn.click();

  // Wait for location dialog to appear
  const locationDialog = page.getByRole('dialog');
  await expect(locationDialog).toBeVisible({ timeout: 5000 });

  // Search for the location in the search input
  const searchInput = locationDialog.getByPlaceholder(/search for a place or address/i);
  await searchInput.fill(`${city}, ${state}, Mexico`);

  // Wait for and click the first search result
  const firstResult = locationDialog.locator('button').filter({ hasText: city }).first();
  await expect(firstResult).toBeVisible({ timeout: 10000 });
  await firstResult.click();

  // Confirm the location selection
  const confirmBtn = locationDialog.getByRole('button', { name: /use this location/i });
  await confirmBtn.click();

  // Select future date if date field is visible
  const dateInput = page.locator('input[type="date"]');
  if (await dateInput.isVisible().catch(() => false)) {
    await dateInput.fill(eventDate);
  } else {
    // Standard UI is `DatePicker` (popover + calendar), not native input[type="date"].
    const eventDateField = page
      .locator('label')
      .filter({ hasText: /event date|fecha del evento/i })
      .first();
    const trigger = eventDateField.locator('button').first();
    if (await trigger.isVisible().catch(() => false)) {
      const localeFromUrl = new URL(page.url()).pathname.split('/')[1] || 'en';
      await setDatePickerValue(page, trigger, eventDate, localeFromUrl);
    }
  }

  // Wait for Next.js compilation/rendering to complete if it's running
  // Look for "Compiling" or "Rendering" text in the dev tools indicator
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    console.log('[E2E] Waiting for Next.js build to complete...');
    await expect(buildIndicator).not.toBeVisible({ timeout: 60000 });
  }

  // Create event - increased timeout to 30s to handle slow compilation
  await expect(page.getByRole('button', { name: /create event/i })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: /create event/i }).click();

  // Next will often start compiling the destination route after submit
  if (await buildIndicator.isVisible().catch(() => false)) {
    console.log('[E2E] Waiting for Next.js build after event submit...');
    await expect(buildIndicator).not.toBeVisible({ timeout: 60000 });
  }

  // Next App Router transitions do not guarantee a new document "load" event.
  // Wait for the URL contract itself instead of waiting on navigation load-state semantics.
  const eventRoutePattern =
    /\/(?:en\/)?(?:dashboard\/events|tablero\/eventos)\/([a-f0-9-]{36})(?:\/|$)/i;
  await expect
    .poll(() => page.url(), { timeout: 90000 })
    .toMatch(eventRoutePattern);

  // Extract event ID from URL
  const url = page.url();
  const eventId = url.match(eventRoutePattern)?.[1] || '';

  return { seriesName, editionLabel, eventId };
}

async function setDatePickerValue(page: Page, trigger: Locator, isoDate: string, locale: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Invalid isoDate (expected YYYY-MM-DD): ${isoDate}`);

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthLabel = new Date(year, monthIndex, 1).toLocaleString(locale, { month: 'long' });

  await trigger.click();

  const popover = page
    .locator('[data-slot="popover-content"]')
    .filter({ has: page.locator('[data-slot="calendar"]') })
    .last();
  await expect(popover).toBeVisible();

  const calendar = popover.locator('[data-slot="calendar"]');
  await expect(calendar).toBeVisible();

  const selects = calendar.locator('select');
  const selectCount = await selects.count();

  const trySelectByLabel = async (label: string) => {
    for (let index = 0; index < selectCount; index += 1) {
      const select = selects.nth(index);
      if ((await select.locator('option', { hasText: label }).count()) > 0) {
        await select.selectOption({ label });
        return true;
      }
    }
    return false;
  };

  // Set year/month via DayPicker dropdowns (captionLayout="dropdown").
  await trySelectByLabel(String(year));
  await trySelectByLabel(monthLabel);

  const dayRegex = new RegExp(`^${day}$`);
  const dayButtonInMonth = calendar
    .locator('td:not([data-outside]) button', { hasText: dayRegex })
    .first();
  const fallbackDayButton = calendar.locator('button', { hasText: dayRegex }).first();

  if (await dayButtonInMonth.isVisible().catch(() => false)) {
    await dayButtonInMonth.click();
  } else {
    await fallbackDayButton.click();
  }

  await expect(popover).toBeHidden();
}

/**
 * Navigate to event settings
 */
export async function navigateToEventSettings(page: Page, eventId: string) {
  await page.goto(`/en/dashboard/events/${eventId}/settings`);

  // Wait for Next.js compilation/rendering to complete
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    console.log('[E2E] Waiting for Next.js build on settings page...');
    await expect(buildIndicator).not.toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1000);
  }

  await expect(page).toHaveURL(/\/settings(?:\?.*)?$/, { timeout: 30000 });

  // Ensure at least one stable settings anchor is visible before continuing.
  const detailsHeading = page.getByRole('heading', { name: /details|detalles/i }).first();
  const visibilityHeading = page
    .getByRole('heading', { name: /event visibility|visibility|visibilidad/i })
    .first();
  const addDistanceButton = page
    .getByRole('button', { name: /add distance|agregar distancia/i })
    .first();

  await expect
    .poll(
      async () =>
        (await detailsHeading.isVisible().catch(() => false)) ||
        (await visibilityHeading.isVisible().catch(() => false)) ||
        (await addDistanceButton.isVisible().catch(() => false)),
      { timeout: 30000 },
    )
    .toBe(true);
}

/**
 * Add distance to event
 */
export async function addDistance(
  page: Page,
  options: {
    label: string;
    distance: number;
    terrain?: string;
    price: number;
    capacity: number;
  },
) {
  const { label, distance, terrain, price, capacity } = options;
  const editionId = page.url().match(/\/dashboard\/events\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];
  const db = editionId ? getTestDb() : null;
  const distancesHeading = () => page.getByRole('heading', { name: /distances|distancias/i }).first();
  const distancesSection = () => distancesHeading().locator('xpath=ancestor::section[1]');
  const distancesStepButton = () => page.getByRole('button', { name: /distances|distancias/i }).first();
  const manualSetupButton = () =>
    page.getByRole('button', { name: /manual setup|configuraci[oó]n manual/i }).first();
  const manualPathHint = () =>
    page
      .getByText(/manual path selected|ruta manual seleccionada/i)
      .first();
  const addDistanceBtn = () =>
    distancesSection().getByRole('button', { name: /add distance|agregar distancia/i }).first();
  const labelInput = () => distancesSection().locator('input[name="label"]:visible').first();
  const distanceInput = () => distancesSection().locator('input[name="distanceValue"]:visible').first();
  const terrainSelect = () => distancesSection().locator('select[name="terrain"]:visible').first();
  const priceInput = () => distancesSection().locator('input[name="price"]:visible').first();
  const capacityInput = () => distancesSection().locator('input[name="capacity"]:visible').first();
  const submitBtn = () =>
    distancesSection()
      .locator('button[type="submit"]')
      .filter({ hasText: /add distance|agregar distancia/i })
      .first();
  const distanceLabel = () =>
    distancesSection().getByRole('heading', { name: label, exact: true }).first();

  const isDomDetachError = (error: unknown): error is Error =>
    error instanceof Error && /(not attached|detached|removed from the dom)/i.test(error.message);

  const retryOnDomDetach = async (action: () => Promise<void>) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await action();
        return;
      } catch (error) {
        if (!isDomDetachError(error) || attempt === 2) {
          throw error;
        }
        await page.waitForTimeout(150);
      }
    }
  };

  const persistedDistanceExists = async () =>
    db && editionId
      ? Boolean(
          await db.query.eventDistances.findFirst({
            where: and(
              eq(eventDistances.editionId, editionId),
              eq(eventDistances.label, label),
              isNull(eventDistances.deletedAt),
            ),
            columns: { id: true },
          }),
        )
      : false;

  const isDistanceEditorVisible = async () =>
    (await distancesHeading().isVisible().catch(() => false)) ||
    (await addDistanceBtn().isVisible().catch(() => false)) ||
    (await submitBtn().isVisible().catch(() => false));

  if (!(await isDistanceEditorVisible())) {
    const manualButton = manualSetupButton();
    if (await manualButton.isVisible().catch(() => false)) {
      await retryOnDomDetach(async () => {
        await manualButton.click();
      });
      await expect(manualPathHint()).toBeVisible({ timeout: 10000 });
    }
  }

  if (!(await isDistanceEditorVisible())) {
    const stepButton = distancesStepButton();
    if (await stepButton.isVisible().catch(() => false)) {
      await retryOnDomDetach(async () => {
        await stepButton.click();
      });
    }
  }

  await expect
    .poll(
      async () => isDistanceEditorVisible(),
      { timeout: 30000 },
    )
    .toBe(true);

  if (await distancesHeading().isVisible({ timeout: 1000 }).catch(() => false)) {
    await retryOnDomDetach(async () => {
      await distancesHeading().scrollIntoViewIfNeeded();
    });
  } else {
    await retryOnDomDetach(async () => {
      await addDistanceBtn().scrollIntoViewIfNeeded();
    });
  }

  // Check if form is already visible using the form's input name attribute.
  if (!(await submitBtn().isVisible({ timeout: 1000 }).catch(() => false))) {
    await expect(addDistanceBtn()).toBeVisible({ timeout: 10000 });
    await expect(addDistanceBtn()).toBeEnabled({ timeout: 10000 });
    await retryOnDomDetach(async () => {
      await addDistanceBtn().click();
    });
    await expect(submitBtn()).toBeVisible({ timeout: 10000 });
    await expect(labelInput()).toBeVisible({ timeout: 10000 });
  }

  // Fill the form using name attributes (most reliable selector)
  await retryOnDomDetach(async () => {
    await labelInput().fill(label);
  });
  await retryOnDomDetach(async () => {
    await distanceInput().fill(distance.toString());
  });

  if (terrain) {
    await retryOnDomDetach(async () => {
      await terrainSelect().selectOption(terrain);
    });
  }

  await retryOnDomDetach(async () => {
    await priceInput().fill(price.toString());
  });
  await retryOnDomDetach(async () => {
    await capacityInput().fill(capacity.toString());
  });

  await expect(submitBtn()).toBeVisible({ timeout: 5000 });
  await expect(submitBtn()).toBeEnabled({ timeout: 5000 });

  await retryOnDomDetach(async () => {
    await submitBtn().click();
  });

  // Wait for the server action to persist the new distance first, then wait for
  // the client state to render the new card before returning control to tests.
  if (db && editionId) {
    await expect.poll(persistedDistanceExists, { timeout: 15000 }).toBe(true);
  }
  await expect
    .poll(async () => distanceLabel().isVisible().catch(() => false), { timeout: 15000 })
    .toBe(true);
}

/**
 * Publish event (change visibility to Published)
 */
export async function publishEvent(page: Page) {
  // Wait for Next.js compilation/rendering to complete if it's running
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    console.log('[E2E] Waiting for Next.js build before publishing...');
    await expect(buildIndicator).not.toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1000);
  }

  // Scroll to visibility section first.
  const visibilityHeading = page
    .getByRole('heading', { name: /event visibility|visibilidad del evento|visibility/i })
    .first();
  await expect(visibilityHeading).toBeVisible({ timeout: 30000 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await visibilityHeading.scrollIntoViewIfNeeded();
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(300);
    }
  }

  const visibilitySection = visibilityHeading.locator('xpath=ancestor::section[1]');
  const publishedBtn = visibilitySection.getByRole('button', { name: /published|publicado/i }).first();
  await expect(publishedBtn).toBeVisible({ timeout: 15000 });
  await expect(publishedBtn).toBeEnabled({ timeout: 15000 });

  const editionId = page.url().match(/\/dashboard\/events\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];
  const publishedSelectedIndicator = publishedBtn.locator('svg');
  const db = editionId ? getTestDb() : null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!(await publishedSelectedIndicator.isVisible({ timeout: 1000 }).catch(() => false))) {
      await publishedBtn.click();
    }

    try {
      if (db && editionId) {
        await expect
          .poll(
            async () => {
              const edition = await db.query.eventEditions.findFirst({
                where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
                columns: { visibility: true },
              });
              return edition?.visibility ?? null;
            },
            { timeout: 15000 },
          )
          .toBe('published');
      }

      await expect(publishedSelectedIndicator).toBeVisible({ timeout: 15000 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Pause event registration
 */
export async function pauseRegistration(page: Page) {
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    console.log('[E2E] Waiting for Next.js build before pausing registration...');
    await expect(buildIndicator).not.toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1000);
  }

  const registrationHeading = page.getByRole('heading', { name: 'Registration Status' });
  await expect(registrationHeading).toBeVisible({ timeout: 15000 });
  await registrationHeading.scrollIntoViewIfNeeded();

  const registrationSection = registrationHeading.locator('xpath=ancestor::section[1]');
  const pauseBtn = registrationSection.getByRole('button', { name: /pause registration/i });
  await expect(pauseBtn).toBeVisible({ timeout: 15000 });
  await expect(pauseBtn).toBeEnabled();

  // Retry once if the click happens during a re-render and the action doesn't fire.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await pauseBtn.click();

    // Wait for any refresh/build to settle, then verify state changed.
    await expect(buildIndicator).toBeHidden({ timeout: 60000 });

    const pausedBadge = registrationSection.getByText(/^Paused$/);
    try {
      await expect(pausedBadge).toBeVisible({ timeout: 30000 });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(500);
    }
  }

  const resumeBtn = registrationSection.getByRole('button', { name: /resume registration/i });
  await expect(resumeBtn).toBeVisible({ timeout: 15000 });
}

/**
 * Resume event registration
 */
export async function resumeRegistration(page: Page) {
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    console.log('[E2E] Waiting for Next.js build before resuming registration...');
    await expect(buildIndicator).not.toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1000);
  }

  const registrationHeading = page.getByRole('heading', { name: 'Registration Status' });
  await expect(registrationHeading).toBeVisible({ timeout: 15000 });
  await registrationHeading.scrollIntoViewIfNeeded();

  const registrationSection = registrationHeading.locator('xpath=ancestor::section[1]');
  const resumeBtn = registrationSection.getByRole('button', { name: /resume registration/i });
  await expect(resumeBtn).toBeVisible({ timeout: 15000 });
  await expect(resumeBtn).toBeEnabled();

  // Retry once if the click happens during a re-render and the action doesn't fire.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await resumeBtn.click();

    // Wait for any refresh/build to settle, then verify state changed.
    await expect(buildIndicator).toBeHidden({ timeout: 60000 });

    const activeBadge = registrationSection.getByText(/^Active$/);
    try {
      await expect(activeBadge).toBeVisible({ timeout: 30000 });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(500);
    }
  }

  const pauseBtn = registrationSection.getByRole('button', { name: /pause registration/i });
  await expect(pauseBtn).toBeVisible({ timeout: 15000 });
}

/**
 * Navigate to public event page
 */
export async function navigateToPublicEventPage(
  page: Page,
  seriesSlug: string,
  editionSlug: string,
) {
  await page.goto(`/en/events/${seriesSlug}/${editionSlug}`);
}

/**
 * Complete registration form
 */
export async function completeRegistrationForm(
  page: Page,
  options?: {
    phone?: string;
    dob?: string;
    gender?: string;
    emergencyName?: string;
    emergencyPhone?: string;
  },
) {
  const phone = options?.phone || '+523318887777';
  const dob = options?.dob || '1990-05-15';
  const gender = options?.gender || 'male';
  const emergencyName = options?.emergencyName || 'Maria Lopez';
  const emergencyPhone = options?.emergencyPhone || '+523319998888';
  const continueButton = page.getByRole('button', { name: /continue/i });
  const phoneTextbox = page.locator('input[type="tel"]').first();

  // The registration step can render before the form controls become interactive.
  await expect(continueButton).toBeEnabled({ timeout: 15000 });
  await expect(phoneTextbox).toBeEnabled({ timeout: 15000 });

  // Fill phone - use label text that matches the form field
  // The PhoneField uses "Phone number" or similar label text
  await fillPhoneInput(page, /phone\s*number/i, phone);

  // Fill date of birth - the DatePicker component uses a hidden input with name="dateOfBirth"
  // If the date is already pre-filled from user profile and matches, skip it
  // Otherwise, we need to set it via the hidden input or interact with the popover
  const dobHiddenInput = page.locator('input[name="dateOfBirth"][type="hidden"]');
  const currentDobValue = await dobHiddenInput.inputValue().catch(() => '');

  if (currentDobValue !== dob) {
    // Try to set the hidden input value via JavaScript (most reliable for DatePicker)
    await page.evaluate((date) => {
      const input = document.querySelector('input[name="dateOfBirth"]') as HTMLInputElement;
      if (input) {
        input.value = date;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, dob);
  }
  // If the date is already set (from profile), just proceed

  // Select gender (GenderField still uses a select element)
  await page.getByRole('combobox', { name: /gender/i }).selectOption(gender);

  // Fill emergency contact name
  await page.getByRole('textbox', { name: /emergency.*name/i }).fill(emergencyName);

  // Fill emergency phone - use label text that matches the form field
  await fillPhoneInput(page, /emergency.*phone/i, emergencyPhone);

  // Continue
  await continueButton.click();

  // Check for either waiver or payment heading (events may or may not have waivers)
  const waiverHeading = page.getByRole('heading', { name: /waiver/i });
  const paymentHeading = page.getByRole('heading', { name: /payment/i });
  await expect(waiverHeading.or(paymentHeading)).toBeVisible({ timeout: 10000 });
}

/**
 * Extract registration ID from confirmation page
 */
export async function extractRegistrationId(page: Page): Promise<string> {
  // Wait for confirmation page
  await expect(page.getByText(/registration complete/i)).toBeVisible();

  // Find ticket code (formerly "Registration ID") and get the adjacent value.
  const ticketCodeLabel = page.getByText(/ticket code|registration id/i);
  await expect(ticketCodeLabel).toBeVisible();

  // The ID is in a sibling paragraph - get parent container and find the 8-char ID
  const container = ticketCodeLabel.locator('..').locator('..');
  const ticketCodeElement = container
    .locator('p')
    .filter({ hasText: /^RG-[0-9A-Z]{4}-[0-9A-Z]{4}$/ })
    .first();

  let ticketCode = await ticketCodeElement.textContent().catch(() => null);

  // Fallback: look for ticket code pattern in any element
  if (!ticketCode) {
    const allText = await page.locator('p, span, div').allTextContents();
    ticketCode = allText.find(text => /^RG-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(text.trim())) || '';
  }

  return ticketCode?.trim() || '';
}
