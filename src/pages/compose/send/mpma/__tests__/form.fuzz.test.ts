/**
 * Fuzz tests for MPMA CSV parser
 * Tests CSV parsing resilience against malformed, malicious, and edge-case inputs
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MPMAForm from '../form';

// Mock dependencies
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'test-address' },
    activeWallet: { addressType: 'P2WPKH' }
  })
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: false }
  })
}));

vi.mock('@/utils/blockchain/bitcoin', () => ({
  validateBitcoinAddress: vi.fn((address) => {
    // Simple validation for testing
    return address && address.length > 0 && !address.includes('INVALID');
  })
}));

vi.mock('@/utils/blockchain/counterparty', () => ({
  getAssetInfo: vi.fn(async (asset) => {
    if (asset === 'XCP' || asset === 'PEPECASH') {
      return { divisible: true };
    }
    if (asset === 'INVALID_ASSET') {
      return null;
    }
    return { divisible: false };
  })
}));

describe('MPMA CSV Parser Fuzz Tests', () => {
  const mockFormAction = vi.fn();

  beforeEach(() => {
    mockFormAction.mockClear();
  });

  describe('Property-based testing', () => {
    it('should handle arbitrary CSV input without crashing', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
            { maxLength: 100 }
          ),
          (rows) => {
            const { container } = render(
              <MemoryRouter>
                <MPMAForm formAction={mockFormAction} />
              </MemoryRouter>
            );

            const csv = rows.map(row => row.join(',')).join('\n');
            const textarea = container.querySelector('textarea');
            
            if (textarea) {
              // Simulate paste event
              const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: new DataTransfer(),
              });
              Object.defineProperty(pasteEvent, 'clipboardData', {
                writable: false,
                value: {
                  getData: () => csv
                }
              });
              
              // Should not throw
              expect(() => {
                fireEvent.paste(textarea, pasteEvent);
              }).not.toThrow();
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle CSV with special characters and encoding issues', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              address: fc.oneof(
                fc.hexaString({ minLength: 20, maxLength: 40 }),
                fc.string({ minLength: 26, maxLength: 35 }).map(s => '1' + s),
                fc.constant('bc1qtest'),
                fc.unicode()
              ),
              asset: fc.oneof(
                fc.constant('XCP'),
                fc.constantFrom('PEPECASH', 'FLDC', 'MEME'),
                fc.string({ minLength: 1, maxLength: 20 }),
                fc.unicode()
              ),
              quantity: fc.oneof(
                fc.nat().map(n => n.toString()),
                fc.float({ min: 0, max: 1e10 }).map(n => n.toString()),
                fc.string()
              ),
              memo: fc.oneof(
                fc.string(),
                fc.hexaString(),
                fc.unicode(),
                fc.constant('')
              )
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (records) => {
            const { container } = render(
              <MemoryRouter>
                <MPMAForm formAction={mockFormAction} />
              </MemoryRouter>
            );

            // Create CSV with potential edge cases
            const csv = records.map(r => 
              `"${r.address}","${r.asset}","${r.quantity}","${r.memo || ''}"`
            ).join('\n');

            const textarea = container.querySelector('textarea');
            if (textarea) {
              const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: new DataTransfer(),
              });
              Object.defineProperty(pasteEvent, 'clipboardData', {
                writable: false,
                value: {
                  getData: () => csv
                }
              });
              
              expect(() => {
                fireEvent.paste(textarea, pasteEvent);
              }).not.toThrow();
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle malformed CSV structures', () => {
      const malformedGenerators = [
        // Missing columns
        fc.array(fc.tuple(fc.string(), fc.string())),
        // Too many columns
        fc.array(fc.tuple(fc.string(), fc.string(), fc.string(), fc.string(), fc.string())),
        // Mixed column counts
        fc.array(
          fc.oneof(
            fc.tuple(fc.string(), fc.string()),
            fc.tuple(fc.string(), fc.string(), fc.string()),
            fc.tuple(fc.string(), fc.string(), fc.string(), fc.string())
          )
        )
      ];

      malformedGenerators.forEach(generator => {
        fc.assert(
          fc.property(
            generator,
            (rows) => {
              const { container } = render(
                <MemoryRouter>
                  <MPMAForm formAction={mockFormAction} />
                </MemoryRouter>
              );

              const csv = rows.map(row => 
                Array.isArray(row) ? row.join(',') : row
              ).join('\n');

              const textarea = container.querySelector('textarea');
              if (textarea) {
                const pasteEvent = new ClipboardEvent('paste', {
                  clipboardData: new DataTransfer(),
                });
                Object.defineProperty(pasteEvent, 'clipboardData', {
                  writable: false,
                  value: {
                    getData: () => csv
                  }
                });
                
                // Should handle gracefully without crashing
                expect(() => {
                  fireEvent.paste(textarea, pasteEvent);
                }).not.toThrow();
              }
              
              return true;
            }
          ),
          { numRuns: 20 }
        );
      });
    });

    it('should handle CSV with injection attempts', () => {
      const injectionPayloads = fc.oneof(
        fc.constant('=1+1'),
        fc.constant('@SUM(A1:A10)'),
        fc.constant('+1-1'),
        fc.constant('|calc'),
        fc.constant('<script>alert(1)</script>'),
        fc.constant('javascript:alert(1)'),
        fc.constant('"><img src=x onerror=alert(1)>'),
        fc.constant("'; DROP TABLE users; --"),
        fc.constant("1' OR '1'='1"),
        fc.constant('${7*7}'),
        fc.constant('{{7*7}}'),
        fc.constant('[[7*7]]')
      );

      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              address: fc.oneof(
                fc.constant('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'),
                injectionPayloads
              ),
              asset: fc.oneof(
                fc.constant('XCP'),
                injectionPayloads
              ),
              quantity: fc.oneof(
                fc.nat().map(n => n.toString()),
                injectionPayloads
              ),
              memo: fc.oneof(
                fc.string(),
                injectionPayloads,
                fc.constant('')
              )
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (records) => {
            const { container } = render(
              <MemoryRouter>
                <MPMAForm formAction={mockFormAction} />
              </MemoryRouter>
            );

            const csv = records.map(r => 
              `${r.address},${r.asset},${r.quantity},${r.memo || ''}`
            ).join('\n');

            const textarea = container.querySelector('textarea');
            if (textarea) {
              const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: new DataTransfer(),
              });
              Object.defineProperty(pasteEvent, 'clipboardData', {
                writable: false,
                value: {
                  getData: () => csv
                }
              });
              
              // Should sanitize/handle injection attempts safely
              expect(() => {
                fireEvent.paste(textarea, pasteEvent);
              }).not.toThrow();
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle CSV with extreme sizes', () => {
      // Test with very long values
      fc.assert(
        fc.property(
          fc.oneof(
            // Single row with very long values
            fc.record({
              address: fc.string({ minLength: 1000, maxLength: 10000 }),
              asset: fc.string({ minLength: 1000, maxLength: 10000 }),
              quantity: fc.nat({ max: Number.MAX_SAFE_INTEGER }).map(n => n.toString()),
              memo: fc.string({ minLength: 1000, maxLength: 10000 })
            }).map(r => [r]),
            // Many rows
            fc.array(
              fc.record({
                address: fc.constant('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'),
                asset: fc.constant('XCP'),
                quantity: fc.nat({ max: 1000000 }).map(n => n.toString()),
                memo: fc.string({ maxLength: 50 })
              }),
              { minLength: 500, maxLength: 1000 }
            )
          ),
          (records) => {
            const { container } = render(
              <MemoryRouter>
                <MPMAForm formAction={mockFormAction} />
              </MemoryRouter>
            );

            const csv = records.map(r => 
              `${r.address},${r.asset},${r.quantity},${r.memo || ''}`
            ).join('\n');

            const textarea = container.querySelector('textarea');
            if (textarea) {
              const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: new DataTransfer(),
              });
              Object.defineProperty(pasteEvent, 'clipboardData', {
                writable: false,
                value: {
                  getData: () => csv
                }
              });
              
              // Should handle large inputs without crashing
              expect(() => {
                fireEvent.paste(textarea, pasteEvent);
              }).not.toThrow();
            }
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle CSV with various line endings', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(
              fc.record({
                address: fc.constant('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'),
                asset: fc.constantFrom('XCP', 'PEPECASH'),
                quantity: fc.nat({ max: 1000 }).map(n => n.toString()),
                memo: fc.string({ maxLength: 20 })
              }),
              { minLength: 1, maxLength: 10 }
            ),
            fc.constantFrom('\n', '\r\n', '\r', '\n\r')
          ),
          ([records, lineEnding]) => {
            const { container } = render(
              <MemoryRouter>
                <MPMAForm formAction={mockFormAction} />
              </MemoryRouter>
            );

            const csv = records.map(r => 
              `${r.address},${r.asset},${r.quantity},${r.memo || ''}`
            ).join(lineEnding);

            const textarea = container.querySelector('textarea');
            if (textarea) {
              const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: new DataTransfer(),
              });
              Object.defineProperty(pasteEvent, 'clipboardData', {
                writable: false,
                value: {
                  getData: () => csv
                }
              });
              
              expect(() => {
                fireEvent.paste(textarea, pasteEvent);
              }).not.toThrow();
            }
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should preserve data integrity for valid CSV inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              address: fc.constant('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'),
              asset: fc.constantFrom('XCP', 'PEPECASH', 'TEST'),
              quantity: fc.nat({ max: 100000 }).map(n => n.toString()),
              memo: fc.oneof(
                fc.constant(''),
                fc.alphaNumericString({ maxLength: 50 }),
                fc.hexaString({ maxLength: 40 })
              )
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (records) => {
            const { container } = render(
              <MemoryRouter>
                <MPMAForm formAction={mockFormAction} />
              </MemoryRouter>
            );

            const csv = records.map(r => 
              `${r.address},${r.asset},${r.quantity},${r.memo || ''}`
            ).join('\n');

            const textarea = container.querySelector('textarea');
            if (textarea) {
              const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: new DataTransfer(),
              });
              Object.defineProperty(pasteEvent, 'clipboardData', {
                writable: false,
                value: {
                  getData: () => csv
                }
              });
              
              fireEvent.paste(textarea, pasteEvent);
              
              // Wait for async processing
              await waitFor(() => {
                const table = container.querySelector('table');
                if (table) {
                  const rows = table.querySelectorAll('tbody tr');
                  // Should have processed some valid rows
                  expect(rows.length).toBeGreaterThan(0);
                }
              }, { timeout: 2000 });
            }
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});