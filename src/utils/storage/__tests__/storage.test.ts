import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

let store: StoredRecord[] = [];

vi.mock('#imports', () => {
  const getValue = vi.fn(async (): Promise<StoredRecord[]> => [...store]);
  const setValue = vi.fn(async (value: StoredRecord[]): Promise<void> => { store = [...value]; });
  const removeValue = vi.fn(async (): Promise<void> => { store = []; });
  const mockedDefineItem = vi.fn(() => ({
    getValue,
    setValue,
    removeValue,
  }));
  return { storage: { defineItem: mockedDefineItem } };
});

import {
  getAllRecords,
  getRecordById,
  addRecord,
  updateRecord,
  removeRecord,
  clearAllRecords,
  StoredRecord,
} from '@/utils/storage';

describe('storage.ts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    store = [];
    await clearAllRecords();
  });

  afterEach(async () => {
    store = [];
    await clearAllRecords();
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
      store = [];
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
      store = [];
      const record: StoredRecord = { id: '1', name: 'Test Record' };
      await addRecord(record);
      const result = await getRecordById('1');
      expect(result).toEqual(record);
    });
  });

  describe('addRecord', () => {
    it('should add a new record successfully', async () => {
      store = [];
      const record: StoredRecord = { id: '1', name: 'New Record' };
      await addRecord(record);
      const records = await getAllRecords();
      expect(records).toContainEqual(record);
      expect(records.length).toBe(1);
    });

    it('should throw an error when adding a duplicate ID', async () => {
      store = [];
      const record: StoredRecord = { id: '1', name: 'Record' };
      await addRecord(record);
      await expect(addRecord(record)).rejects.toThrow(
        'Record with ID "1" already exists.'
      );
    });
  });

  describe('updateRecord', () => {
    it('should update an existing record', async () => {
      store = [];
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
      store = [];
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
      store = [];
      const record: StoredRecord = { id: '1', name: 'Record' };
      await addRecord(record);
      await removeRecord('nonexistent');
      const records = await getAllRecords();
      expect(records).toEqual([record]);
    });
  });

  describe('clearAllRecords', () => {
    it('should clear all records from storage', async () => {
      store = [];
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
      store = [];
      const record: StoredRecord = { id: '1', name: 'Cached' };
      await addRecord(record);
      await getAllRecords();
      await getAllRecords();
    });

    it('should update cache on modification', async () => {
      store = [];
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
      const module = await import('#imports');
      const mockedModule = vi.mocked(module);
      mockedModule.storage.defineItem().getValue.mockRejectedValueOnce(new Error('Storage error'));
      const records = await getAllRecords();
      expect(records).toEqual([]);
    });
    it('should throw on storage write failure', async () => {
      const module = await import('#imports');
      const mockedModule = vi.mocked(module);
      mockedModule.storage.defineItem().setValue.mockRejectedValueOnce(new Error('Write error'));
      const record: StoredRecord = { id: '1', name: 'Record' };
      await expect(addRecord(record)).rejects.toThrow('Storage update failed');
    });
  });
});
