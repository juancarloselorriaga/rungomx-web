'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';

type IconButtonProps = Omit<React.ComponentProps<typeof Button>, 'aria-label'> & {
  /**
   * Required accessible name for icon/image-only controls.
   * Prefer short, action-oriented labels (e.g. "Close", "Delete photo").
   */
  label: string;
};

export function IconButton({ label, type = 'button', ...props }: IconButtonProps) {
  return <Button aria-label={label} type={type} {...props} />;
}

