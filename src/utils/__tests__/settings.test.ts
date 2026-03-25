/**
 * Settings Regression Tests
 *
 * Guards DEFAULT_SETTINGS values, SETTINGS_VERSION, auto-lock timer mappings,
 * and type constraints to catch accidental changes.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  AUTO_LOCK_TIMEOUT_MS,
  VALID_AUTO_LOCK_TIMERS,
  getAutoLockTimeoutMs,
  type AutoLockTimer,
} from '../settings';

describe('SETTINGS_VERSION', () => {
  it('is 2', () => {
    expect(SETTINGS_VERSION).toBe(2);
  });
});

describe('AUTO_LOCK_TIMEOUT_MS', () => {
  it('maps 1m to 60000ms', () => {
    expect(AUTO_LOCK_TIMEOUT_MS['1m']).toBe(60_000);
  });

  it('maps 5m to 300000ms', () => {
    expect(AUTO_LOCK_TIMEOUT_MS['5m']).toBe(300_000);
  });

  it('maps 15m to 900000ms', () => {
    expect(AUTO_LOCK_TIMEOUT_MS['15m']).toBe(900_000);
  });

  it('maps 30m to 1800000ms', () => {
    expect(AUTO_LOCK_TIMEOUT_MS['30m']).toBe(1_800_000);
  });

  it('has exactly 4 entries', () => {
    expect(Object.keys(AUTO_LOCK_TIMEOUT_MS)).toHaveLength(4);
  });
});

describe('VALID_AUTO_LOCK_TIMERS', () => {
  it('contains all timer keys', () => {
    expect(VALID_AUTO_LOCK_TIMERS).toEqual(['1m', '5m', '15m', '30m']);
  });

  it('matches AUTO_LOCK_TIMEOUT_MS keys', () => {
    expect(VALID_AUTO_LOCK_TIMERS.sort()).toEqual(
      Object.keys(AUTO_LOCK_TIMEOUT_MS).sort()
    );
  });
});

describe('getAutoLockTimeoutMs', () => {
  it.each([
    ['1m', 60_000],
    ['5m', 300_000],
    ['15m', 900_000],
    ['30m', 1_800_000],
  ] as [AutoLockTimer, number][])('returns %dms for %s', (timer, expected) => {
    expect(getAutoLockTimeoutMs(timer)).toBe(expected);
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('has version equal to SETTINGS_VERSION', () => {
    expect(DEFAULT_SETTINGS.version).toBe(SETTINGS_VERSION);
  });

  it('has no active wallet/address by default', () => {
    expect(DEFAULT_SETTINGS.lastActiveWalletId).toBeUndefined();
    expect(DEFAULT_SETTINGS.lastActiveAddress).toBeUndefined();
  });

  it('auto-locks after 5m', () => {
    expect(DEFAULT_SETTINGS.autoLockTimer).toBe('5m');
  });

  it('defaults to USD and BTC price unit', () => {
    expect(DEFAULT_SETTINGS.fiat).toBe('usd');
    expect(DEFAULT_SETTINGS.priceUnit).toBe('btc');
  });

  it('has standard pinned assets', () => {
    expect(DEFAULT_SETTINGS.pinnedAssets).toContain('XCP');
    expect(DEFAULT_SETTINGS.pinnedAssets).toContain('PEPECASH');
    expect(Array.isArray(DEFAULT_SETTINGS.pinnedAssets)).toBe(true);
  });

  it('has help text disabled by default', () => {
    expect(DEFAULT_SETTINGS.showHelpText).toBe(false);
  });

  it('has analytics allowed by default', () => {
    expect(DEFAULT_SETTINGS.analyticsAllowed).toBe(true);
  });

  it('has empty connected websites', () => {
    expect(DEFAULT_SETTINGS.connectedWebsites).toEqual([]);
  });

  it('allows unconfirmed transactions', () => {
    expect(DEFAULT_SETTINGS.allowUnconfirmedTxs).toBe(true);
  });

  it('has advanced features disabled by default', () => {
    expect(DEFAULT_SETTINGS.enableMPMA).toBe(false);
    expect(DEFAULT_SETTINGS.enableMoreOutputs).toBe(false);
    expect(DEFAULT_SETTINGS.enableAdvancedBroadcasts).toBe(false);
  });

  it('has dry-run disabled', () => {
    expect(DEFAULT_SETTINGS.transactionDryRun).toBe(false);
  });

  it('points to correct Counterparty API base', () => {
    expect(DEFAULT_SETTINGS.counterpartyApiBase).toBe('https://api.counterparty.io:4000');
  });

  it('has default order expiration of 8064 blocks', () => {
    expect(DEFAULT_SETTINGS.defaultOrderExpiration).toBe(8064);
  });

  it('has strict transaction verification enabled', () => {
    expect(DEFAULT_SETTINGS.strictTransactionVerification).toBe(true);
  });

  it('has not visited recover bitcoin page', () => {
    expect(DEFAULT_SETTINGS.hasVisitedRecoverBitcoin).toBe(false);
  });

  it('snapshot matches expected shape', () => {
    // Catches any new field additions or removals
    const keys = Object.keys(DEFAULT_SETTINGS).sort();
    expect(keys).toEqual([
      'allowUnconfirmedTxs',
      'analyticsAllowed',
      'autoLockTimer',
      'connectedWebsites',
      'counterpartyApiBase',
      'defaultOrderExpiration',
      'enableAdvancedBroadcasts',
      'enableMPMA',
      'enableMoreOutputs',
      'fiat',
      'hasVisitedRecoverBitcoin',
      'lastActiveAddress',
      'lastActiveWalletId',
      'pinnedAssets',
      'priceUnit',
      'showHelpText',
      'strictTransactionVerification',
      'transactionDryRun',
      'version',
    ]);
  });
});
