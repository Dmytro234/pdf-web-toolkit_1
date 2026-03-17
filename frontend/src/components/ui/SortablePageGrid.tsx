import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import Button from "./Button";
import PageThumbnail from "./PageThumbnail";

type SortablePageGridProps = {
  fileId: string;
  totalPages: number;
  onReorder: (newOrder: number[]) => void;
  onRotate?: (pageNum: number) => void;
  onDelete?: (pageNum: number) => void;
  onDuplicate?: (pageNum: number) => void;
  selectable?: boolean;
  onSelect?: (selectedPages: number[]) => void;
};

type SortableItemProps = {
  id: number;
  fileId: string;
  selected: boolean;
  onSelect: (pageNum: number, shiftKey?: boolean) => void;
  onRotate?: (pageNum: number) => void;
  onDelete?: (pageNum: number) => void;
  onDuplicate?: (pageNum: number) => void;
};

function SortableItem({
  id,
  fileId,
  selected,
  onSelect,
  onRotate,
  onDelete,
  onDuplicate
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PageThumbnail
        fileId={fileId}
        pageNum={id}
        selected={selected}
        onSelect={(pageNum) => onSelect(pageNum)}
        onRotate={onRotate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />
    </div>
  );
}

export default function SortablePageGrid({
  fileId,
  totalPages,
  onReorder,
  onRotate,
  onDelete,
  onDuplicate,
  selectable = true,
  onSelect
}: SortablePageGridProps) {
  const [items, setItems] = useState<number[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [lastSelected, setLastSelected] = useState<number | null>(null);

  useEffect(() => {
    setItems(Array.from({ length: totalPages }, (_, index) => index));
    setSelectedPages([]);
    setLastSelected(null);
  }, [totalPages]);

  useEffect(() => {
    onSelect?.(selectedPages);
  }, [selectedPages, onSelect]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const selectedSet = useMemo(() => new Set(selectedPages), [selectedPages]);

  const handleSelect = (pageNum: number, shiftKey = false) => {
    if (!selectable) return;

    setSelectedPages((prev) => {
      if (shiftKey && lastSelected !== null) {
        const start = Math.min(lastSelected, pageNum);
        const end = Math.max(lastSelected, pageNum);
        const range = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        return Array.from(new Set([...prev, ...range])).sort((a, b) => a - b);
      }

      const exists = prev.includes(pageNum);
      const next = exists ? prev.filter((item) => item !== pageNum) : [...prev, pageNum].sort((a, b) => a - b);
      return next;
    });

    setLastSelected(pageNum);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.indexOf(Number(active.id));
      const newIndex = prev.indexOf(Number(over.id));
      const next = arrayMove(prev, oldIndex, newIndex);
      onReorder(next);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {selectable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Вибрати всі сторінки"
            onClick={() => setSelectedPages(items)}
          >
            Select All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Зняти вибір з усіх сторінок"
            onClick={() => setSelectedPages([])}
          >
            Deselect All
          </Button>
          <span className="text-sm text-slate-500">
            Вибрано: <span className="font-medium text-slate-700">{selectedPages.length}</span>
          </span>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((pageNum) => (
              <div
                key={pageNum}
                onClick={(event) => handleSelect(pageNum, event.shiftKey)}
              >
                <SortableItem
                  id={pageNum}
                  fileId={fileId}
                  selected={selectedSet.has(pageNum)}
                  onSelect={(num) => handleSelect(num)}
                  onRotate={onRotate}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                />
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}