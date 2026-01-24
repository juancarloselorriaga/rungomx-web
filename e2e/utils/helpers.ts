import { Page, expect } from '@playwright/test';

/**
 * Test helper utilities for RunGoMX E2E tests
 */

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
  options?: { role?: 'organizer' | 'athlete' | 'volunteer' },
) {
  // Navigate to sign-in page
  await page.goto('/en/sign-in');

  // Wait for navigation to complete
  await page.waitForLoadState('networkidle');

  // Check if already signed in (redirected to dashboard or home)
  const currentUrl = page.url();
  const isOnSignInPage = currentUrl.includes('/sign-in');

  if (!isOnSignInPage) {
    // Already signed in - need to check if it's the right user
    const expectedUserPrefix = credentials.email.split('@')[0].toLowerCase();

    // Look for user button - it could be anywhere in the page
    // The button typically shows the user's name like "Test Organizer" or "Test Athlete"
    const userButton = page.getByRole('button').filter({
      hasText: /Test|Organizer|Athlete/i,
    }).first();

    const userButtonVisible = await userButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (userButtonVisible) {
      const buttonText = (await userButton.textContent().catch(() => '')) || '';
      const buttonTextLower = buttonText.toLowerCase();

      // Check user type based on email prefix
      // Email format is like: "athlete-reg-123@...", "org-capacity-123@..."
      const isAthleteExpected = expectedUserPrefix.startsWith('athlete');
      const isOrganizerExpected = expectedUserPrefix.startsWith('org');

      // Button will show name like "Capacity Test Athlete" or "Capacity Test Organizer"
      const isAthleteSignedIn = buttonTextLower.includes('athlete');
      const isOrganizerSignedIn = buttonTextLower.includes('organizer');

      // Check if signed in as the correct user type
      const isCorrectUser =
        (isAthleteExpected && isAthleteSignedIn) ||
        (isOrganizerExpected && isOrganizerSignedIn);

      // If signed in as different user, sign out first
      if (!isCorrectUser) {
        // Clear all storage and cookies
        await page.context().clearCookies();
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });

        // Navigate to home page first to get clean state
        await page.goto('/en');
        await page.waitForLoadState('networkidle');

        // Check if still signed in - if so, need to call sign-out API
        const stillSignedIn = await page.getByRole('button').filter({
          hasText: /Test|Organizer|Athlete/i,
        }).first().isVisible({ timeout: 2000 }).catch(() => false);

        if (stillSignedIn) {
          // Call sign-out API
          await page.evaluate(async () => {
            await fetch('/api/auth/sign-out', {
              method: 'POST',
              credentials: 'include',
            });
          });
          await page.waitForTimeout(500);
          await page.context().clearCookies();
        }

        // Navigate to sign-in page
        await page.goto('/en/sign-in');
        await page.waitForLoadState('networkidle');
      } else {
        // Already signed in as the correct user
        return;
      }
    } else {
      // On a page but no user button - might be logged out, navigate to sign-in
      await page.goto('/en/sign-in');
      await page.waitForLoadState('networkidle');
    }
  }

  // Verify we're on sign-in page now
  const emailInput = page.getByLabel(/email/i);
  await expect(emailInput).toBeVisible({ timeout: 5000 });

  // Fill sign-in form
  await emailInput.fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for Next.js compilation/rendering to complete if it's running
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    console.log('[E2E] Waiting for Next.js build after sign-in...');
    await expect(buildIndicator).not.toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1000);
  }

  // Wait for successful sign in (may go to dashboard or settings)
  await page.waitForURL(/\/(dashboard|settings)/, { timeout: 45000 });

  // Handle role selection modal for new users (may take time to appear)
  await page.waitForTimeout(500); // Give modal time to appear
  const roleModal = page.getByText('Choose your role to continue');
  if (await roleModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    const role = options?.role || 'organizer';
    // Click the role card - find the button containing the role name
    const roleName = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    // The role cards are buttons with text like "Organizer" inside a span
    const roleButton = page.locator('button').filter({ hasText: roleName }).first();
    await roleButton.click();
    // Wait a moment for the selection to register
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /save roles/i }).click();
    // Wait for the server action to complete and modal to close
    await page.waitForLoadState('networkidle');
    // Allow extra time for modal to close
    await expect(roleModal).not.toBeVisible({ timeout: 15000 });
  }

  // Handle profile completion modal if it appears
  await page.waitForTimeout(300);
  const profileModal = page.getByText('Complete your profile to continue');
  if (await profileModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Profile data is already set via database fixtures
    // The modal should have all fields pre-filled, just click Save
    const saveBtn = page.getByRole('button', { name: /save/i });

    // First attempt: Try clicking Save directly
    if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(500);

      // Check if modal closed
      if (!(await profileModal.isVisible({ timeout: 2000 }).catch(() => false))) {
        await page.waitForLoadState('networkidle');
        return; // Profile saved successfully
      }
    }

    // If modal still visible, there might be validation errors - fill missing fields

    // Fill shirt size if empty/not selected (common required field)
    const shirtSizeSelect = page.getByRole('combobox', { name: /shirt size/i });
    if (await shirtSizeSelect.isVisible().catch(() => false)) {
      await shirtSizeSelect.selectOption('M');
    }

    // Fill city if empty
    const cityInput = page.getByLabel(/^city$/i);
    if (await cityInput.isVisible().catch(() => false)) {
      const cityValue = await cityInput.inputValue().catch(() => '');
      if (!cityValue) {
        await cityInput.fill('Mexico City');
      }
    }

    // Fill state if empty
    const stateInput = page.getByLabel(/^state$/i);
    if (await stateInput.isVisible().catch(() => false)) {
      const stateValue = await stateInput.inputValue().catch(() => '');
      if (!stateValue) {
        await stateInput.fill('CDMX');
      }
    }

    // Fill phone if empty
    const phoneInput = page.getByLabel(/^phone$/i);
    if (await phoneInput.isVisible().catch(() => false)) {
      const phoneValue = await phoneInput.inputValue().catch(() => '');
      if (!phoneValue) {
        await phoneInput.fill('+523312345678');
      }
    }

    // Fill emergency contact name if empty
    const emergNameInput = page.getByLabel(/emergency.*name/i);
    if (await emergNameInput.isVisible().catch(() => false)) {
      const emergNameValue = await emergNameInput.inputValue().catch(() => '');
      if (!emergNameValue) {
        await emergNameInput.fill('Test Contact');
      }
    }

    // Fill emergency contact phone if empty
    const emergPhoneInput = page.getByLabel(/emergency.*phone/i);
    if (await emergPhoneInput.isVisible().catch(() => false)) {
      const emergPhoneValue = await emergPhoneInput.inputValue().catch(() => '');
      if (!emergPhoneValue) {
        await emergPhoneInput.fill('+523387654321');
      }
    }

    // Submit the form again after filling fields
    const continueBtn = page.getByRole('button', { name: /continue|save|submit/i });
    if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await continueBtn.click();
      await expect(profileModal).not.toBeVisible({ timeout: 15000 });
      await page.waitForLoadState('networkidle');
    }
  }
}

