import { fireEvent, render, screen } from '@testing-library/react';

import { EventAssistantMobileWorkspace } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-assistant-mobile-workspace';

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-assistant-workspace-state',
  () => {
    const React = require('react');
    return {
      useAssistantWorkspaceQueryState: () => {
        const [isOpen, setOpen] = React.useState(false);
        return { isOpen, setOpen };
      },
    };
  },
);

describe('EventAssistantMobileWorkspace', () => {
  it('opens the mobile assistant sheet from the persistent trigger', () => {
    render(
      <EventAssistantMobileWorkspace
        triggerLabel="Open assistant"
        triggerHint="Get help with Participant content without losing your place."
      >
        <div>Assistant body</div>
      </EventAssistantMobileWorkspace>,
    );

    expect(screen.queryByText('Assistant body')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));

    expect(screen.getByText('Assistant body')).toBeInTheDocument();
  });
});
