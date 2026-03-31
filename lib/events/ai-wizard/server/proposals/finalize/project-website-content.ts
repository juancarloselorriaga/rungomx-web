import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import type { WebsiteContentBlocks } from '@/lib/events/website/types';

function appendProjectedMarkdown(existing: string | null | undefined, incoming: string): string {
  const previous = (existing ?? '').trim();
  const next = incoming.trim();

  if (!previous) return next;
  if (!next || previous.includes(next)) return previous;
  return `${previous}\n\n${next}`;
}

export function projectWebsiteContent(
  websiteContent: WebsiteContentBlocks | null | undefined,
  patch: EventAiWizardPatch,
): WebsiteContentBlocks | null {
  let projectedBlocks: WebsiteContentBlocks | null = websiteContent
    ? {
        ...websiteContent,
        overview: websiteContent.overview ? { ...websiteContent.overview } : undefined,
        course: websiteContent.course ? { ...websiteContent.course } : undefined,
        schedule: websiteContent.schedule
          ? {
              ...websiteContent.schedule,
              startTimes: websiteContent.schedule.startTimes?.map((item) => ({ ...item })),
            }
          : undefined,
      }
    : null;

  for (const op of patch.ops) {
    if (op.type !== 'append_website_section_markdown') continue;

    if (!projectedBlocks) {
      projectedBlocks = {};
    }

    if (op.data.section === 'overview') {
      const previous = projectedBlocks.overview ?? {
        type: 'overview' as const,
        enabled: true,
        content: '',
      };
      projectedBlocks.overview = {
        ...previous,
        enabled: true,
        title: previous.title ?? op.data.title,
        content: op.data.markdown.trim(),
      };
      continue;
    }

    if (op.data.section === 'course') {
      const previous = projectedBlocks.course ?? { type: 'course' as const, enabled: true };
      projectedBlocks.course = {
        ...previous,
        enabled: true,
        title: previous.title ?? op.data.title,
        description: appendProjectedMarkdown(previous.description, op.data.markdown),
      };
      continue;
    }

    const previous = projectedBlocks.schedule ?? { type: 'schedule' as const, enabled: true };
    projectedBlocks.schedule = {
      ...previous,
      enabled: true,
      title: previous.title ?? op.data.title,
      raceDay: appendProjectedMarkdown(previous.raceDay, op.data.markdown),
    };
  }

  return projectedBlocks;
}
