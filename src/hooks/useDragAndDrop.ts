import { useState, DragEvent } from "react";

export interface UseDragAndDropOptions<T> {
  items: T[];
  onReorder: (items: T[]) => void;
}

export interface UseDragAndDropResult {
  draggedIndex: number | null;
  dragOverIndex: number | null;
  handleDragStart: (e: DragEvent<HTMLElement>, index: number) => void;
  handleDragOver: (e: DragEvent<HTMLElement>, index: number) => void;
  handleDragEnd: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (e: DragEvent<HTMLElement>, dropIndex: number) => void;
  handleDragLeave: (e: DragEvent<HTMLElement>) => void;
}

export function useDragAndDrop<T>({
  items,
  onReorder,
}: UseDragAndDropOptions<T>): UseDragAndDropResult {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: DragEvent<HTMLElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: DragEvent<HTMLElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;

    if (!currentTarget.contains(relatedTarget)) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: DragEvent<HTMLElement>, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newItems = [...items];
    const draggedItem = newItems[draggedIndex];

    newItems.splice(draggedIndex, 1);

    const adjustedIndex = dropIndex > draggedIndex ? dropIndex - 1 : dropIndex;
    newItems.splice(adjustedIndex, 0, draggedItem);

    onReorder(newItems);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return {
    draggedIndex,
    dragOverIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handleDragLeave,
  };
}