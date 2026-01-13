/**
 * Test data fixtures for RunGoMX E2E tests
 *
 * Note: Test accounts are no longer hardcoded here.
 * Each test file creates its own users via signUpTestUser() in beforeAll hooks.
 */

/**
 * Event creation data
 */
export const EVENT_DATA = {
  default: {
    sportType: 'trail-running',
    city: 'Monterrey',
    state: 'Nuevo León',
    editionLabel: '2026',
    eventDate: '2026-06-15',
  },
  trailRun: {
    sportType: 'trail-running',
    city: 'Valle de Bravo',
    state: 'Estado de México',
    editionLabel: '2026',
    eventDate: '2026-08-20',
  },
  triathlon: {
    sportType: 'triathlon',
    city: 'Cancún',
    state: 'Quintana Roo',
    editionLabel: '2026',
    eventDate: '2026-10-10',
  },
} as const;

/**
 * Distance options
 */
export const DISTANCE_DATA = {
  trail10k: {
    label: '10K Trail Run',
    distance: 10,
    terrain: 'trail',
    price: 500, // MXN
    capacity: 100,
  },
  trail25k: {
    label: '25K Trail Run',
    distance: 25,
    terrain: 'trail',
    price: 750,
    capacity: 75,
  },
  trail50k: {
    label: '50K Ultra Trail',
    distance: 50,
    terrain: 'trail',
    price: 1200,
    capacity: 50,
  },
  road5k: {
    label: '5K Road Race',
    distance: 5,
    terrain: 'road',
    price: 300,
    capacity: 200,
  },
  capacityTest: {
    label: 'Capacity Test Distance',
    distance: 1,
    terrain: 'trail',
    price: 100,
    capacity: 1, // For testing capacity enforcement
  },
} as const;

/**
 * Registration form data
 */
export const REGISTRATION_DATA = {
  athlete1: {
    phone: '+523318887777',
    dateOfBirth: '1990-05-15',
    gender: 'male',
    emergencyContactName: 'Maria Lopez',
    emergencyContactPhone: '+523319998888',
  },
  athlete2: {
    phone: '+523311112222',
    dateOfBirth: '1992-08-22',
    gender: 'female',
    emergencyContactName: 'Carlos Sanchez',
    emergencyContactPhone: '+523313334444',
  },
} as const;

/**
 * Visibility states
 */
export const VISIBILITY_STATES = {
  draft: 'draft',
  published: 'published',
  unlisted: 'unlisted',
  archived: 'archived',
} as const;

/**
 * Registration states
 */
export const REGISTRATION_STATES = {
  active: 'active',
  paused: 'paused',
} as const;
