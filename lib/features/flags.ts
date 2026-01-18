/**
 * Feature flags for controlling feature availability.
 * Uses environment variables for simplicity (no external service needed).
 *
 * Note: NEXT_PUBLIC_ prefix makes these available on the client side.
 */

export const FEATURE_FLAGS = {
  /**
   * Global gate for the Events platform (external organizers).
   * Internal staff bypass via permission checks in server actions.
   */
  EVENTS_PLATFORM_ENABLED: process.env.NEXT_PUBLIC_FEATURE_EVENTS_PLATFORM === 'true',

  /**
   * When true, finalizeRegistration auto-confirms registrations (no-payment mode).
   * Keep false in production until payment integrations are live.
   */
  EVENTS_NO_PAYMENT_MODE: process.env.NEXT_PUBLIC_FEATURE_EVENTS_NO_PAYMENT_MODE === 'true',
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Check if the events platform is enabled (external organizers).
 */
export function isEventsEnabled(): boolean {
  return FEATURE_FLAGS.EVENTS_PLATFORM_ENABLED;
}

/**
 * Check if no-payment mode is enabled for event registrations.
 */
export function isEventsNoPaymentMode(): boolean {
  return FEATURE_FLAGS.EVENTS_NO_PAYMENT_MODE;
}

/**
 * Check if a specific feature flag is enabled.
 * Generic helper for checking any feature flag.
 *
 * @param flag - The feature flag to check
 * @returns true if the flag is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
