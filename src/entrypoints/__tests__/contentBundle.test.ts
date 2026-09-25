import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The content script is injected into every page, and content scripts cannot be code-split: any
// import, even a dynamic one, is inlined. It must reach the provider only through the client proxy.
describe('content script imports', () => {
  it('never imports the provider service implementation', () => {
    const source = readFileSync('src/entrypoints/content.ts', 'utf8');
    expect(source).not.toMatch(/['"]@\/services\/providerService['"]/);
    expect(source).toMatch(/['"]@\/services\/providerServiceClient['"]/);
  });
});
