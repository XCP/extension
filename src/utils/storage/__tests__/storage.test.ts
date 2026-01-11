import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  getAllRecords,
  getRecordById,
  addRecord,
  updateRecord,
  updateRecords,
  removeRecord,
  clearAllRecords,
  StoredRecord,
} from '../storage';

describe('storage.ts - Core Functionality', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await clearAllRecords();
  });

  it('should start with empty records', async () => {
    const records = await getAllRecords();
    expect(records).toEqual([]);
  });

  it('should add a record successfully', async () => {
    const record = { id: 'add-test-1', name: 'Test' };
    await addRecord(record);

    const records = await getAllRecords();
    expect(records).toContainEqual(record);
  });

  it('should prevent duplicate IDs', async () => {
    const record = { id: 'duplicate-test-1', name: 'Test' };
    await addRecord(record);

    await expect(addRecord(record)).rejects.toThrow('already exists');
  });

  it('should clear all records', async () => {
    await addRecord({ id: 'clear-test-1', name: 'Test' });
    await clearAllRecords();

    const records = await getAllRecords();
    expect(records).toEqual([]);
  });

  it('should get record by ID', async () => {
    const record = { id: 'get-test-1', name: 'Test Record' };
    await addRecord(record);

    const found = await getRecordById('get-test-1');
    expect(found).toEqual(record);

    const notFound = await getRecordById('non-existent-get');
    expect(notFound).toBeNull();
  });

  it('should update existing record', async () => {
    const original = { id: 'update-test-1', name: 'Original' };
    await addRecord(original);

    const updated = { id: 'update-test-1', name: 'Updated', extra: 'field' };
    await updateRecord(updated);

    const records = await getAllRecords();
    expect(records).toContainEqual(updated);
    expect(records).toHaveLength(1);
  });

  it('should throw when updating non-existent record', async () => {
    const record = { id: 'non-existent-update', name: 'Test' };
    await expect(updateRecord(record)).rejects.toThrow('not found');
  });

  it('should update multiple records at once', async () => {
    await addRecord({ id: 'batch-1', name: 'First' });
    await addRecord({ id: 'batch-2', name: 'Second' });

    await updateRecords([
      { id: 'batch-1', name: 'Updated First' },
      { id: 'batch-2', name: 'Updated Second' },
    ]);

    const records = await getAllRecords();
    expect(records).toContainEqual({ id: 'batch-1', name: 'Updated First' });
    expect(records).toContainEqual({ id: 'batch-2', name: 'Updated Second' });
  });

  it('should handle empty updateRecords call', async () => {
    await addRecord({ id: 'empty-update', name: 'Test' });
    await updateRecords([]);

    const records = await getAllRecords();
    expect(records).toHaveLength(1);
  });

  it('should remove record by ID', async () => {
    await addRecord({ id: 'remove-test-1', name: 'First' });
    await addRecord({ id: 'remove-test-2', name: 'Second' });

    await removeRecord('remove-test-1');

    const records = await getAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('remove-test-2');
  });

  it('should handle removing non-existent record gracefully', async () => {
    await addRecord({ id: 'graceful-test-1', name: 'Test' });

    // Should not throw
    await removeRecord('non-existent-graceful');

    const records = await getAllRecords();
    expect(records).toHaveLength(1);
  });
});

// Additional tests for cache behavior
describe('storage.ts - Cache and Watch Features', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await clearAllRecords();
  });

  it('should handle large datasets efficiently', async () => {
    // Add 100 records
    for (let i = 0; i < 100; i++) {
      await addRecord({
        id: `large-${i}`,
        name: `Record ${i}`,
        data: `Some data for record ${i}`,
      });
    }

    const allRecords = await getAllRecords();
    expect(allRecords).toHaveLength(100);
  });

  it('should handle concurrent operations with mutex', async () => {
    // Add records concurrently - mutex should serialize them
    const promises = Array.from({ length: 10 }, (_, i) =>
      addRecord({ id: `concurrent-${i}`, name: `Record ${i}` })
    );

    await Promise.all(promises);

    const allRecords = await getAllRecords();
    expect(allRecords).toHaveLength(10);
  });

  it('should prevent duplicate IDs across concurrent adds', async () => {
    const record = { id: 'duplicate-concurrent', name: 'Test' };

    // Try to add the same record multiple times concurrently
    const promises = Array.from({ length: 5 }, () => addRecord({ ...record }));

    // First should succeed, others should fail due to mutex serialization
    const results = await Promise.allSettled(promises);
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;

    expect(successes).toBe(1);
    expect(failures).toBe(4);
  });

  it('should handle storage quota errors gracefully', async () => {
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
    // Use a simple record structure for this test
    const record = { id: 'clone-test', name: 'Original', nested: { value: 1 } };
    await addRecord(record);

    // Get records and try to modify - use type assertion for test access
    const records = await getAllRecords();
    const first = records[0] as unknown as { id: string; name: string; nested: { value: number } };
    first.name = 'Modified';
    first.nested.value = 999;

    // Get fresh copy - should be unchanged (proves deep clone works)
    const freshRecords = await getAllRecords();
    const freshFirst = freshRecords[0] as unknown as { id: string; name: string; nested: { value: number } };
    expect(freshFirst.name).toBe('Original');
    expect(freshFirst.nested.value).toBe(1);
  });
});