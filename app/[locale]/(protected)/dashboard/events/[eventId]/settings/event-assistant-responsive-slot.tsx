'use client';

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

import { EventAssistantDesktopWorkspace } from './event-assistant-desktop-workspace';
import { EventAssistantMobileWorkspace } from './event-assistant-mobile-workspace';
import { useAssistantWorkspaceQueryState } from './event-assistant-workspace-state';

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

type EventAssistantMode = 'workspace' | 'inline';
type EventAssistantPresentationTarget =
  | 'mobile-workspace'
  | 'desktop-workspace'
  | 'inline-desktop';

type EventAssistantResponsiveSlotProps = {
  assistant: ReactNode;
  assistantMode?: EventAssistantMode;
  mobileTriggerLabel: string;
  mobileTriggerHint: string;
  desktopTriggerLabel: string;
  desktopTriggerHint: string;
  desktopWorkspaceTitle: string;
  desktopWorkspaceDescription: string;
  children: ReactNode;
};

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

function resolvePresentationTarget(
  assistantMode: EventAssistantMode,
  isDesktop: boolean,
): EventAssistantPresentationTarget {
  if (!isDesktop) {
    return 'mobile-workspace';
  }

  return assistantMode === 'workspace'
    ? 'desktop-workspace'
    : 'inline-desktop';
}

function useDesktopBreakpoint() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const update = () => setIsDesktop(mediaQuery.matches);

    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return isDesktop;
}

function AssistantPanelInstance({ children }: { children: ReactNode }) {
  return <div data-testid="event-assistant-panel-instance">{children}</div>;
}

export function EventAssistantResponsiveSlot({
  assistant,
  assistantMode = 'workspace',
  mobileTriggerLabel,
  mobileTriggerHint,
  desktopTriggerLabel,
  desktopTriggerHint,
  desktopWorkspaceTitle,
  desktopWorkspaceDescription,
  children,
}: EventAssistantResponsiveSlotProps) {
  const { isOpen } = useAssistantWorkspaceQueryState();
  const isDesktop = useDesktopBreakpoint();
  const preferredTarget =
    isDesktop === null ? null : resolvePresentationTarget(assistantMode, isDesktop);
  const [lockedTarget, setLockedTarget] =
    useState<EventAssistantPresentationTarget | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setLockedTarget(null);
      return;
    }

    if (preferredTarget) {
      setLockedTarget((currentTarget) => currentTarget ?? preferredTarget);
    }
  }, [isOpen, preferredTarget]);

  const activeTarget = isOpen ? lockedTarget ?? preferredTarget : preferredTarget;
  const assistantPanel = <AssistantPanelInstance>{assistant}</AssistantPanelInstance>;

  if (assistantMode === 'inline') {
    return (
      <div className="space-y-6">
        {activeTarget === 'mobile-workspace' ? (
          <div data-testid="event-assistant-target-mobile-workspace">
            <EventAssistantMobileWorkspace
              triggerLabel={mobileTriggerLabel}
              triggerHint={mobileTriggerHint}
            >
              {assistantPanel}
            </EventAssistantMobileWorkspace>
          </div>
        ) : null}
        <div className="min-w-0">{children}</div>
        {activeTarget === 'inline-desktop' ? (
          <div className="max-w-3xl" data-testid="event-assistant-target-desktop-inline">
            {assistantPanel}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeTarget === 'mobile-workspace' ? (
        <div data-testid="event-assistant-target-mobile-workspace">
          <EventAssistantMobileWorkspace
            triggerLabel={mobileTriggerLabel}
            triggerHint={mobileTriggerHint}
          >
            {assistantPanel}
          </EventAssistantMobileWorkspace>
        </div>
      ) : null}
      {activeTarget === 'desktop-workspace' ? (
        <div data-testid="event-assistant-target-desktop-workspace">
          <EventAssistantDesktopWorkspace
            triggerLabel={desktopTriggerLabel}
            triggerHint={desktopTriggerHint}
            workspaceTitle={desktopWorkspaceTitle}
            workspaceDescription={desktopWorkspaceDescription}
          >
            {assistantPanel}
          </EventAssistantDesktopWorkspace>
        </div>
      ) : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
