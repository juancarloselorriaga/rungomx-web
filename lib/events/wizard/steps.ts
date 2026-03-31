import type { EventWizardStepId } from './types';

export const EVENT_SETUP_WIZARD_STEP_IDS = [
  'basics',
  'distances',
  'pricing',
  'registration',
  'policies',
  'content',
  'extras',
  'review',
] as const;

export type EventSetupWizardStepId = (typeof EVENT_SETUP_WIZARD_STEP_IDS)[number];

export type EventSetupWizardStepDefinition = {
  id: EventSetupWizardStepId;
  required: boolean;
  labelKey: string;
  routeSurface:
    | 'settings'
    | 'pricing'
    | 'faq'
    | 'waivers'
    | 'questions'
    | 'policies'
    | 'website'
    | 'add_ons';
  assistantMode: 'structured' | 'markdown' | 'diagnostic' | 'none';
  canonicalWizardStepIds: readonly EventWizardStepId[];
};

export const EVENT_SETUP_WIZARD_STEP_DEFINITIONS: readonly EventSetupWizardStepDefinition[] = [
  {
    id: 'basics',
    required: true,
    labelKey: 'wizardShell.steps.basics',
    routeSurface: 'settings',
    assistantMode: 'structured',
    canonicalWizardStepIds: ['event_details'],
  },
  {
    id: 'distances',
    required: true,
    labelKey: 'wizardShell.steps.distances',
    routeSurface: 'settings',
    assistantMode: 'structured',
    canonicalWizardStepIds: ['distances'],
  },
  {
    id: 'pricing',
    required: true,
    labelKey: 'wizardShell.steps.pricing',
    routeSurface: 'pricing',
    assistantMode: 'structured',
    canonicalWizardStepIds: ['pricing'],
  },
  {
    id: 'registration',
    required: true,
    labelKey: 'wizardShell.steps.registration',
    routeSurface: 'settings',
    assistantMode: 'none',
    canonicalWizardStepIds: [],
  },
  {
    id: 'policies',
    required: false,
    labelKey: 'wizardShell.steps.policies',
    routeSurface: 'policies',
    assistantMode: 'markdown',
    canonicalWizardStepIds: ['waivers', 'policies'],
  },
  {
    id: 'content',
    required: false,
    labelKey: 'wizardShell.steps.content',
    routeSurface: 'website',
    assistantMode: 'markdown',
    canonicalWizardStepIds: ['faq', 'website'],
  },
  {
    id: 'extras',
    required: false,
    labelKey: 'wizardShell.steps.extras',
    routeSurface: 'add_ons',
    assistantMode: 'none',
    canonicalWizardStepIds: ['questions', 'add_ons'],
  },
  {
    id: 'review',
    required: true,
    labelKey: 'wizardShell.steps.review',
    routeSurface: 'settings',
    assistantMode: 'diagnostic',
    canonicalWizardStepIds: ['publish'],
  },
] as const;

const EVENT_SETUP_WIZARD_STEP_ID_SET = new Set<string>(EVENT_SETUP_WIZARD_STEP_IDS);

export function isEventSetupWizardStepId(value: unknown): value is EventSetupWizardStepId {
  return typeof value === 'string' && EVENT_SETUP_WIZARD_STEP_ID_SET.has(value);
}

export function mapWizardIssueStepToSetupStep(stepId: EventWizardStepId): EventSetupWizardStepId {
  switch (stepId) {
    case 'event_details':
      return 'basics';
    case 'distances':
      return 'distances';
    case 'pricing':
      return 'pricing';
    case 'questions':
    case 'add_ons':
      return 'extras';
    case 'faq':
    case 'website':
      return 'content';
    case 'waivers':
    case 'policies':
      return 'policies';
    case 'publish':
      return 'review';
    case 'choose_path':
    default:
      return 'basics';
  }
}
