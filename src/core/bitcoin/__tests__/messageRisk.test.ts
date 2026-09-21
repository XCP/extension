import { describe, expect, it } from 'vitest';
import { getMessageSigningRisks } from '../messageRisk';

const keys = (message: string) => getMessageSigningRisks(message).map((risk) => risk.key);

describe('getMessageSigningRisks', () => {
  it('finds nothing wrong with ordinary text', () => {
    expect(keys('Sign in to example.com at 2026-08-08')).toEqual([]);
    expect(keys('Multi\nline\tmessage with punctuation: £ € 日本語')).toEqual([]);
  });

  // The attack this exists for: the right-to-left override renders the text after it in reverse,
  // so the string signed and the string shown can name different recipients.
  it('flags characters that reorder what is displayed', () => {
    expect(keys('pay ‮bob‬')).toContain('deceptive-characters');
    expect(keys('‪shadowed‬')).toContain('deceptive-characters');
    expect(keys('first⁦isolated⁩')).toContain('deceptive-characters');
  });

  it('flags characters that render as nothing', () => {
    // Two messages that look identical but sign differently.
    expect(keys('alice​bob')).toContain('deceptive-characters');
    expect(keys('soft­hyphen')).toContain('deceptive-characters');
    expect(keys('﻿bom')).toContain('deceptive-characters');
    expect(keys('zero‍width‌joiner')).toContain('deceptive-characters');
  });

  it('flags control characters while allowing tab and newline', () => {
    expect(keys('bell')).toContain('control-characters');
    expect(keys('escape[31m')).toContain('control-characters');
    expect(keys('delete')).toContain('control-characters');
    // Tab and newline are ordinary in a signed message and must not warn.
    expect(keys('tab\there')).toEqual([]);
    expect(keys('line\nbreak')).toEqual([]);
    expect(keys('windows\r\nline')).toEqual([]);
  });

  it('says what an empty signature actually proves', () => {
    expect(keys('')).toEqual(['empty-message']);
  });

  it('reports every reason that applies', () => {
    expect(keys('‮reordered')).toEqual([
      'deceptive-characters',
      'control-characters',
    ]);
  });
});
