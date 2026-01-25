/**
 * Re-export all event actions from their domain modules.
 * This file serves as the main entry point for backward compatibility.
 *
 * Note: Individual action files have their own 'use server' directive.
 * This file is a pure re-export hub with no server-only imports.
 */

// Series actions
export { createEventSeries, renameEventSeriesSlug } from './series/actions';

// Edition actions (CRUD, visibility, capacity, policies, media, cloning)
export {
  cloneEdition,
  createEventEdition,
  updateEventEdition,
  updateEventCapacitySettings,
  updateEventPolicyConfig,
  confirmEventMediaUpload,
  updateEventVisibility,
  setRegistrationPaused,
  checkSlugAvailability,
} from './editions/actions';

// Distance actions
export {
  createDistance,
  updateDistance,
  deleteDistance,
  updateDistancePrice,
} from './distances/actions';

// FAQ actions
export {
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  reorderFaqItems,
} from './faq/actions';

// Waiver actions
export { createWaiver, updateWaiver, reorderWaivers } from './waivers/actions';

// Registration flow actions
export {
  startRegistration,
  submitRegistrantInfo,
  acceptWaiver,
  finalizeRegistration,
} from './registration-flow/actions';

// Registration export actions
export { exportRegistrationsCSV, exportAddOnSalesCSV } from './registrations/actions';
