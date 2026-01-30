import { describe, it, expect } from 'vitest';
import { getTradingPair, isBuyOrder, isQuoteAsset } from '../trading-pair';

describe('trading-pair utilities', () => {
  describe('getTradingPair', () => {
    it('should put BTC as quote when paired with any asset', () => {
      expect(getTradingPair('PEPECASH', 'BTC')).toEqual(['PEPECASH', 'BTC']);
      expect(getTradingPair('BTC', 'PEPECASH')).toEqual(['PEPECASH', 'BTC']);
      expect(getTradingPair('RAREPEPE', 'BTC')).toEqual(['RAREPEPE', 'BTC']);
    });

    it('should put XCP as quote when paired with non-BTC assets', () => {
      expect(getTradingPair('PEPECASH', 'XCP')).toEqual(['PEPECASH', 'XCP']);
      expect(getTradingPair('XCP', 'PEPECASH')).toEqual(['PEPECASH', 'XCP']);
      expect(getTradingPair('RAREPEPE', 'XCP')).toEqual(['RAREPEPE', 'XCP']);
    });

    it('should put BTC as quote over XCP (BTC has higher priority)', () => {
      expect(getTradingPair('BTC', 'XCP')).toEqual(['XCP', 'BTC']);
      expect(getTradingPair('XCP', 'BTC')).toEqual(['XCP', 'BTC']);
    });

    it('should put PEPECASH as quote over regular assets', () => {
      expect(getTradingPair('RAREPEPE', 'PEPECASH')).toEqual(['RAREPEPE', 'PEPECASH']);
      expect(getTradingPair('PEPECASH', 'RAREPEPE')).toEqual(['RAREPEPE', 'PEPECASH']);
    });

    it('should use keyword detection for unknown assets with CASH/COIN/MONEY/BTC suffix', () => {
      expect(getTradingPair('SOMECASH', 'MYASSET')).toEqual(['MYASSET', 'SOMECASH']);
      expect(getTradingPair('MYASSET', 'SOMECOIN')).toEqual(['MYASSET', 'SOMECOIN']);
      expect(getTradingPair('MYASSET', 'FASTMONEY')).toEqual(['MYASSET', 'FASTMONEY']);
    });

    it('should use alphabetical order when neither asset is a quote asset', () => {
      expect(getTradingPair('ZEBRA', 'APPLE')).toEqual(['APPLE', 'ZEBRA']);
      expect(getTradingPair('APPLE', 'ZEBRA')).toEqual(['APPLE', 'ZEBRA']);
    });

    it('should use alphabetical order when both assets have keywords', () => {
      expect(getTradingPair('ZCASH', 'ACOIN')).toEqual(['ACOIN', 'ZCASH']);
      expect(getTradingPair('ACOIN', 'ZCASH')).toEqual(['ACOIN', 'ZCASH']);
    });

    it('should handle same asset (edge case)', () => {
      // When both assets are the same, should return them in order
      const result = getTradingPair('XCP', 'XCP');
      expect(result).toEqual(['XCP', 'XCP']);
    });
  });

  describe('isBuyOrder', () => {
    it('should return true when giving quote to get base', () => {
      // Giving XCP to get RAREPEPE = buying RAREPEPE
      expect(isBuyOrder('XCP', 'RAREPEPE')).toBe(true);
      // Giving BTC to get PEPECASH = buying PEPECASH
      expect(isBuyOrder('BTC', 'PEPECASH')).toBe(true);
    });

    it('should return false when giving base to get quote', () => {
      // Giving RAREPEPE to get XCP = selling RAREPEPE
      expect(isBuyOrder('RAREPEPE', 'XCP')).toBe(false);
      // Giving PEPECASH to get BTC = selling PEPECASH
      expect(isBuyOrder('PEPECASH', 'BTC')).toBe(false);
    });

    it('should handle XCP/BTC pair correctly', () => {
      // XCP is base, BTC is quote in this pair
      expect(isBuyOrder('BTC', 'XCP')).toBe(true);  // buying XCP with BTC
      expect(isBuyOrder('XCP', 'BTC')).toBe(false); // selling XCP for BTC
    });
  });

  describe('isQuoteAsset', () => {
    it('should return true for known quote assets', () => {
      expect(isQuoteAsset('BTC')).toBe(true);
      expect(isQuoteAsset('XCP')).toBe(true);
      expect(isQuoteAsset('PEPECASH')).toBe(true);
    });

    it('should return true for assets with quote keywords', () => {
      expect(isQuoteAsset('SOMECASH')).toBe(true);
      expect(isQuoteAsset('MYCOIN')).toBe(true);
      expect(isQuoteAsset('FASTMONEY')).toBe(true);
      expect(isQuoteAsset('MYBTC')).toBe(true);
    });

    it('should return false for regular assets', () => {
      expect(isQuoteAsset('RAREPEPE')).toBe(false);
      expect(isQuoteAsset('MYASSET')).toBe(false);
      expect(isQuoteAsset('SATOSHI')).toBe(false);
    });

    it('should be case-insensitive for keyword detection', () => {
      expect(isQuoteAsset('somecash')).toBe(true);
      expect(isQuoteAsset('SomeCash')).toBe(true);
      expect(isQuoteAsset('SOMECASH')).toBe(true);
    });
  });
});
