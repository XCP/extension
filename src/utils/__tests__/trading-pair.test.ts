import { describe, it, expect } from 'vitest';
import {
  getTradingPair,
  isBuyOrder,
  isQuoteAsset,
  getOrderPricePerUnit,
  getOrderBaseAmount,
  getOrderQuoteAmount,
  getMatchPricePerUnit,
} from '../trading-pair';

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

  describe('getOrderPricePerUnit', () => {
    it('should calculate price for sell order (giving base)', () => {
      const order = {
        give_asset: 'RAREPEPE',
        get_asset: 'XCP',
        give_quantity_normalized: '100',
        get_quantity_normalized: '50',
        give_remaining_normalized: '100',
        get_remaining_normalized: '50',
      };
      // Selling 100 RAREPEPE for 50 XCP = 0.5 XCP per RAREPEPE
      expect(getOrderPricePerUnit(order, 'RAREPEPE')).toBe(0.5);
    });

    it('should calculate price for buy order (giving quote)', () => {
      const order = {
        give_asset: 'XCP',
        get_asset: 'RAREPEPE',
        give_quantity_normalized: '50',
        get_quantity_normalized: '100',
        give_remaining_normalized: '50',
        get_remaining_normalized: '100',
      };
      // Buying 100 RAREPEPE with 50 XCP = 0.5 XCP per RAREPEPE
      expect(getOrderPricePerUnit(order, 'RAREPEPE')).toBe(0.5);
    });

    it('should return 0 when quantity is zero', () => {
      const order = {
        give_asset: 'RAREPEPE',
        get_asset: 'XCP',
        give_quantity_normalized: '0',
        get_quantity_normalized: '50',
        give_remaining_normalized: '0',
        get_remaining_normalized: '50',
      };
      expect(getOrderPricePerUnit(order, 'RAREPEPE')).toBe(0);
    });
  });

  describe('getOrderBaseAmount', () => {
    it('should return give_remaining for sell orders', () => {
      const order = {
        give_asset: 'RAREPEPE',
        get_asset: 'XCP',
        give_quantity_normalized: '100',
        get_quantity_normalized: '50',
        give_remaining_normalized: '75',
        get_remaining_normalized: '37.5',
      };
      expect(getOrderBaseAmount(order, 'RAREPEPE')).toBe(75);
    });

    it('should return get_remaining for buy orders', () => {
      const order = {
        give_asset: 'XCP',
        get_asset: 'RAREPEPE',
        give_quantity_normalized: '50',
        get_quantity_normalized: '100',
        give_remaining_normalized: '37.5',
        get_remaining_normalized: '75',
      };
      expect(getOrderBaseAmount(order, 'RAREPEPE')).toBe(75);
    });
  });

  describe('getOrderQuoteAmount', () => {
    it('should return get_remaining for sell orders', () => {
      const order = {
        give_asset: 'RAREPEPE',
        get_asset: 'XCP',
        give_quantity_normalized: '100',
        get_quantity_normalized: '50',
        give_remaining_normalized: '75',
        get_remaining_normalized: '37.5',
      };
      expect(getOrderQuoteAmount(order, 'RAREPEPE')).toBe(37.5);
    });

    it('should return give_remaining for buy orders', () => {
      const order = {
        give_asset: 'XCP',
        get_asset: 'RAREPEPE',
        give_quantity_normalized: '50',
        get_quantity_normalized: '100',
        give_remaining_normalized: '37.5',
        get_remaining_normalized: '75',
      };
      expect(getOrderQuoteAmount(order, 'RAREPEPE')).toBe(37.5);
    });
  });

  describe('getMatchPricePerUnit', () => {
    it('should calculate price when forward_asset is base', () => {
      const match = {
        forward_asset: 'RAREPEPE',
        backward_asset: 'XCP',
        forward_quantity_normalized: '100',
        backward_quantity_normalized: '50',
      };
      // 100 RAREPEPE matched for 50 XCP = 0.5 XCP per RAREPEPE
      expect(getMatchPricePerUnit(match, 'RAREPEPE')).toBe(0.5);
    });

    it('should calculate price when backward_asset is base', () => {
      const match = {
        forward_asset: 'XCP',
        backward_asset: 'RAREPEPE',
        forward_quantity_normalized: '50',
        backward_quantity_normalized: '100',
      };
      // 100 RAREPEPE matched for 50 XCP = 0.5 XCP per RAREPEPE
      expect(getMatchPricePerUnit(match, 'RAREPEPE')).toBe(0.5);
    });

    it('should return 0 when base quantity is zero', () => {
      const match = {
        forward_asset: 'RAREPEPE',
        backward_asset: 'XCP',
        forward_quantity_normalized: '0',
        backward_quantity_normalized: '50',
      };
      expect(getMatchPricePerUnit(match, 'RAREPEPE')).toBe(0);
    });
  });
});
