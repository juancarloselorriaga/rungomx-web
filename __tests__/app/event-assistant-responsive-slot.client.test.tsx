import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

import { EventAssistantResponsiveSlot } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-assistant-responsive-slot';

let mockAssistantIsOpen = false;
const mockAssistantListeners = new Set<() => void>();

function mockSetAssistantOpen(nextOpen: boolean) {
  mockAssistantIsOpen = nextOpen;
  for (const listener of mockAssistantListeners) {
    listener();
  }
}

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-assistant-workspace-state',
  () => {
    const React = require('react');

    return {
      useAssistantWorkspaceQueryState: () => {
        const isOpen = React.useSyncExternalStore(
          (listener: () => void) => {
            mockAssistantListeners.add(listener);
            return () => mockAssistantListeners.delete(listener);
          },
          () => mockAssistantIsOpen,
          () => mockAssistantIsOpen,
        );

        return {
          isOpen,
          setOpen: mockSetAssistantOpen,
        };
      },
    };
  },
);

type MockMediaQueryList = {
  matches: boolean;
  media: string;
  onchange: ((event: MediaQueryListEvent) => void) | null;
  addEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => void;
  addListener: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
  dispatchEvent: (event: Event) => boolean;
};

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList: MockMediaQueryList = {
    matches: initialMatches,
    media: '(min-width: 1024px)',
    onchange: null,
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    addListener: (listener) => {
      listeners.add(listener);
    },
    removeListener: (listener) => {
      listeners.delete(listener);
    },
    dispatchEvent: (event) => {
      void event;
      return true;
    },
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(() => mediaQueryList),
  });

  return {
    setMatches(nextMatches: boolean) {
      mediaQueryList.matches = nextMatches;
      const event = {
        matches: nextMatches,
        media: mediaQueryList.media,
      } as MediaQueryListEvent;

      mediaQueryList.onchange?.(event);
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

let mountSequence = 0;

function AssistantProbe() {
  const [mountId] = useState(() => {
    mountSequence += 1;
    return mountSequence;
  });

  return <div data-testid="assistant-probe">assistant-mount-{mountId}</div>;
}

function renderResponsiveSlot(assistantMode: 'workspace' | 'inline' = 'workspace') {
  return render(
    <EventAssistantResponsiveSlot
      assistant={<AssistantProbe />}
      assistantMode={assistantMode}
      mobileTriggerLabel="Open mobile assistant"
      mobileTriggerHint="Mobile workspace hint"
      desktopTriggerLabel="Open desktop assistant"
      desktopTriggerHint="Desktop workspace hint"
      desktopWorkspaceTitle="Desktop assistant workspace"
      desktopWorkspaceDescription="Desktop assistant workspace description"
    >
      <div>Wizard step body</div>
    </EventAssistantResponsiveSlot>,
  );
}

describe('EventAssistantResponsiveSlot', () => {
  afterEach(() => {
    cleanup();
    mockAssistantIsOpen = false;
    mockAssistantListeners.clear();
    mountSequence = 0;
  });

  it('mounts only the desktop workspace branch in workspace mode on desktop', async () => {
    installMatchMedia(true);
    mockSetAssistantOpen(true);

    renderResponsiveSlot();

    await waitFor(() => {
      expect(screen.getByTestId('event-assistant-target-desktop-workspace')).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[data-testid^="event-assistant-target-"]')).toHaveLength(1);
    expect(screen.queryByTestId('event-assistant-target-mobile-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-assistant-target-desktop-inline')).not.toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByTestId('event-assistant-panel-instance')).toHaveLength(1);
    expect(screen.getAllByTestId('assistant-probe')).toHaveLength(1);
  });

  it('mounts only the mobile workspace branch in workspace mode on mobile', async () => {
    installMatchMedia(false);
    mockSetAssistantOpen(true);

    renderResponsiveSlot();

    await waitFor(() => {
      expect(screen.getByTestId('event-assistant-target-mobile-workspace')).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[data-testid^="event-assistant-target-"]')).toHaveLength(1);
    expect(screen.queryByTestId('event-assistant-target-desktop-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-assistant-target-desktop-inline')).not.toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByTestId('event-assistant-panel-instance')).toHaveLength(1);
    expect(screen.getAllByTestId('assistant-probe')).toHaveLength(1);
  });

  it('mounts only the inline panel in inline mode on desktop', async () => {
    installMatchMedia(true);

    renderResponsiveSlot('inline');

    await waitFor(() => {
      expect(screen.getByTestId('event-assistant-target-desktop-inline')).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[data-testid^="event-assistant-target-"]')).toHaveLength(1);
    expect(screen.queryByTestId('event-assistant-target-mobile-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-assistant-target-desktop-workspace')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('event-assistant-panel-instance')).toHaveLength(1);
    expect(screen.getAllByTestId('assistant-probe')).toHaveLength(1);
  });

  it('keeps the active presentation target locked while open and allows switching after close', async () => {
    const mediaQueryController = installMatchMedia(false);
    mockSetAssistantOpen(true);

    renderResponsiveSlot();

    await waitFor(() => {
      expect(screen.getByTestId('event-assistant-target-mobile-workspace')).toBeInTheDocument();
    });

    const initialMountId = screen.getByTestId('assistant-probe').textContent;

    act(() => {
      mediaQueryController.setMatches(true);
    });

    expect(screen.getByTestId('event-assistant-target-mobile-workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('event-assistant-target-desktop-workspace')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-probe')).toHaveTextContent(initialMountId ?? '');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.getByTestId('event-assistant-target-desktop-workspace')).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[data-testid^="event-assistant-target-"]')).toHaveLength(1);
    expect(screen.queryByTestId('event-assistant-target-mobile-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-probe')).not.toBeInTheDocument();
  });
});
