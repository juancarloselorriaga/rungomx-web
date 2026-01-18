/**
 * Event Website Content Types
 *
 * Defines the block-based content structure for event website sections.
 * Based on the plan: Overview, Course, Schedule, FAQ (already separate), Photos/Media
 */

import { z } from 'zod';

// =============================================================================
// Block Types
// =============================================================================

/**
 * Supported block types for event website content
 */
export const WEBSITE_SECTION_TYPES = [
  'overview', // Description & Terrain
  'course', // Course info, elevation, aid stations, cutoffs
  'schedule', // Packet pickup, parking, start times
  'media', // Photo gallery + PDF attachments
] as const;

export type WebsiteSectionType = (typeof WEBSITE_SECTION_TYPES)[number];

// =============================================================================
// Section Content Schemas
// =============================================================================

/**
 * Overview section - main event description and terrain info
 */
export const overviewSectionSchema = z.object({
  type: z.literal('overview'),
  enabled: z.boolean().default(true),
  title: z.string().max(255).optional(),
  content: z.string().max(10000), // Rich text/markdown content
  terrain: z.string().max(1000).optional(), // Trail/terrain description
});

export type OverviewSection = z.infer<typeof overviewSectionSchema>;

/**
 * Course section - course details, aid stations, cutoffs
 */
export const courseSectionSchema = z.object({
  type: z.literal('course'),
  enabled: z.boolean().default(false),
  title: z.string().max(255).optional(),
  description: z.string().max(5000).optional(), // General course description
  elevationGain: z.string().max(100).optional(), // e.g., "1500m" or "5000ft"
  elevationProfileUrl: z.string().url().optional(), // Link to elevation profile image
  aidStations: z
    .array(
      z.object({
        name: z.string().max(100),
        distanceKm: z.number().min(0).optional(),
        cutoffTime: z.string().max(50).optional(), // e.g., "10:00 AM" or "+4h"
        services: z.string().max(500).optional(), // What's available
      }),
    )
    .max(50)
    .optional(),
  mapUrl: z.string().url().optional(), // Link to course map
  gpxFileId: z.string().uuid().optional(), // Reference to uploaded GPX file
});

export type CourseSection = z.infer<typeof courseSectionSchema>;

/**
 * Schedule section - packet pickup, parking, race-day logistics
 */
export const scheduleSectionSchema = z.object({
  type: z.literal('schedule'),
  enabled: z.boolean().default(false),
  title: z.string().max(255).optional(),
  packetPickup: z.string().max(2000).optional(), // Packet pickup info
  parking: z.string().max(2000).optional(), // Parking details
  raceDay: z.string().max(2000).optional(), // Race day schedule/logistics
  startTimes: z
    .array(
      z.object({
        distanceLabel: z.string().max(100),
        time: z.string().max(50), // e.g., "6:00 AM"
        notes: z.string().max(200).optional(),
      }),
    )
    .max(20)
    .optional(),
});

export type ScheduleSection = z.infer<typeof scheduleSectionSchema>;

/**
 * Media section - photo gallery and document attachments
 */
export const mediaSectionSchema = z.object({
  type: z.literal('media'),
  enabled: z.boolean().default(false),
  title: z.string().max(255).optional(),
  photos: z
    .array(
      z.object({
        mediaId: z.string().uuid(),
        caption: z.string().max(200).optional(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .max(50)
    .optional(),
  documents: z
    .array(
      z.object({
        mediaId: z.string().uuid(),
        label: z.string().max(100), // e.g., "Convocatoria", "Course Map PDF"
        sortOrder: z.number().int().min(0),
      }),
    )
    .max(20)
    .optional(),
});

export type MediaSection = z.infer<typeof mediaSectionSchema>;

// =============================================================================
// Combined Content Schema
// =============================================================================

/**
 * Complete website content blocks structure
 */
export const websiteContentBlocksSchema = z.object({
  overview: overviewSectionSchema.optional(),
  course: courseSectionSchema.optional(),
  schedule: scheduleSectionSchema.optional(),
  media: mediaSectionSchema.optional(),
});

export type WebsiteContentBlocks = z.infer<typeof websiteContentBlocksSchema>;

/**
 * Default empty blocks structure
 */
export const DEFAULT_WEBSITE_BLOCKS: WebsiteContentBlocks = {
  overview: {
    type: 'overview',
    enabled: true,
    content: '',
  },
  course: {
    type: 'course',
    enabled: false,
  },
  schedule: {
    type: 'schedule',
    enabled: false,
  },
  media: {
    type: 'media',
    enabled: false,
  },
};

// =============================================================================
// API Types
// =============================================================================

export type WebsiteContent = {
  id: string;
  editionId: string;
  locale: string;
  blocks: WebsiteContentBlocks;
  createdAt: Date;
  updatedAt: Date;
};

export type UpdateWebsiteContentInput = {
  editionId: string;
  locale?: string;
  blocks: WebsiteContentBlocks;
};
