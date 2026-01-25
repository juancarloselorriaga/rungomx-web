// =============================================================================
// Re-exports from domain modules
// =============================================================================

// Series queries
export { type EventSeriesSummary, getOrganizationEventSeries } from './series/queries';

// Edition queries (organizer dashboard)
export {
  type OrganizerEventSummary,
  type EventEditionDetail,
  type EventDistanceDetail,
  type EventFaqItem,
  type EventWaiver,
  type EventPolicyConfig,
  type SeriesEditionListItem,
  getUserEvents,
  getEventEditionDetail,
  getSeriesEditionsForDashboard,
} from './editions/queries';

// Public event queries
export {
  type PublicEventDetail,
  type PublicDistanceInfo,
  type PublicSeriesEditionSummary,
  getPublicEventBySlug,
  getPublicOtherEditionsForSeries,
} from './public/queries';

// Search/directory queries
export {
  type PublicEventSummary,
  type SearchEventsParams,
  type SearchEventsResult,
  type PublishedEventRoute,
  searchPublicEvents,
  getPublishedEventRoutesForSitemap,
} from './search/queries';

// User registrations queries
export {
  type MyRegistrationsView,
  type MyRegistrationListItem,
  type MyRegistrationDetail,
  type ActiveRegistrationInfo,
  getMyRegistrations,
  getMyRegistrationDetail,
  getActiveRegistrationForEdition,
} from './my-registrations/queries';
