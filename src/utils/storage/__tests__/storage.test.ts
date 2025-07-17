import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock wxt/storage with a factory function
vi.mock('#imports', () => {
  let store: any[] = []; // In-memory store for the mock
  const mockGetValue = vi.fn(async () => [...store]);
  const mockSetValue = vi.fn(async (value: any[]) => {
    store = [...value];
  });
  const mockRemoveValue = vi.fn(async () => {
    store = [];
  });

  return {
    storage: {
      defineItem: () => ({
        getValue: mockGetValue,
        setValue: mockSetValue,
        removeValue: mockRemoveValue,
      }),
    },
    // Export mocks for spying
    __mocks: {
      getValue: mockGetValue,
      setValue: mockSetValue,
      removeValue: mockRemoveValue,
    },
  };
});

// Import the module under test after mocking
import {
  getAllRecords,
  getRecordById,
  addRecord,
  updateRecord,
  removeRecord,
  clearAllRecords,
  StoredRecord,
} from '@/utils/storage';
import * as mockedStorage from '#imports';

describe('storage.ts', () => {
  beforeEach(async () => {
    await clearAllRecords(); // Reset the mock store
    // Reset mock calls to ensure clean state
    (mockedStorage as any).__mocks.getValue.mockClear();
    (mockedStorage as any).__mocks.setValue.mockClear();
    (mockedStorage as any).__mocks.removeValue.mockClear();
  });

  describe('getAllRecords', () => {
    it('should return an empty array when no records exist', async () => {
      const records = await getAllRecords();
      expect(records).toEqual([]);
    });

    it('should return all stored records', async () => {
      const record1: StoredRecord = { id: '1', name: 'Record 1' };
      const record2: StoredRecord = { id: '2', name: 'Record 2' };
      await addRecord(record1);
      await addRecord(record2);
      const records = await getAllRecords();
      expect(records).toEqual([record1, record2]);
    });

    it('should return a deep copy of records', async () => {
      const record: StoredRecord = { id: '1', data: { nested: 'value' } };
      await addRecord(record);
      const records = await getAllRecords();
      records[0].data.nested = 'modified';
      const freshRecords = await getAllRecords();
      expect(freshRecords[0].data.nested).toBe('value');
    });
  });

  describe('getRecordById', () => {
    it('should return undefined for a non-existent ID', async () => {
      const result = await getRecordById('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should return the correct record by ID', async () => {
      const record: StoredRecord = { id: '1', name: 'Test Record' };
      await addRecord(record);
      const result = await getRecordById('1');
      expect(result).toEqual(record);
    });
  });

  describe('addRecord', () => {
    it('should add a new record successfully', async () => {
      const record: StoredRecord = { id: '1', name: 'New Record' };
      await addRecord(record);
      const records = await getAllRecords();
      expect(records).toContainEqual(record);
      expect(records.length).toBe(1);
    });

    it('should throw an error when adding a duplicate ID', async () => {
      const record: StoredRecord = { id: '1', name: 'Record' };
      await addRecord(record);
      await expect(addRecord(record)).rejects.toThrow(
        'Record with ID "1" already exists.'
      );
    });
  });

  describe('updateRecord', () => {
    it('should update an existing record', async () => {
      const original: StoredRecord = { id: '1', name: 'Original' };
      await addRecord(original);
      const updated: StoredRecord = { id: '1', name: 'Updated' };
      await updateRecord(updated);
      const records = await getAllRecords();
      expect(records).toContainEqual(updated);
      expect(records.length).toBe(1);
    });

    it('should throw an error when updating a non-existent record', async () => {
      const record: StoredRecord = { id: 'nonexistent', name: 'Nope' };
      await expect(updateRecord(record)).rejects.toThrow(
        'Record with ID "nonexistent" not found.'
      );
    });
  });

  describe('removeRecord', () => {
    it('should remove an existing record', async () => {
      const record1: StoredRecord = { id: '1', name: 'Record 1' };
      const record2: StoredRecord = { id: '2', name: 'Record 2' };
      await addRecord(record1);
      await addRecord(record2);
      await removeRecord('1');
      const records = await getAllRecords();
      expect(records).toEqual([record2]);
      expect(records.length).toBe(1);
    });

    it('should do nothing when removing a non-existent ID', async () => {
      const record: StoredRecord = { id: '1', name: 'Record' };
      await addRecord(record);
      await removeRecord('nonexistent');
      const records = await getAllRecords();
      expect(records).toEqual([record]);
    });
  });

  describe('clearAllRecords', () => {
    it('should clear all records from storage', async () => {
      const record1: StoredRecord = { id: '1', name: 'Record 1' };
      const record2: StoredRecord = { id: '2', name: 'Record 2' };
      await addRecord(record1);
      await addRecord(record2);
      await clearAllRecords();
      const records = await getAllRecords();
      expect(records).toEqual([]);
    });
  });

  describe('caching behavior', () => {
    it('should use cache for subsequent reads', async () => {
      const spy = (mockedStorage as any).__mocks.getValue;
      expect(spy).toHaveBeenCalledTimes(0); // Initial state: no calls
      const record: StoredRecord = { id: '1', name: 'Cached' };
      await addRecord(record); // This sets the store
      await getAllRecords(); // First read, should hit storage
      expect(spy).toHaveBeenCalledTimes(1); // After first read: 1 call
      await getAllRecords(); // Second read, should hit cache
      expect(spy).toHaveBeenCalledTimes(1); // Still only 1 call due to caching
    });

    it('should update cache on modification', async () => {
      const record: StoredRecord = { id: '1', name: 'Initial' };
      await addRecord(record);
      const updated: StoredRecord = { id: '1', name: 'Modified' };
      await updateRecord(updated);
      const records = await getAllRecords();
      expect(records).toContainEqual(updated);
    });
  });

  describe('error handling', () => {
    it('should handle storage read failures gracefully', async () => {
      const spy = (mockedStorage as any).__mocks.getValue;
      spy.mockRejectedValueOnce(new Error('Storage error'));
      const records = await getAllRecords();
      expect(records).toEqual([]);
    });

    it('should throw on storage write failure', async () => {
      const spy = (mockedStorage as any).__mocks.setValue;
      spy.mockRejectedValueOnce(new Error('Write error'));
      const record: StoredRecord = { id: '1', name: 'Record' };
      await expect(addRecord(record)).rejects.toThrow('Storage update failed');
    });
  });
});
