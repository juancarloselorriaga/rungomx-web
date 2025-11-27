"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface LabeledTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "id"> {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  containerClassName?: string;
  labelClassName?: string;
  textareaClassName?: string;
  hintClassName?: string;
}

export const LabeledTextarea = React.forwardRef<HTMLTextAreaElement, LabeledTextareaProps>(
  (
    {
      id,
      label,
      hint,
      containerClassName,
      labelClassName,
      textareaClassName,
      hintClassName,
      ...textareaProps
    },
    ref
  ) => {
    return (
      <div className={cn("space-y-2", containerClassName)}>
        <label
          className={cn("text-xs font-medium text-foreground", labelClassName)}
          htmlFor={id}
        >
          {label}
        </label>
        <textarea
          ref={ref}
          id={id}
          className={cn(
            "mt-1 min-h-[140px] w-full rounded-md border bg-background p-3 text-sm text-foreground shadow-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            textareaClassName
          )}
          {...textareaProps}
        />
        {hint ? (
          <p className={cn("text-xs text-muted-foreground", hintClassName)}>
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

LabeledTextarea.displayName = "LabeledTextarea";
