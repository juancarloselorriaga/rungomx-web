import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type LabelWidth = 'sm' | 'md' | 'lg' | 'xl';

const LABEL_WIDTH_CLASSES: Record<LabelWidth, string> = {
  sm: 'w-24', // 96px
  md: 'w-32', // 128px (default, matches most labels)
  lg: 'w-40', // 160px
  xl: 'w-48', // 192px
};

type FormFieldSkeletonProps = {
  /**
   * Show label skeleton
   * @default true
   */
  showLabel?: boolean;
  /**
   * Label width preset
   * @default "md"
   */
  labelWidth?: LabelWidth;
  /**
   * Additional className for the wrapper
   */
  className?: string;
};

/**
 * Reusable skeleton for form fields (inputs, selects, etc.)
 *
 * Matches the exact dimensions of form fields wrapped with FormField component:
 * - Label: h-5 (text-sm line-height = 1.25rem = 20px)
 * - Input: h-[38px] (py-2 [16px] + text-sm line-height [20px] + border [2px] = 38px)
 * - Spacing: space-y-1 (4px between label and input)
 *
 * This ensures zero layout shift when the actual component loads.
 *
 * Height calculation breakdown:
 * - py-2: 0.5rem × 2 = 8px + 8px = 16px padding
 * - text-sm line-height: 1.25rem = 20px content height
 * - border: 1px × 2 = 2px borders
 * - Total: 16 + 20 + 2 = 38px
 *
 * @example
 * ```tsx
 * <FormFieldSkeleton />
 * <FormFieldSkeleton showLabel={false} />
 * <FormFieldSkeleton labelWidth="lg" />
 * ```
 */
export function FormFieldSkeleton({
  showLabel = true,
  labelWidth = 'md',
  className,
}: FormFieldSkeletonProps) {
  return (
    <div className={cn('block space-y-1 text-sm', className)}>
      {showLabel && <Skeleton className={cn('h-5', LABEL_WIDTH_CLASSES[labelWidth])} />}
      <Skeleton className="h-[38px] w-full" />
    </div>
  );
}