/**
 * Sign in as organizer with provided credentials
 */
export async function signInAsOrganizer(
  page: Page,
  credentials: { email: string; password: string },
) {
  return signInAsUser(page, credentials);
}

/**
 * Sign in as athlete with provided credentials
 */
export async function signInAsAthlete(
  page: Page,
  credentials: { email: string; password: string },
) {
  return signInAsUser(page, credentials);
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

// Profile completion functions removed - profiles are now created via DB in beforeAll hooks

/**
 * Create organization
 */
export async function createOrganization(page: Page, name?: string): Promise<string> {
  const timestamp = Date.now();
  const orgName = name || `Test Org ${timestamp}`;
  const orgSlug = orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Check if already on org step or need to navigate
  const isOnEventCreation = page.url().includes('/events/new');
  if (!isOnEventCreation) {
    await page.goto('/en/dashboard/events/new');
  }

  // Wait for page to be fully loaded
  await page.waitForLoadState('networkidle');

  // Check if the user already has organizations - if so, click "Create new organization"
  const createNewOrgBtn = page.getByRole('button', { name: /create new organization/i });
  if (await createNewOrgBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createNewOrgBtn.click();
    await page.waitForTimeout(300);
  }

  // Wait for org name input to be visible
  const orgNameInput = page.getByPlaceholder(/my race organization/i);
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
    sportType?: string;
    city?: string;
    state?: string;
  },
): Promise<{ seriesName: string; editionLabel: string; eventId: string }> {
  const timestamp = Date.now();
  const seriesName = options?.seriesName || `E2E Test Event ${timestamp}`;
  const seriesSlug = seriesName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const editionLabel = options?.editionLabel || '2026';
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
  await page.waitForTimeout(500); // Wait for debounced search
  const firstResult = locationDialog.locator('button').filter({ hasText: city }).first();
  await expect(firstResult).toBeVisible({ timeout: 10000 });
  await firstResult.click();

  // Confirm the location selection
  const confirmBtn = locationDialog.getByRole('button', { name: /use this location/i });
  await confirmBtn.click();

  // Select future date if date field is visible
  const dateInput = page.locator('input[type="date"]');
  if (await dateInput.isVisible().catch(() => false)) {
    await dateInput.fill('2026-06-15');
  }

  // Wait for Next.js compilation/rendering to complete if it's running
  // Look for "Compiling" or "Rendering" text in the dev tools indicator
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    console.log('[E2E] Waiting for Next.js build to complete...');
    await expect(buildIndicator).not.toBeVisible({ timeout: 60000 });
    // Extra wait after build completes for the page to stabilize
    await page.waitForTimeout(1000);
  }

  // Wait for form to be ready and button to be enabled
  await page.waitForTimeout(300);

  // Create event - increased timeout to 30s to handle slow compilation
  await expect(page.getByRole('button', { name: /create event/i })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: /create event/i }).click();

  // Wait for redirect to event dashboard
  await page.waitForURL(/\/dashboard\/events\/[a-f0-9-]{36}/, { timeout: 45000 });

  // Extract event ID from URL
  const url = page.url();
  const eventId = url.match(/\/events\/([a-f0-9-]{36})/)?.[1] || '';

  return { seriesName, editionLabel, eventId };
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

  await expect(page).toHaveURL(/\/settings$/, { timeout: 30000 });
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

  // Wait for the Distances heading to be visible before scrolling
  const distancesHeading = page.getByRole('heading', { name: 'Distances' });
  await expect(distancesHeading).toBeVisible({ timeout: 15000 });

  // Scroll to the Distances section and wait for page to settle
  await distancesHeading.scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');

  // Check if form is already visible using the form's input name attribute
  const labelInput = page.locator('input[name="label"]');
  if (!(await labelInput.isVisible({ timeout: 1000 }).catch(() => false))) {
    // Click the "Add Distance" button in the section header
    // Use locator chain to find button with "Add Distance" text
    const addDistanceBtn = page.locator('section').filter({ hasText: 'Distances' }).getByRole('button', { name: 'Add Distance' });
    await addDistanceBtn.click();
    await expect(labelInput).toBeVisible({ timeout: 5000 });
  }

  // Fill the form using name attributes (most reliable selector)
  await labelInput.fill(label);
  await page.locator('input[name="distanceValue"]').fill(distance.toString());

  if (terrain) {
    await page.locator('select[name="terrain"]').selectOption(terrain);
  }

  await page.locator('input[name="price"]').fill(price.toString());
  await page.locator('input[name="capacity"]').fill(capacity.toString());

  // Click the submit button inside the distance form (has text "Add Distance")
  await page.getByRole('button', { name: 'Add Distance', exact: true }).last().click();

  // Wait for network response and form to process
  await page.waitForLoadState('networkidle');

  // Wait for the distance to appear in the list (confirms successful save)
  await expect(page.getByText(label)).toBeVisible({ timeout: 10000 });
}

