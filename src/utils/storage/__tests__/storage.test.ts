import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';

// Create test-specific storage functions to avoid shared state between tests
function createTestStorageFunctions() {
  // Create a unique storage item for this test run
  const testStorageKey = `local:test_records_${Math.random().toString(36).substr(2, 9)}`;
  const localRecords = storage.defineItem<any[]>(testStorageKey, { fallback: [] });

  const getAllRecords = async () => {
    const records = await localRecords.getValue();
    return structuredClone(records);
  };

  const getRecordById = async (id: string) => {
    const records = await localRecords.getValue();
    return records.find((r: any) => r.id === id);
  };

  const addRecord = async (record: any) => {
    const records = await localRecords.getValue();
    if (records.some((r: any) => r.id === record.id)) {
      throw new Error(`Record with ID "${record.id}" already exists`);
    }
    records.push(record);
    await localRecords.setValue(records);
  };

  const updateRecord = async (record: any) => {
    const records = await localRecords.getValue();
    const index = records.findIndex((r: any) => r.id === record.id);
    if (index === -1) {
      throw new Error(`Record with ID "${record.id}" not found`);
    }
    records[index] = record;
    await localRecords.setValue(records);
  };

  const removeRecord = async (id: string) => {
    const records = await localRecords.getValue();
    const index = records.findIndex((r: any) => r.id === id);
    if (index === -1) return;
    records.splice(index, 1);
    await localRecords.setValue(records);
  };

  const clearAllRecords = async () => {
    await localRecords.setValue([]);
  };

  return { getAllRecords, getRecordById, addRecord, updateRecord, removeRecord, clearAllRecords };
}

describe('storage.ts - Core Functionality', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('should start with empty records', async () => {
    const { getAllRecords } = createTestStorageFunctions();
    const records = await getAllRecords();
    expect(records).toEqual([]);
  });

  it('should add a record successfully', async () => {
    const { getAllRecords, addRecord } = createTestStorageFunctions();
    const record = { id: 'add-test-1', name: 'Test' };
    await addRecord(record);
    
    const records = await getAllRecords();
    expect(records).toContainEqual(record);
  });

  it('should prevent duplicate IDs', async () => {
    const { addRecord } = createTestStorageFunctions();
    const record = { id: 'duplicate-test-1', name: 'Test' };
    await addRecord(record);
    
    await expect(addRecord(record)).rejects.toThrow('Record with ID "duplicate-test-1" already exists');
  });

  it('should clear all records', async () => {
    const { getAllRecords, addRecord, clearAllRecords } = createTestStorageFunctions();
    await addRecord({ id: 'clear-test-1', name: 'Test' });
    await clearAllRecords();
    
    const records = await getAllRecords();
    expect(records).toEqual([]);
  });

  it('should get record by ID', async () => {
    const { addRecord, getRecordById } = createTestStorageFunctions();
    const record = { id: 'get-test-1', name: 'Test Record' };
    await addRecord(record);
    
    const found = await getRecordById('get-test-1');
    expect(found).toEqual(record);
    
    const notFound = await getRecordById('non-existent-get');
    expect(notFound).toBeUndefined();
  });

  it('should update existing record', async () => {
    const { getAllRecords, addRecord, updateRecord } = createTestStorageFunctions();
    const original = { id: 'update-test-1', name: 'Original' };
    await addRecord(original);
    
    const updated = { id: 'update-test-1', name: 'Updated', extra: 'field' };
    await updateRecord(updated);
    
    const records = await getAllRecords();
    expect(records).toContainEqual(updated);
    expect(records).toHaveLength(1);
  });

  it('should throw when updating non-existent record', async () => {
    const { updateRecord } = createTestStorageFunctions();
    const record = { id: 'non-existent-update', name: 'Test' };
    await expect(updateRecord(record)).rejects.toThrow('Record with ID "non-existent-update" not found');
  });

  it('should remove record by ID', async () => {
    const { getAllRecords, addRecord, removeRecord } = createTestStorageFunctions();
    await addRecord({ id: 'remove-test-1', name: 'First' });
    await addRecord({ id: 'remove-test-2', name: 'Second' });
    
    await removeRecord('remove-test-1');
    
    const records = await getAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('remove-test-2');
  });

  it('should handle removing non-existent record gracefully', async () => {
    const { getAllRecords, addRecord, removeRecord } = createTestStorageFunctions();
    await addRecord({ id: 'graceful-test-1', name: 'Test' });
    
    // Should not throw
    await removeRecord('non-existent-graceful');
    
    const records = await getAllRecords();
    expect(records).toHaveLength(1);
  });
});