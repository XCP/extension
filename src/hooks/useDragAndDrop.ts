import { useState, useRef, DragEvent, useEffect } from "react";

export interface UseDragAndDropOptions<T> {
  items: T[];
  onReorder: (items: T[]) => void;
}

export interface UseDragAndDropResult {
  draggedIndex: number | null;
  dragOverIndex: number | null;
  isDragging: boolean;
  ghostPosition: { x: number; y: number } | null;
  handleDragStart: (e: DragEvent<HTMLElement>, index: number) => void;
  handleDragEnter: (e: DragEvent<HTMLElement>, index: number) => void;
  handleDragOver: (e: DragEvent<HTMLElement>, index: number) => void;
  handleDragEnd: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (e: DragEvent<HTMLElement>, dropIndex: number) => void;
  handleDragLeave: (e: DragEvent<HTMLElement>) => void;
  handleMouseMove: (e: MouseEvent) => void;
}

export function useDragAndDrop<T>({
  items,
  onReorder,
}: UseDragAndDropOptions<T>): UseDragAndDropResult {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ghostPosition, setGhostPosition] = useState<{ x: number; y: number } | null>(null);
  const draggedIndexRef = useRef<number | null>(null);

  const handleDragStart = (e: DragEvent<HTMLElement>, index: number) => {
    draggedIndexRef.current = index;
    setDraggedIndex(index);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);

    // Create a custom drag image (transparent 1x1 pixel) - only if available (not in tests)
    if (e.dataTransfer.setDragImage) {
      const img = new Image();
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
      e.dataTransfer.setDragImage(img, 0, 0);
    }
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
      setIsDragging(false);
      setGhostPosition(null);
      draggedIndexRef.current = null;
      return;
    }

    const newItems = [...items];
    const [removed] = newItems.splice(dragIndex, 1);
    newItems.splice(dropIndex, 0, removed);

    onReorder(newItems);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsDragging(false);
    setGhostPosition(null);
    draggedIndexRef.current = null;
  };

  const handleDragEnd = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsDragging(false);
    setGhostPosition(null);
    draggedIndexRef.current = null;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setGhostPosition({ x: e.clientX, y: e.clientY });
    }
  };

  // Add and cleanup mouse move listener when dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        setGhostPosition({ x: e.clientX, y: e.clientY });
      };
      document.addEventListener('mousemove', handleGlobalMouseMove);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
      };
    }
  }, [isDragging]);

  return {
    draggedIndex,
    dragOverIndex,
    isDragging,
    ghostPosition,
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handleDragLeave,
    handleMouseMove,
  };
}