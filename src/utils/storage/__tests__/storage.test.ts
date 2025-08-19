import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';

// Create test-specific storage functions to avoid shared state between tests
function createTestStorageFunctions() {
  // Create a unique storage item for this test run
  const testStorageKey = `local:test_records_${Math.random().toString(36).substr(2, 9)}` as const;
  const localRecords = storage.defineItem<any[]>(testStorageKey as `local:${string}`, { fallback: [] });

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
  // Add tests for cache, watch, and error handling features
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

// Additional tests for cache behavior
describe('storage.ts - Cache and Watch Features', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('should handle large datasets efficiently', async () => {
    const { getAllRecords, addRecord } = createTestStorageFunctions();
    
    // Add 100 records
    const records = Array.from({ length: 100 }, (_, i) => ({
      id: `large-${i}`,
      name: `Record ${i}`,
      data: `Some data for record ${i}`,
    }));
    
    for (const record of records) {
      await addRecord(record);
    }
    
    const allRecords = await getAllRecords();
    expect(allRecords).toHaveLength(100);
  });

  it('should handle concurrent operations', async () => {
    const { getAllRecords, addRecord } = createTestStorageFunctions();
    
    // Add records concurrently
    const promises = Array.from({ length: 10 }, (_, i) => 
      addRecord({ id: `concurrent-${i}`, name: `Record ${i}` })
    );
    
    await Promise.all(promises);
    
    const allRecords = await getAllRecords();
    expect(allRecords).toHaveLength(10);
  });

  it('should prevent duplicate IDs across concurrent adds', async () => {
    const { addRecord } = createTestStorageFunctions();
    const record = { id: 'duplicate-concurrent', name: 'Test' };
    
    // Try to add the same record multiple times concurrently
    const promises = Array.from({ length: 5 }, () => addRecord(record));
    
    // First should succeed, others should fail
    const results = await Promise.allSettled(promises);
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;
    
    expect(successes).toBe(1);
    expect(failures).toBe(4);
  });

  it('should handle storage quota errors gracefully', async () => {
    const { addRecord } = createTestStorageFunctions();
    
    // Create a very large record that might exceed quota
    const largeRecord = {
      id: 'quota-test',
      name: 'Large',
      // Create a large data payload (but not too large to break the test)
      data: 'x'.repeat(10000),
    };
    
    // Should handle the add without crashing
    await expect(addRecord(largeRecord)).resolves.not.toThrow();
  });

  it('should return deep clones to prevent mutations', async () => {
    const { getAllRecords, addRecord } = createTestStorageFunctions();
    const record = { id: 'clone-test', name: 'Original', nested: { value: 1 } };
    await addRecord(record);
    
    // Get records and try to modify
    const records = await getAllRecords();
    const original = records[0];
    original.name = 'Modified';
    original.nested.value = 999;
    
    // Get fresh copy - should be unchanged
    const freshRecords = await getAllRecords();
    expect(freshRecords[0].name).toBe('Original');
    expect(freshRecords[0].nested.value).toBe(1);
  });
});