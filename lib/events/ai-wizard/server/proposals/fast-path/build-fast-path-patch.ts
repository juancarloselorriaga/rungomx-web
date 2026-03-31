import { z } from 'zod';

import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import type { EventAiWizardFastPathKind } from '@/lib/events/ai-wizard/ui-types';

export const fastPathDescriptionProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    descriptionMarkdown: z.string().min(1).max(5000),
    locationDisplay: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
  })
  .strict();

export const fastPathFaqProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    items: z
      .array(
        z
          .object({
            question: z.string().min(1).max(500),
            answerMarkdown: z.string().min(1).max(5000),
          })
          .strict(),
      )
      .min(2)
      .max(4),
  })
  .strict();

export const fastPathContentBundleProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    faqItems: z
      .array(
        z
          .object({
            question: z.string().min(1).max(500),
            answerMarkdown: z.string().min(1).max(5000),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    websiteOverviewMarkdown: z.string().min(1).max(10000),
    websiteSectionTitle: z.string().max(255).optional(),
  })
  .strict();

export const fastPathWebsiteOverviewProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    markdown: z.string().min(1).max(10000),
    sectionTitle: z.string().max(255).optional(),
  })
  .strict();

export const fastPathPolicyProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    policy: z.enum(['refund', 'transfer', 'deferral']),
    markdown: z.string().min(1).max(5000),
  })
  .strict();

export function buildFastPathPatch(
  kind: EventAiWizardFastPathKind,
  editionId: string,
  locale: string | undefined,
  proposal:
    | z.infer<typeof fastPathDescriptionProposalSchema>
    | z.infer<typeof fastPathFaqProposalSchema>
    | z.infer<typeof fastPathContentBundleProposalSchema>
    | z.infer<typeof fastPathWebsiteOverviewProposalSchema>
    | z.infer<typeof fastPathPolicyProposalSchema>,
): EventAiWizardPatch {
  switch (kind) {
    case 'faq': {
      const faqProposal = proposal as z.infer<typeof fastPathFaqProposalSchema>;
      return {
        title: faqProposal.title,
        summary: faqProposal.summary,
        ops: faqProposal.items.map((item) => ({
          type: 'create_faq_item' as const,
          editionId,
          data: {
            question: item.question,
            answerMarkdown: item.answerMarkdown,
          },
        })),
        markdownOutputs: faqProposal.items.map((item) => ({
          domain: 'faq' as const,
          contentMarkdown: item.answerMarkdown,
        })),
      };
    }
    case 'content_bundle': {
      const contentBundle = proposal as z.infer<typeof fastPathContentBundleProposalSchema>;
      return {
        title: contentBundle.title,
        summary: contentBundle.summary,
        ops: [
          ...contentBundle.faqItems.map((item) => ({
            type: 'create_faq_item' as const,
            editionId,
            data: {
              question: item.question,
              answerMarkdown: item.answerMarkdown,
            },
          })),
          {
            type: 'append_website_section_markdown' as const,
            editionId,
            data: {
              section: 'overview' as const,
              markdown: contentBundle.websiteOverviewMarkdown,
              title: contentBundle.websiteSectionTitle,
              locale: locale ?? 'es',
            },
          },
        ],
        markdownOutputs: [
          ...contentBundle.faqItems.map((item) => ({
            domain: 'faq' as const,
            contentMarkdown: item.answerMarkdown,
          })),
          {
            domain: 'website' as const,
            contentMarkdown: contentBundle.websiteOverviewMarkdown,
          },
        ],
      };
    }
    case 'website_overview': {
      const websiteProposal = proposal as z.infer<typeof fastPathWebsiteOverviewProposalSchema>;
      return {
        title: websiteProposal.title,
        summary: websiteProposal.summary,
        ops: [
          {
            type: 'append_website_section_markdown' as const,
            editionId,
            data: {
              section: 'overview' as const,
              markdown: websiteProposal.markdown,
              title: websiteProposal.sectionTitle,
              locale: locale ?? 'es',
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'website' as const,
            contentMarkdown: websiteProposal.markdown,
          },
        ],
      };
    }
    case 'policy': {
      const policyProposal = proposal as z.infer<typeof fastPathPolicyProposalSchema>;
      return {
        title: policyProposal.title,
        summary: policyProposal.summary,
        ops: [
          {
            type: 'append_policy_markdown' as const,
            editionId,
            data: {
              policy: policyProposal.policy,
              markdown: policyProposal.markdown,
              enable: true,
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'policy' as const,
            contentMarkdown: policyProposal.markdown,
          },
        ],
      };
    }
    case 'event_description':
    default: {
      const descriptionProposal = proposal as z.infer<typeof fastPathDescriptionProposalSchema>;
      return {
        title: descriptionProposal.title,
        summary: descriptionProposal.summary,
        ops: [
          {
            type: 'update_edition' as const,
            editionId,
            data: {
              description: descriptionProposal.descriptionMarkdown,
              locationDisplay: descriptionProposal.locationDisplay,
              city: descriptionProposal.city,
              state: descriptionProposal.state,
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'description' as const,
            contentMarkdown: descriptionProposal.descriptionMarkdown,
          },
        ],
      };
    }
  }
}
