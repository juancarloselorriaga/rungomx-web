import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import {
  signUpTestUser,
  setUserVerified,
  getUserByEmail,
  createTestProfile,
  assignExternalRole,
} from '../utils/fixtures';
import { signInAsOrganizer } from '../utils/helpers';

/**
 * Authentication & Access Control Tests
 *
 * Tests user authentication, authorization, and access control mechanisms
 */

// File-scoped test credentials
let organizerCreds: { email: string; password: string; name: string };

test.describe('Authentication & Access Control', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create organizer user via signup
    organizerCreds = await signUpTestUser(page, 'org-auth-', {
      name: 'Auth Test Organizer',
    });

    // Bypass email verification
    await setUserVerified(db, organizerCreds.email);

    // Create complete profile
    const organizer = await getUserByEmail(db, organizerCreds.email);
    await createTestProfile(db, organizer!.id, {
      dateOfBirth: new Date('1990-05-15'),
      gender: 'male',
      phone: '+523312345678',
      city: 'Mexico City',
      state: 'CDMX',
      emergencyContactName: 'Test Contact',
      emergencyContactPhone: '+523387654321',
    });
    await assignExternalRole(db, organizer!.id, 'organizer');

    await context.close();
  });

  test('Test 0.1: Non-authenticated users cannot access protected routes', async ({
    page,
  }) => {
    // Navigate to protected route without authentication
    await page.goto('/en/dashboard/events');

    // Should redirect to sign-in page
    await expect(page).toHaveURL(/\/sign-in/);

    // Callback URL should be preserved
    expect(page.url()).toContain('callbackURL');
  });

  test('Test 0.2: Organizer can sign in successfully', async ({ page }) => {
    // Navigate to sign-in page
    await page.goto('/en/sign-in');

    // Fill credentials
    await page.getByLabel(/email/i).fill(organizerCreds.email);
    await page.getByLabel(/password/i).fill(organizerCreds.password);

    // Submit form
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // New users see a role selection modal - select Organizer role
    const roleModal = page.getByText('Choose your role to continue');
    if (await roleModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.getByRole('button', { name: /organizer/i }).click();
      await page.getByRole('button', { name: /save roles/i }).click();
      // Wait for modal to close
      await expect(roleModal).not.toBeVisible({ timeout: 5000 });
    }

    // Verify we're on the dashboard (may need to wait for navigation after role selection)
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Test 0.3: Profile completion is enforced', async ({ page }) => {
    // Sign in as organizer (profile already complete from beforeAll)
    await signInAsOrganizer(page, organizerCreds);

    // Navigate to event creation
    await page.goto('/en/dashboard/events/new');

    // Profile is complete, should access event creation directly
    await expect(page).toHaveURL(/\/dashboard\/events\/new/);

    // Verify no profile completion modal appears
    const profileModal = page.getByRole('dialog');
    const isProfileIncomplete = await profileModal.isVisible().catch(() => false);
    expect(isProfileIncomplete).toBe(false);
  });

  test('Test 0.4: Public pages are accessible without authentication', async ({
    page,
  }) => {
    // Navigate to public events directory
    await page.goto('/en/events');

    // Page should load successfully
    await expect(page).toHaveURL('/en/events');

    // Search box should be visible
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();

    // Filter dropdowns should be visible (labeled as "All sports" and "All states")
    await expect(page.getByRole('combobox').first()).toBeVisible();

    // No authentication-required elements should be shown
    const createEventButton = page.getByRole('link', { name: /create event/i });
    await expect(createEventButton).not.toBeVisible();
  });

  test('Test 0.5: Invalid credentials are rejected', async ({ page }) => {
    await page.goto('/en/sign-in');

    // Fill invalid credentials
    await page.getByLabel(/email/i).fill('invalid@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');

    // Submit form
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should remain on sign-in page
    await expect(page).toHaveURL(/\/sign-in/);

    // Error message should be displayed
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
  });
});
