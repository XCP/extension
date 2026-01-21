import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDragAndDrop } from '../useDragAndDrop';

describe('useDragAndDrop', () => {
  const mockItems = ['item1', 'item2', 'item3', 'item4'];
  const mockOnReorder = vi.fn();

  beforeEach(() => {
    mockOnReorder.mockClear();
  });

  it('should handle drag start', () => {
    const { result } = renderHook(() =>
      useDragAndDrop({
        items: mockItems,
        onReorder: mockOnReorder,
      })
    );

    const mockEvent = {
      dataTransfer: {
        effectAllowed: '',
        setData: vi.fn(),
      },
      currentTarget: {
        innerHTML: '<div>Item</div>',
      },
    } as any;

    act(() => {
      result.current.handleDragStart(mockEvent, 1);
    });

    expect(result.current.draggedIndex).toBe(1);
    expect(mockEvent.dataTransfer.effectAllowed).toBe('move');
    expect(mockEvent.dataTransfer.setData).toHaveBeenCalledWith('text/html', '<div>Item</div>');
  });

  it('should handle drag enter', () => {
    const { result } = renderHook(() =>
      useDragAndDrop({
        items: mockItems,
        onReorder: mockOnReorder,
      })
    );

    const mockEvent = {
      preventDefault: vi.fn(),
    } as any;

    // First set draggedIndex
    act(() => {
      const dragStartEvent = {
        dataTransfer: {
          effectAllowed: '',
          setData: vi.fn(),
        },
        currentTarget: {
          innerHTML: '<div>Item</div>',
        },
      } as any;

      result.current.handleDragStart(dragStartEvent, 0);
    });

    // Now handle drag enter
    act(() => {
      result.current.handleDragEnter(mockEvent, 2);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(result.current.dragOverIndex).toBe(2);
  });

  it('should handle drag over', () => {
    const { result } = renderHook(() =>
      useDragAndDrop({
        items: mockItems,
        onReorder: mockOnReorder,
      })
    );

    const mockEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        dropEffect: '',
      },
    } as any;

    act(() => {
      result.current.handleDragOver(mockEvent, 1);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.dataTransfer.dropEffect).toBe('move');
  });

  it('should handle drop and reorder items (drag down)', () => {
    const { result } = renderHook(() =>
      useDragAndDrop({
        items: mockItems,
        onReorder: mockOnReorder,
      })
    );

    // Set up initial drag state (dragging item at index 0)
    act(() => {
      const dragStartEvent = {
        dataTransfer: {
          effectAllowed: '',
          setData: vi.fn(),
        },
        currentTarget: {
          innerHTML: '<div>Item</div>',
        },
      } as any;

      result.current.handleDragStart(dragStartEvent, 0);
    });

    const mockDropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as any;

    // Drop at index 2 (moving item from 0 to position before index 2)
    act(() => {
      result.current.handleDrop(mockDropEvent, 2);
    });

    expect(mockDropEvent.preventDefault).toHaveBeenCalled();
    expect(mockDropEvent.stopPropagation).toHaveBeenCalled();
    // When dragging from 0 to 2, item1 should be placed at position 2
    expect(mockOnReorder).toHaveBeenCalledWith(['item2', 'item3', 'item1', 'item4']);
    expect(result.current.draggedIndex).toBeNull();
    expect(result.current.dragOverIndex).toBeNull();
  });

  it('should handle drop and reorder items (drag up)', () => {
    const { result } = renderHook(() =>
      useDragAndDrop({
        items: mockItems,
        onReorder: mockOnReorder,
      })
    );

    // Set up initial drag state (dragging item at index 3)
    act(() => {
      const dragStartEvent = {
        dataTransfer: {
          effectAllowed: '',
          setData: vi.fn(),
        },
        currentTarget: {
          innerHTML: '<div>Item</div>',
        },
      } as any;

      result.current.handleDragStart(dragStartEvent, 3);
    });

    const mockDropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as any;

    // Drop at index 1 (moving item from 3 to position 1)
    act(() => {
      result.current.handleDrop(mockDropEvent, 1);
    });

    expect(mockOnReorder).toHaveBeenCalledWith(['item1', 'item4', 'item2', 'item3']);
  });

  it('should not reorder when dropping at same position', () => {
    const { result } = renderHook(() =>
      useDragAndDrop({
        items: mockItems,
        onReorder: mockOnReorder,
      })
    );

    // Set up initial drag state
    act(() => {
      const dragStartEvent = {
        dataTransfer: {
          effectAllowed: '',
          setData: vi.fn(),
        },
        currentTarget: {
          innerHTML: '<div>Item</div>',
        },
      } as any;

      result.current.handleDragStart(dragStartEvent, 1);
    });

    const mockDropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as any;

    // Drop at same index
    act(() => {
      result.current.handleDrop(mockDropEvent, 1);
    });

    expect(mockOnReorder).not.toHaveBeenCalled();
  });

  it('should handle drag end', () => {
    const { result } = renderHook(() =>
      useDragAndDrop({
        items: mockItems,
        onReorder: mockOnReorder,
      })
    );

    // Set some drag state
    act(() => {
      const dragStartEvent = {
        dataTransfer: {
          effectAllowed: '',
          setData: vi.fn(),
        },
        currentTarget: {
          innerHTML: '<div>Item</div>',
        },
      } as any;

      result.current.handleDragStart(dragStartEvent, 1);
    });

    const mockEvent = {
      preventDefault: vi.fn(),
    } as any;

    act(() => {
      result.current.handleDragEnd(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(result.current.draggedIndex).toBeNull();
    expect(result.current.dragOverIndex).toBeNull();
  });

  it('should handle drag leave', () => {
    const { result } = renderHook(() =>
      useDragAndDrop({
        items: mockItems,
        onReorder: mockOnReorder,
      })
    );

    // Set drag state first
    act(() => {
      const dragStartEvent = {
        dataTransfer: {
          effectAllowed: '',
          setData: vi.fn(),
        },
        currentTarget: {
          innerHTML: '<div>Item</div>',
        },
      } as any;

      result.current.handleDragStart(dragStartEvent, 0);
    });

    // Set dragOverIndex
    act(() => {
      const dragEnterEvent = {
        preventDefault: vi.fn(),
      } as any;
      result.current.handleDragEnter(dragEnterEvent, 2);
    });

    expect(result.current.dragOverIndex).toBe(2);

    // Now handle drag leave
    const mockEvent = {
      preventDefault: vi.fn(),
    } as any;

    act(() => {
      result.current.handleDragLeave(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(result.current.dragOverIndex).toBeNull();
  });
});