export const MY_REGISTRATIONS_VIEWS = ['upcoming', 'in_progress', 'past', 'cancelled'] as const;

export type MyRegistrationsView = (typeof MY_REGISTRATIONS_VIEWS)[number];

export const DEFAULT_MY_REGISTRATIONS_VIEW: MyRegistrationsView = 'upcoming';

export function parseMyRegistrationsView(
  value: string | string[] | null | undefined,
): MyRegistrationsView {
  const raw = Array.isArray(value) ? value[0] : value;

  if (raw && MY_REGISTRATIONS_VIEWS.includes(raw as MyRegistrationsView)) {
    return raw as MyRegistrationsView;
  }

  return DEFAULT_MY_REGISTRATIONS_VIEW;
}