/**
 * Publish event (change visibility to Published)
 */
export async function publishEvent(page: Page) {
  // Scroll to visibility section first
  await page.getByRole('heading', { name: 'Event Visibility' }).scrollIntoViewIfNeeded();

  // Wait for section to be fully loaded
  await page.waitForLoadState('networkidle');

  // Find the visibility badge - it shows current status next to the heading
  // Initially it should show "Draft"
  const visibilitySection = page.locator('section').filter({ hasText: 'Event Visibility' });

  // Click Published button in visibility section
  const publishedBtn = page.getByRole('button', { name: 'Published', exact: true });
  await publishedBtn.click();

  // Wait for the server action to complete and state to update
  // The visibility badge should change from "Draft" to "Published"
  // The badge is a span with specific styling containing the visibility text
  await expect(
    visibilitySection.locator('span').filter({ hasText: 'Published' }).first(),
  ).toBeVisible({ timeout: 15000 });
}

/**
 * Pause event registration
 */
export async function pauseRegistration(page: Page) {
  await page.getByRole('button', { name: /pause registration/i }).click();
  // Wait for network response
  await page.waitForLoadState('networkidle');
  // The badge should now show "Paused"
  const registrationSection = page.locator('section').filter({ hasText: 'Registration Status' });
  await expect(registrationSection.getByText('Paused')).toBeVisible({ timeout: 10000 });
}

/**
 * Resume event registration
 */
export async function resumeRegistration(page: Page) {
  // First, scroll to the registration section
  await page.getByRole('heading', { name: 'Registration Status' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const resumeBtn = page.getByRole('button', { name: /resume registration/i });
  await expect(resumeBtn).toBeVisible();
  await expect(resumeBtn).toBeEnabled();

  // Use force click to ensure it works even if there's an overlay
  await resumeBtn.click({ force: true });

  // Wait for the loading state to appear and disappear
  // The button shows a loading spinner while processing
  await page.waitForTimeout(500);

  // Wait for network to settle
  await page.waitForLoadState('networkidle');

  // Give React time to update state
  await page.waitForTimeout(1000);

  // After resume, the button should change to "Pause Registration"
  // and the badge should show "Active"
  const pauseBtn = page.getByRole('button', { name: /pause registration/i });

  // If button doesn't appear, try reloading the page to get fresh state
  const pauseBtnVisible = await pauseBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (!pauseBtnVisible) {
    // Reload page to get fresh server state
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  }

  await expect(pauseBtn).toBeVisible({ timeout: 10000 });
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
  await page.getByRole('button', { name: /continue/i }).click();

  // Wait for navigation to either waiver or payment step
  await page.waitForLoadState('networkidle');

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

/**
 * Wait for network idle (useful after form submissions)
 */
export async function waitForNetworkIdle(page: Page) {
  await page.waitForLoadState('networkidle');
}
