import { useState, useRef, DragEvent } from "react";

export interface UseDragAndDropOptions<T> {
  items: T[];
  onReorder: (items: T[]) => void;
}

export interface UseDragAndDropResult {
  draggedIndex: number | null;
  dragOverIndex: number | null;
  handleDragStart: (e: DragEvent<HTMLElement>, index: number) => void;
  handleDragEnter: (e: DragEvent<HTMLElement>, index: number) => void;
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
  const draggedIndexRef = useRef<number | null>(null);

  const handleDragStart = (e: DragEvent<HTMLElement>, index: number) => {
    draggedIndexRef.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
  };

  const handleDragEnter = (e: DragEvent<HTMLElement>, index: number) => {
    e.preventDefault();
    if (draggedIndexRef.current !== null && draggedIndexRef.current !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragOverIndex(null);
  };

  const handleDrop = (e: DragEvent<HTMLElement>, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const dragIndex = draggedIndexRef.current;

    if (dragIndex === null || dragIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      draggedIndexRef.current = null;
      return;
    }

    const newItems = [...items];
    const [removed] = newItems.splice(dragIndex, 1);
    newItems.splice(dropIndex, 0, removed);

    onReorder(newItems);
    setDraggedIndex(null);
    setDragOverIndex(null);
    draggedIndexRef.current = null;
  };

  const handleDragEnd = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDraggedIndex(null);
    setDragOverIndex(null);
    draggedIndexRef.current = null;
  };

  return {
    draggedIndex,
    dragOverIndex,
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handleDragLeave,
  };
}