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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileText, GripVertical, Trash2 } from 'lucide-react';

import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

export interface DocumentItem {
  mediaId: string;
  label: string;
  sortOrder: number;
}

export interface SortableDocumentListProps {
  documents: DocumentItem[];
  onReorder: (documents: DocumentItem[]) => void;
  onLabelChange: (mediaId: string, label: string) => void;
  onDelete: (mediaId: string) => void;
  labels: {
    labelPlaceholder: string;
    deleteDocument: string;
    dragToReorder: string;
    emptyState: string;
  };
  inputClassName?: string;
}

interface SortableDocumentItemProps {
  document: DocumentItem;
  onLabelChange: (mediaId: string, label: string) => void;
  onDelete: (mediaId: string) => void;
  labels: SortableDocumentListProps['labels'];
  inputClassName?: string;
}

function SortableDocumentItem({
  document,
  onLabelChange,
  onDelete,
  labels,
  inputClassName,
}: SortableDocumentItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: document.mediaId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-3 rounded-lg border bg-muted/30 p-3 transition-shadow',
        isDragging && 'opacity-50 shadow-lg z-10',
      )}
    >
      {/* Drag handle */}
      <IconButton
        label={labels.dragToReorder}
        variant="ghost"
        size="icon-sm"
        className={cn(
          'opacity-0 group-hover:opacity-100 transition-opacity cursor-grab',
          'focus-visible:opacity-100',
          isDragging && 'cursor-grabbing opacity-100',
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </IconButton>

      {/* Icon */}
      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />

      {/* Label input */}
      <input
        type="text"
        value={document.label}
        onChange={(e) => onLabelChange(document.mediaId, e.target.value)}
        placeholder={labels.labelPlaceholder}
        className={cn(
          'flex-1 rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
          inputClassName,
        )}
        maxLength={100}
      />

      {/* Delete button */}
      <IconButton
        label={labels.deleteDocument}
        variant="ghost"
        size="icon"
        className="flex-shrink-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onDelete(document.mediaId)}
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

export function SortableDocumentList({
  documents,
  onReorder,
  onLabelChange,
  onDelete,
  labels,
  inputClassName,
}: SortableDocumentListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Sort documents by sortOrder
  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => a.sortOrder - b.sortOrder),
    [documents],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedDocuments.findIndex((d) => d.mediaId === active.id);
      const newIndex = sortedDocuments.findIndex((d) => d.mediaId === over.id);

      const reordered = arrayMove(sortedDocuments, oldIndex, newIndex);

      // Update sortOrder values
      const updatedDocuments = reordered.map((doc, index) => ({
        ...doc,
        sortOrder: index,
      }));

      onReorder(updatedDocuments);
    }
  };

  if (sortedDocuments.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
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
        items={sortedDocuments.map((d) => d.mediaId)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {sortedDocuments.map((document) => (
            <SortableDocumentItem
              key={document.mediaId}
              document={document}
              onLabelChange={onLabelChange}
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
