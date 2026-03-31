import { projectWebsiteContent } from '@/lib/events/ai-wizard/server/proposals/finalize/project-website-content';
import type { WebsiteContentBlocks } from '@/lib/events/website/types';

describe('projectWebsiteContent', () => {
  it('initializes or replaces overview content from the proposal', () => {
    const patch = {
      title: 'Refresh overview',
      summary: 'Writes the current participant-facing overview.',
      ops: [
        {
          type: 'append_website_section_markdown' as const,
          editionId: '11111111-1111-4111-8111-111111111111',
          data: {
            section: 'overview' as const,
            markdown: '## Overview\n\nNew participant-facing summary.',
            title: 'Why this event matters',
            locale: 'en',
          },
        },
      ],
    };

    expect(projectWebsiteContent(null, patch)).toEqual({
      overview: {
        type: 'overview',
        enabled: true,
        title: 'Why this event matters',
        content: '## Overview\n\nNew participant-facing summary.',
      },
    });
  });

  it('appends course and schedule markdown without duplicating identical content', () => {
    const existing: WebsiteContentBlocks = {
      course: {
        type: 'course',
        enabled: true,
        title: 'Course details',
        description: 'Existing course description.',
      },
      schedule: {
        type: 'schedule',
        enabled: true,
        title: 'Race-week schedule',
        raceDay: 'Packet pickup starts at 5:00 AM.',
      },
    };

    const patch = {
      title: 'Expand course and schedule',
      summary: 'Adds new course text and keeps duplicate schedule content stable.',
      ops: [
        {
          type: 'append_website_section_markdown' as const,
          editionId: '11111111-1111-4111-8111-111111111111',
          data: {
            section: 'course' as const,
            markdown: 'New climb details and terrain notes.',
            locale: 'es',
          },
        },
        {
          type: 'append_website_section_markdown' as const,
          editionId: '11111111-1111-4111-8111-111111111111',
          data: {
            section: 'schedule' as const,
            markdown: 'Packet pickup starts at 5:00 AM.',
            locale: 'es',
          },
        },
      ],
    };

    expect(projectWebsiteContent(existing, patch)).toEqual({
      course: {
        type: 'course',
        enabled: true,
        title: 'Course details',
        description: 'Existing course description.\n\nNew climb details and terrain notes.',
      },
      schedule: {
        type: 'schedule',
        enabled: true,
        title: 'Race-week schedule',
        raceDay: 'Packet pickup starts at 5:00 AM.',
      },
    });
  });
});
