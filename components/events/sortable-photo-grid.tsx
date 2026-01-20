'use client';

import { useMemo, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical, Image as ImageIcon, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PhotoItem {
  mediaId: string;
  caption?: string;
  sortOrder: number;
}

export interface SortablePhotoGridProps {
  photos: PhotoItem[];
  mediaUrls: Record<string, string>;
  onReorder: (photos: PhotoItem[]) => void;
  onCaptionChange: (mediaId: string, caption: string) => void;
  onDelete: (mediaId: string) => void;
  labels: {
    captionLabel: string;
    captionPlaceholder: string;
    deletePhoto: string;
    dragToReorder: string;
    emptyState: string;
  };
  inputClassName?: string;
}

interface SortablePhotoItemProps {
  photo: PhotoItem;
  url?: string;
  onCaptionChange: (mediaId: string, caption: string) => void;
  onDelete: (mediaId: string) => void;
  labels: SortablePhotoGridProps['labels'];
  inputClassName?: string;
}

function SortablePhotoItem({
  photo,
  url,
  onCaptionChange,
  onDelete,
  labels,
  inputClassName,
}: SortablePhotoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.mediaId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-lg border bg-muted/30 overflow-hidden transition-shadow',
        isDragging && 'opacity-50 shadow-lg z-10',
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className={cn(
          'absolute top-2 left-2 z-10 rounded bg-background/80 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab',
          'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary',
          isDragging && 'cursor-grabbing opacity-100',
        )}
        {...attributes}
        {...listeners}
        aria-label={labels.dragToReorder}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Image */}
      <div className="relative aspect-[4/3] bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={photo.caption ?? ''}
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Caption and actions */}
      <div className="p-3 space-y-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">{labels.captionLabel}</label>
          <input
            type="text"
            value={photo.caption ?? ''}
            onChange={(e) => onCaptionChange(photo.mediaId, e.target.value)}
            placeholder={labels.captionPlaceholder}
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              inputClassName,
            )}
            maxLength={200}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(photo.mediaId)}
            title={labels.deletePhoto}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Threshold for using virtualization (number of photos)
const VIRTUALIZATION_THRESHOLD = 30;

// Estimated item height for virtualization (aspect-ratio 4/3 image + caption area)
const ESTIMATED_ROW_HEIGHT = 280;

export function SortablePhotoGrid({
  photos,
  mediaUrls,
  onReorder,
  onCaptionChange,
  onDelete,
  labels,
  inputClassName,
}: SortablePhotoGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Sort photos by sortOrder
  const sortedPhotos = useMemo(
    () => [...photos].sort((a, b) => a.sortOrder - b.sortOrder),
    [photos],
  );

  // Group photos into rows of 3 for virtualization
  const rows = useMemo(() => {
    const result: PhotoItem[][] = [];
    for (let i = 0; i < sortedPhotos.length; i += 3) {
      result.push(sortedPhotos.slice(i, i + 3));
    }
    return result;
  }, [sortedPhotos]);

  // Use virtualization only for large photo sets
  const useVirtualization = sortedPhotos.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 2, // Render 2 extra rows above/below viewport
    enabled: useVirtualization,
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = sortedPhotos.findIndex((p) => p.mediaId === active.id);
        const newIndex = sortedPhotos.findIndex((p) => p.mediaId === over.id);

        const reordered = arrayMove(sortedPhotos, oldIndex, newIndex);

        // Update sortOrder values
        const updatedPhotos = reordered.map((photo, index) => ({
          ...photo,
          sortOrder: index,
        }));

        onReorder(updatedPhotos);
      }
    },
    [sortedPhotos, onReorder],
  );

  if (sortedPhotos.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
        <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{labels.emptyState}</p>
      </div>
    );
  }

  // Non-virtualized rendering for smaller sets
  if (!useVirtualization) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedPhotos.map((p) => p.mediaId)}
          strategy={rectSortingStrategy}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedPhotos.map((photo) => (
              <SortablePhotoItem
                key={photo.mediaId}
                photo={photo}
                url={mediaUrls[photo.mediaId]}
                onCaptionChange={onCaptionChange}
                onDelete={onDelete}
                labels={labels}
                inputClassName={inputClassName}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  // Virtualized rendering for larger sets
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedPhotos.map((p) => p.mediaId)}
        strategy={rectSortingStrategy}
      >
        <div
          ref={parentRef}
          className="h-[600px] overflow-auto"
          style={{ contain: 'strict' }}
        >
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualItems.map((virtualRow) => {
              const rowPhotos = rows[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pb-4">
                    {rowPhotos.map((photo) => (
                      <SortablePhotoItem
                        key={photo.mediaId}
                        photo={photo}
                        url={mediaUrls[photo.mediaId]}
                        onCaptionChange={onCaptionChange}
                        onDelete={onDelete}
                        labels={labels}
                        inputClassName={inputClassName}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}
