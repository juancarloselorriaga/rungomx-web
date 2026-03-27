import { fireEvent, render, screen } from '@testing-library/react';

import { EventAssistantDesktopWorkspace } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-assistant-desktop-workspace';

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

describe('EventAssistantDesktopWorkspace', () => {
  it('opens the expanded desktop workspace on demand', () => {
    render(
      <EventAssistantDesktopWorkspace
        triggerLabel="Open assistant"
        triggerHint="Keep the editor comfortable and open a wider AI workspace."
        workspaceTitle="AI assistant for Participant content"
        workspaceDescription="Use this expanded workspace to review proposals."
      >
        <div>Assistant panel content</div>
      </EventAssistantDesktopWorkspace>,
    );

    expect(screen.getByText('Keep the editor comfortable and open a wider AI workspace.')).toBeInTheDocument();
    expect(screen.queryByText('Assistant panel content')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Open assistant' })[0]!);

    expect(screen.getAllByText('AI assistant for Participant content')).toHaveLength(2);
    expect(screen.getByText('Assistant panel content')).toBeInTheDocument();
  });
});
