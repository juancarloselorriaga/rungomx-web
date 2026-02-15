import type { UIMessage } from 'ai';

import type { EventAiWizardPatch } from './schemas';

export type EventAiWizardDataTypes = {
  notification: {
    message: string;
    level: 'info' | 'success' | 'error';
  };
  'event-patch': EventAiWizardPatch;
};

export type EventAiWizardUIMessage = UIMessage<unknown, EventAiWizardDataTypes>;

