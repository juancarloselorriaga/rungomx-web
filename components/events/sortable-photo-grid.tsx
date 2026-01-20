'use client';

import { useMemo } from 'react';
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

export function SortablePhotoGrid({
  photos,
  mediaUrls,
  onReorder,
  onCaptionChange,
  onDelete,
  labels,
  inputClassName,
}: SortablePhotoGridProps) {
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

  const handleDragEnd = (event: DragEndEvent) => {
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
  };

  if (sortedPhotos.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
        <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{labels.emptyState}</p>
      </div>
    );
  }

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
