import type { UIMessage } from 'ai';

import type { EventAiWizardPatch } from './schemas';

export type EventAiWizardNotificationCode =
  | 'analyzing_request'
  | 'grounding_snapshot'
  | 'drafting_response'
  | 'finalizing_proposal';

export type EventAiWizardFastPathKind =
  | 'event_description'
  | 'faq'
  | 'content_bundle'
  | 'website_overview'
  | 'policy';

export type EventAiWizardFastPathStructure = {
  kind: EventAiWizardFastPathKind;
  sectionKeys: string[];
};

export type EventAiWizardEarlyProseLead = {
  body: string;
};

export type EventAiWizardDataTypes = {
  notification: {
    code: EventAiWizardNotificationCode;
    level: 'info' | 'success' | 'error';
  };
  'fast-path-structure': EventAiWizardFastPathStructure;
  'early-prose': EventAiWizardEarlyProseLead;
  'event-patch': EventAiWizardPatch;
};

export type EventAiWizardUIMessage = UIMessage<unknown, EventAiWizardDataTypes>;
