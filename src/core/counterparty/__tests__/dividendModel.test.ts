import { describe, expect, it } from 'vitest';
import {
  DIVIDEND_FEE_XCP_PER_HOLDER,
  describeDividendFee,
  describeDividendFeeShortfall,
  getDividendFeeXcp,
  getMaxDividendPerUnit,
} from '@/core/counterparty/dividendModel';

/** A divisible asset with a supply of 1,000 whole units, as `/v2/assets` reports it. */
const SUPPLY = '100000000000';

describe('getDividendFeeXcp', () => {
  it('bills core rate per holder', () => {
    // dividend.py: fee = int(0.0002 * config.UNIT * holder_count)
    expect(getDividendFeeXcp(100)).toBe('0.02');
    expect(getDividendFeeXcp(1)).toBe(DIVIDEND_FEE_XCP_PER_HOLDER);
  });

  it('charges nothing for no holders', () => {
    expect(getDividendFeeXcp(0)).toBe('0');
  });

  it('reports an unknown count as unknown rather than free', () => {
    // A failed holders lookup must not read as a fee of zero — that is the defect this closes.
    expect(getDividendFeeXcp(null)).toBeNull();
    expect(getDividendFeeXcp(undefined)).toBeNull();
    expect(getDividendFeeXcp(Number.NaN)).toBeNull();
  });
});

describe('getMaxDividendPerUnit', () => {
  it('leaves the fee unspent when the dividend is paid in XCP', () => {
    // Core checks dividend_total + fee against the one balance, so a Max that spends all 10 XCP
    // on the payout composes a transaction refused for "insufficient funds (XCP)".
    const perUnit = getMaxDividendPerUnit({
      spendableBalance: '10',
      assetSupply: SUPPLY,
      assetIsDivisible: true,
      dividendAsset: 'XCP',
      feeXcp: getDividendFeeXcp(50), // 0.01 XCP
    });

    expect(perUnit).toBe('0.00999');
    // The whole bill, payout plus fee, still fits inside the balance.
    expect(Number(perUnit) * 1000 + 0.01).toBeLessThanOrEqual(10);
  });

  it('spends the whole balance when the fee is charged in a different asset', () => {
    // A PEPECASH dividend is billed its fee in XCP, which core tests separately.
    expect(
      getMaxDividendPerUnit({
        spendableBalance: '10',
        assetSupply: SUPPLY,
        assetIsDivisible: true,
        dividendAsset: 'PEPECASH',
        feeXcp: getDividendFeeXcp(50),
      })
    ).toBe('0.01');
  });

  it('offers nothing when the XCP fee alone exceeds the balance', () => {
    expect(
      getMaxDividendPerUnit({
        spendableBalance: '0.001',
        assetSupply: SUPPLY,
        assetIsDivisible: true,
        dividendAsset: 'XCP',
        feeXcp: getDividendFeeXcp(50),
      })
    ).toBe('0');
  });

  it('falls back to the whole balance when the holder count is unknown', () => {
    // No worse than composing without the count, and better than withholding Max because one
    // lookup failed.
    expect(
      getMaxDividendPerUnit({
        spendableBalance: '10',
        assetSupply: SUPPLY,
        assetIsDivisible: true,
        dividendAsset: 'XCP',
        feeXcp: null,
      })
    ).toBe('0.01');
  });

  it('does not scale the supply of an indivisible asset', () => {
    expect(
      getMaxDividendPerUnit({
        spendableBalance: '10',
        assetSupply: '1000',
        assetIsDivisible: false,
        dividendAsset: 'PEPECASH',
        feeXcp: null,
      })
    ).toBe('0.01');
  });

  it('rounds the per-unit figure down, since the supply multiplies it back up', () => {
    // 1 XCP over 3 whole units is 0.333… — rounding up would overspend by the supply.
    const perUnit = getMaxDividendPerUnit({
      spendableBalance: '1',
      assetSupply: '300000000',
      assetIsDivisible: true,
      dividendAsset: 'PEPECASH',
      feeXcp: null,
    });

    expect(perUnit).toBe('0.33333333');
    expect(Number(perUnit) * 3).toBeLessThanOrEqual(1);
  });

  it('offers nothing on an asset with no supply', () => {
    expect(
      getMaxDividendPerUnit({
        spendableBalance: '10',
        assetSupply: '0',
        assetIsDivisible: true,
        dividendAsset: 'XCP',
        feeXcp: '0',
      })
    ).toBe('0');
  });
});

describe('describeDividendFeeShortfall', () => {
  it('names the fee and the balance when XCP cannot cover it', () => {
    expect(describeDividendFeeShortfall({ feeXcp: '0.02', xcpBalance: '0.005' })).toBe(
      'This dividend is billed 0.02 XCP in fees, at 0.0002 XCP per holder, and you hold 0.005 XCP.'
    );
  });

  it('says nothing when the balance covers the fee exactly', () => {
    expect(describeDividendFeeShortfall({ feeXcp: '0.02', xcpBalance: '0.02' })).toBeNull();
  });

  it('says nothing while the fee or the balance is unknown', () => {
    expect(describeDividendFeeShortfall({ feeXcp: null, xcpBalance: '0' })).toBeNull();
    expect(describeDividendFeeShortfall({ feeXcp: '0.02', xcpBalance: undefined })).toBeNull();
  });
});

describe('describeDividendFee', () => {
  it('spells out the arithmetic behind the figure', () => {
    expect(describeDividendFee('0.02', 100)).toBe('Plus 0.02 XCP in fees (0.0002 XCP × 100 holders).');
  });

  it('does not say "1 holders"', () => {
    expect(describeDividendFee('0.0002', 1)).toBe('Plus 0.0002 XCP in fees (0.0002 XCP × 1 holder).');
  });

  it('says nothing it cannot back with a count', () => {
    expect(describeDividendFee(null, null)).toBeNull();
  });
});
