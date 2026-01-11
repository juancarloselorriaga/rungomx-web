# Playwright Phone Input Testing Guide

## Changes Made

Added `data-testid` attributes to the PhoneInput component in `components/ui/phone-input.tsx`:

- Main phone input: `data-testid="phone-input-phone"`
- Emergency phone input: `data-testid="phone-input-emergencyContactPhone"`
- Country selectors: `data-testid="phone-country-{name}"`

## How to Use in Playwright

### Method 1: Using data-testid (Recommended)

```javascript
// Fill main phone number
await page.getByTestId('phone-input-phone').fill('5512345678');

// Fill emergency phone number
await page.getByTestId('phone-input-emergencyContactPhone').fill('5587654321');
```

### Method 2: Using input[type="tel"]

```javascript
// Alternative: find by input type
const phoneInputs = await page.locator('input[type="tel"]').all();
await phoneInputs[0].fill('5512345678'); // First phone field
await phoneInputs[1].fill('5587654321'); // Emergency phone field
```

### Complete Profile Completion Example

```javascript
async (page) => {
  // Navigate to the page that triggers profile completion
  await page.goto('http://localhost:3000/en/dashboard/events/new');

  // Wait for profile dialog to appear
  await page.waitForSelector('dialog:has-text("Complete your profile")');

  // Fill phone number
  await page.getByTestId('phone-input-phone').fill('5512345678');

  // Fill date of birth
  await page.getByRole('button', { name: /Date of birth/ }).click();
  await page.getByRole('combobox', { name: 'Choose the Year' }).selectOption('1990');
  await page.getByRole('button', { name: /January 15/ }).click();

  // City and State are already prefilled in test

  // Fill emergency contact name
  await page.getByRole('textbox', { name: 'Emergency contact' }).fill('Jane Doe');

  // Fill emergency phone
  await page.getByTestId('phone-input-emergencyContactPhone').fill('5587654321');

  // Submit the form
  await page.getByRole('button', { name: 'Save' }).click();

  // Wait for dialog to close
  await page.waitForSelector('dialog:has-text("Complete your profile")', {
    state: 'hidden',
    timeout: 5000
  });

  return { success: true };
}
```

## Testing the Changes

1. **Restart your dev server** to pick up the component changes:
   ```bash
   # Stop the current server (Ctrl+C)
   pnpm dev
   ```

2. **Run the Playwright test** to verify it works:
   ```javascript
   // The test code should now be able to fill the phone inputs
   ```

## Technical Details

The `react-phone-number-input` library accepts additional props via `numberInputProps` and `countrySelectProps`, which are passed directly to the underlying HTML elements. By adding `data-testid` to these prop objects, Playwright can reliably locate and interact with the inputs.

### Why This Works

1. The `numberInputProps` object accepts any valid HTML input attributes
2. `data-testid` is a standard HTML attribute
3. React passes it through to the DOM element
4. Playwright can query by `data-testid` using `getByTestId()`

### Benefits

- **Stable selectors**: Won't break if CSS classes change
- **Explicit intent**: Clear that these elements are meant for testing
- **Best practice**: Follows Playwright's recommended testing patterns
- **Maintainable**: Easy to update if component structure changes
