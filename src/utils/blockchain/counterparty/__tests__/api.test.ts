import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchTokenBalances,
  fetchTokenBalance,
  fetchTokenUtxos,
  fetchAssetDetails,
  fetchAssetDetailsAndBalance,
  fetchUtxoBalances,
  fetchOrders,
  fetchOrder,
  fetchTransaction,
  fetchTransactions,
  fetchAddressDispensers,
  fetchDispenserByHash,
  fetchOwnedAssets,
  fetchOrdersByPair,
  fetchOrderMatches,
  fetchServerInfo,
  AssetInfo,
  TokenBalance,
  Order,
  OrderDetails,
  Transaction,
  Dispenser,
  OwnedAsset,
} from '../api';
import * as formatUtils from '@/utils/format';
import * as bitcoinBalance from '@/utils/blockchain/bitcoin/balance';
import * as settingsStorage from '@/utils/storage/settingsStorage';
import { apiClient } from '@/utils/axios';
import { CounterpartyApiError } from '@/utils/blockchain/errors';

// Mock dependencies
vi.mock('@/utils/axios');
vi.mock('@/utils/format');
vi.mock('@/utils/blockchain/bitcoin/balance');
vi.mock('@/utils/storage/settingsStorage');

const mockedApiClient = vi.mocked(apiClient, true);
const mockedFormatAmount = vi.mocked(formatUtils.formatAmount);
const mockedFetchBTCBalance = vi.mocked(bitcoinBalance.fetchBTCBalance);
const mockedGetSettings = vi.mocked(settingsStorage.getSettings);

// Test data
const mockAddress = 'bc1qtest123address';
const mockApiBase = 'https://api.counterparty.io:4000';
const mockSettings = { counterpartyApiBase: mockApiBase };

const mockTokenBalance: TokenBalance = {
  asset: 'XCP',
  quantity: 100000000,
  quantity_normalized: '1.00000000',
  asset_info: {
    asset_longname: null,
    description: 'The Counterparty protocol token',
    issuer: '1BTCorgHwCg6u2YSAWKgS17qUad6kHmtQW',
    divisible: true,
    locked: false,
    supply: 2649755.0,
  },
};

const mockAssetInfo: AssetInfo = {
  asset: 'XCP',
  asset_longname: null,
  description: 'The Counterparty protocol token',
  issuer: '1BTCorgHwCg6u2YSAWKgS17qUad6kHmtQW',
  divisible: true,
  locked: false,
  supply: 2649755.0,
  supply_normalized: '2649755.00000000',
};

const mockOrder: Order = {
  tx_hash: 'abc123',
  block_time: 1640995200,
  give_asset: 'XCP',
  get_asset: 'BTC',
  give_quantity_normalized: '100.00000000',
  get_quantity_normalized: '0.01000000',
  give_remaining_normalized: '50.00000000',
  get_remaining_normalized: '0.00500000',
  status: 'open',
  expire_index: 700000,
};

const mockTransaction: Transaction = {
  tx_hash: 'abc123',
  block_index: 680000,
  block_time: 1640995200,
  source: mockAddress,
  destination: 'bc1qdest456address',
  type: 'send',
  status: 'valid',
  data: { asset: 'XCP', quantity: 100000000 },
  supported: true,
  unpacked_data: {
    message_type: 'send',
    message_data: { asset: 'XCP', quantity: 100000000 },
  },
};

describe('counterparty/api.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockResolvedValue(mockSettings as any);
  });

  describe('fetchTokenBalances', () => {
    it('should return token balances array on valid response', async () => {
      const mockData = {
        result: [mockTokenBalance],
      };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const balances = await fetchTokenBalances(mockAddress, { verbose: true });

      expect(Array.isArray(balances)).toBe(true);
      expect(balances[0]).toEqual(mockTokenBalance);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/addresses/${mockAddress}/balances`,
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: true,
            limit: 100,
            offset: 0,
          }),
        })
      );
    });

    it('should return empty array if response format is invalid', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const balances = await fetchTokenBalances(mockAddress);

      expect(balances).toEqual([]);
    });

    it('should handle custom options correctly', async () => {
      const mockData = { result: [mockTokenBalance] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchTokenBalances(mockAddress, {
        limit: 50,
        offset: 10,
        verbose: false,
        sort: 'asset',
      } as any);

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: false,
            limit: 50,
            offset: 10,
            sort: 'asset',
          }),
        })
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchTokenBalances(mockAddress)).rejects.toThrow(CounterpartyApiError);
    });

    it('should return empty array for non-array result', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: 'invalid' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const balances = await fetchTokenBalances(mockAddress);

      expect(balances).toEqual([]);
    });
  });

  describe('fetchTokenBalance', () => {
    it('should return token balance for existing asset', async () => {
      const mockData = { result: [mockTokenBalance] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const balance = await fetchTokenBalance(mockAddress, 'XCP');

      expect(balance).toEqual({
        asset: 'XCP',
        quantity: 100000000,
        asset_info: mockTokenBalance.asset_info,
        quantity_normalized: '1',
      });
    });

    it('should return zero balance for non-existent asset', async () => {
      const mockData = { result: [] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const balance = await fetchTokenBalance(mockAddress, 'NONEXISTENT');

      expect(balance).toEqual({
        asset: 'NONEXISTENT',
        quantity: 0,
        quantity_normalized: '0',
        asset_info: {
          asset_longname: null,
          description: '',
          issuer: '',
          divisible: true,
          locked: false,
        },
      });
    });

    it('should filter out UTXOs when excludeUtxos is true', async () => {
      const mockBalanceWithUtxo = {
        ...mockTokenBalance,
        utxo: 'abc123:0',
        quantity: 50000000,
        quantity_normalized: '0.50000000',
      };
      const mockBalanceWithoutUtxo = {
        ...mockTokenBalance,
        quantity: 25000000,
        quantity_normalized: '0.25000000',
      };
      const mockData = {
        result: [mockBalanceWithUtxo, mockBalanceWithoutUtxo]
      };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const balance = await fetchTokenBalance(mockAddress, 'XCP', { 
        excludeUtxos: true 
      } as any);

      expect(balance?.quantity).toBe(25000000);
      expect(balance?.quantity_normalized).toBe('0.25');
    });

    it('should aggregate multiple balances', async () => {
      const balance1 = { ...mockTokenBalance, quantity: 50000000, quantity_normalized: '0.5' };
      const balance2 = { ...mockTokenBalance, quantity: 25000000, quantity_normalized: '0.25' };
      const mockData = { result: [balance1, balance2] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const balance = await fetchTokenBalance(mockAddress, 'XCP');

      expect(balance?.quantity).toBe(75000000);
      expect(balance?.quantity_normalized).toBe('0.75');
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchTokenBalance(mockAddress, 'XCP')).rejects.toThrow(CounterpartyApiError);
    });

    it('should return zero balance for missing result', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const balance = await fetchTokenBalance(mockAddress, 'XCP');

      // Now returns zero balance instead of null for missing result
      expect(balance).toEqual({
        asset: 'XCP',
        quantity: 0,
        quantity_normalized: '0',
        asset_info: {
          asset_longname: null,
          description: '',
          issuer: '',
          divisible: true,
          locked: false,
        },
      });
    });
  });

  describe('fetchTokenUtxos', () => {
    it('should return UTXOs with token balances', async () => {
      const mockUtxoBalance = {
        ...mockTokenBalance,
        utxo: 'abc123:0',
        utxo_address: mockAddress,
      };
      const mockData = { result: [mockUtxoBalance] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const utxos = await fetchTokenUtxos(mockAddress, 'XCP');

      expect(utxos).toEqual([mockUtxoBalance]);
    });

    it('should filter out balances without UTXO information', async () => {
      const mockBalanceWithUtxo = { ...mockTokenBalance, utxo: 'abc123:0' };
      const mockBalanceWithoutUtxo = { ...mockTokenBalance, utxo: null };
      const mockData = { result: [mockBalanceWithUtxo, mockBalanceWithoutUtxo] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const utxos = await fetchTokenUtxos(mockAddress, 'XCP');

      expect(utxos).toEqual([mockBalanceWithUtxo]);
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchTokenUtxos(mockAddress, 'XCP')).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchAssetDetails', () => {
    it('should return asset details for valid asset', async () => {
      const mockData = { result: mockAssetInfo };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const assetDetails = await fetchAssetDetails('XCP');

      expect(assetDetails).toEqual(mockAssetInfo);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/assets/XCP`,
        expect.objectContaining({
          params: { verbose: true },
        })
      );
    });

    it('should return null for non-existent asset', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const assetDetails = await fetchAssetDetails('NONEXISTENT');

      expect(assetDetails).toBeNull();
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchAssetDetails('XCP')).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchAssetDetailsAndBalance', () => {
    it('should handle BTC specially', async () => {
      mockedFetchBTCBalance.mockResolvedValue(100000000); // 1 BTC in satoshis
      mockedFormatAmount.mockReturnValue('1.00000000');

      const result = await fetchAssetDetailsAndBalance('BTC', mockAddress);

      expect(result.isDivisible).toBe(true);
      expect(result.assetInfo.asset).toBe('BTC');
      expect(result.assetInfo.description).toBe('Bitcoin');
      expect(result.availableBalance).toBe('1.00000000');
      expect(mockedFetchBTCBalance).toHaveBeenCalledWith(mockAddress);
    });

    it('should fetch asset details and balance for non-BTC assets', async () => {
      const mockAssetResponse = {
        data: { result: mockAssetInfo },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any;
      mockedApiClient.get.mockResolvedValueOnce(mockAssetResponse);
      
      // Mock fetchTokenBalance call within the function
      const mockBalance = { quantity_normalized: '100.00000000' };
      const mockBalanceResponse = {
        data: { result: [mockBalance] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any;
      mockedApiClient.get.mockResolvedValueOnce(mockBalanceResponse);

      const result = await fetchAssetDetailsAndBalance('XCP', mockAddress);

      expect(result.isDivisible).toBe(mockAssetInfo.divisible);
      expect(result.assetInfo).toEqual(mockAssetInfo);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/assets/XCP`,
        expect.any(Object)
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchAssetDetailsAndBalance('BADTOKEN', mockAddress)).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchUtxoBalances', () => {
    it('should fetch UTXO balances successfully', async () => {
      const mockUtxoBalance = {
        asset: 'XCP',
        quantity_normalized: '1.00000000',
        utxo: 'abc123:0',
        utxo_address: mockAddress,
      };
      const mockData = {
        result: [mockUtxoBalance],
        next_cursor: null,
        result_count: 1,
      };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUtxoBalances('abc123:0');

      expect(result).toEqual(mockData);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/utxos/abc123:0/balances`,
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: true,
            show_unconfirmed: false,
          }),
        })
      );
    });

    it('should handle custom options', async () => {
      const mockData = { result: [], next_cursor: null, result_count: 0 };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchUtxoBalances('abc123:0', {
        cursor: 'next123',
        limit: 50,
        offset: 10,
        show_unconfirmed: true,
      } as any);

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            cursor: 'next123',
            limit: 50,
            offset: 10,
            verbose: true,
            show_unconfirmed: true,
          }),
        })
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchUtxoBalances('abc123:0')).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchOrders', () => {
    it('should fetch orders successfully', async () => {
      const mockData = {
        result: [mockOrder],
        result_count: 1,
      };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchOrders(mockAddress);

      expect(result.orders).toEqual([mockOrder]);
      expect(result.total).toBe(1);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/addresses/${mockAddress}/orders`,
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: true,
          }),
        })
      );
    });

    it('should handle filter options', async () => {
      const mockData = { result: [mockOrder], result_count: 1 };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchOrders(mockAddress, {
        status: 'open',
        limit: 50,
        offset: 10,
        verbose: false,
      } as any);

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: false,
            status: 'open',
            limit: 50,
            offset: 10,
          }),
        })
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchOrders(mockAddress)).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchOrder', () => {
    it('should fetch order details successfully', async () => {
      const mockOrderDetails: OrderDetails = {
        ...mockOrder,
        source: mockAddress,
        give_quantity: 100000000,
        get_quantity: 1000000,
        fee_required: 0,
        fee_provided: 1000,
        fee_required_remaining: 0,
        fee_provided_remaining: 500,
        give_price: 0.01,
        get_price: 100,
        confirmed: true,
      };
      mockedApiClient.get.mockResolvedValue({
        data: { result: mockOrderDetails },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchOrder('abc123');

      expect(result).toEqual(mockOrderDetails);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/orders/abc123`,
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: true,
            show_unconfirmed: false,
          }),
        })
      );
    });

    it('should return null for non-existent order', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchOrder('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle custom options', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchOrder('abc123', {
        verbose: false,
        showUnconfirmed: true,
      } as any);

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: false,
            show_unconfirmed: true,
          }),
        })
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchOrder('abc123')).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchTransaction', () => {
    it('should fetch transaction successfully', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: mockTransaction },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchTransaction('abc123');

      expect(result).toEqual(mockTransaction);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/transactions/abc123`,
        expect.objectContaining({
          params: expect.objectContaining({
            show_unconfirmed: true,
            verbose: true,
          }),
        })
      );
    });

    it('should return null for non-existent transaction', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchTransaction('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchTransaction('abc123')).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchTransactions', () => {
    it('should fetch transactions successfully', async () => {
      const mockResponse = {
        result: [mockTransaction],
        result_count: 1,
      };
      mockedApiClient.get.mockResolvedValue({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchTransactions(mockAddress);

      expect(result).toEqual(mockResponse);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/addresses/${mockAddress}/transactions`,
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: true,
            show_unconfirmed: true,
            limit: 20,
            offset: 0,
          }),
        })
      );
    });

    it('should handle custom options', async () => {
      const mockResponse = { result: [], result_count: 0 };
      mockedApiClient.get.mockResolvedValue({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchTransactions(mockAddress, {
        limit: 50,
        offset: 10,
        verbose: false,
        show_unconfirmed: false,
      } as any);

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: false,
            show_unconfirmed: false,
            limit: 50,
            offset: 10,
          }),
        })
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchTransactions(mockAddress)).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchAddressDispensers', () => {
    it('should fetch dispensers successfully', async () => {
      const mockDispenser: Dispenser = {
        tx_hash: 'abc123',
        source: mockAddress,
        asset: 'XCP',
        status: 0,
        give_remaining: 1000000,
        give_remaining_normalized: '10.00000000',
        asset_info: {
          asset_longname: null,
          description: 'Test asset',
          issuer: mockAddress,
          divisible: true,
          locked: false,
        },
      };
      const mockData = {
        result: [mockDispenser],
        result_count: 1,
      };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchAddressDispensers(mockAddress);

      expect(result.dispensers).toEqual([mockDispenser]);
      expect(result.total).toBe(1);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/addresses/${mockAddress}/dispensers`,
        expect.any(Object)
      );
    });

    it('should handle filter options', async () => {
      const mockData = { result: [], result_count: 0 };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchAddressDispensers(mockAddress, {
        status: 'open',
        limit: 50,
        offset: 10,
        verbose: false,
      } as any);

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: false,
            status: 'open',
            limit: 50,
            offset: 10,
          }),
        })
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchAddressDispensers(mockAddress)).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchDispenserByHash', () => {
    it('should fetch dispenser details successfully', async () => {
      const mockDispenser: Dispenser = {
        tx_hash: 'abc123',
        source: mockAddress,
        asset: 'XCP',
        status: 0,
        give_remaining: 1000000,
        give_remaining_normalized: '10.00000000',
      };
      mockedApiClient.get.mockResolvedValue({
        data: { result: mockDispenser },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchDispenserByHash('abc123');

      expect(result).toEqual(mockDispenser);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/dispensers/abc123`,
        expect.objectContaining({
          params: { verbose: true },
        })
      );
    });

    it('should return null for non-existent dispenser', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchDispenserByHash('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchDispenserByHash('abc123')).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchOwnedAssets', () => {
    it('should fetch owned assets successfully', async () => {
      const mockOwnedAsset: OwnedAsset = {
        asset: 'MYTOKEN',
        asset_longname: null,
        supply_normalized: '1000000.00000000',
        description: 'My custom token',
        locked: false,
      };
      const mockData = { result: [mockOwnedAsset] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchOwnedAssets(mockAddress);

      expect(result).toEqual([mockOwnedAsset]);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/addresses/${mockAddress}/assets/owned`,
        expect.objectContaining({
          params: { verbose: true },
        })
      );
    });

    it('should return empty array for no owned assets', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchOwnedAssets(mockAddress);

      expect(result).toEqual([]);
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchOwnedAssets(mockAddress)).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('API base configuration', () => {
    it('should use counterpartyApiBase from settings', async () => {
      const customApiBase = 'https://custom-api.example.com:8080';
      mockedGetSettings.mockResolvedValue({ counterpartyApiBase: customApiBase } as any);
      
      const mockData = { result: [] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchTokenBalances(mockAddress);

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${customApiBase}/v2/addresses/${mockAddress}/balances`,
        expect.any(Object)
      );
    });

    it('should throw on settings retrieval errors', async () => {
      mockedGetSettings.mockRejectedValue(new Error('Settings error'));

      await expect(fetchTokenBalances(mockAddress)).rejects.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete token information flow', async () => {
      // Mock asset details
      const assetResponse = {
        data: { result: mockAssetInfo },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any;
      mockedApiClient.get.mockResolvedValueOnce(assetResponse);
      
      // Mock token balance
      const balanceResponse = {
        data: { result: [mockTokenBalance] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any;
      mockedApiClient.get.mockResolvedValueOnce(balanceResponse);

      const result = await fetchAssetDetailsAndBalance('XCP', mockAddress);

      expect(result.assetInfo).toEqual(mockAssetInfo);
      expect(result.isDivisible).toBe(true);
      expect(mockedApiClient.get).toHaveBeenCalledTimes(2);
    });

    it('should handle pagination correctly', async () => {
      const mockData = { result: [mockTransaction], result_count: 100 };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchTransactions(mockAddress, { 
        limit: 10, 
        offset: 20 
      } as any);

      expect(result.result_count).toBe(100);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            limit: 10,
            offset: 20,
          }),
        })
      );
    });

    it('should handle verbose mode correctly across functions', async () => {
      const mockData = { result: [] };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      // Test multiple functions with verbose: false
      await fetchTokenBalances(mockAddress, { verbose: false });
      await fetchAssetDetails('XCP', { verbose: false });
      await fetchOrders(mockAddress, { verbose: false });

      expect(mockedApiClient.get).toHaveBeenCalledTimes(3);
      mockedApiClient.get.mock.calls.forEach(call => {
        expect(call[1]?.params?.verbose).toBe(false);
      });
    });
  });

  describe('fetchOrdersByPair', () => {
    it('should fetch order book for trading pair', async () => {
      const mockData = {
        result: [mockOrder],
        result_count: 1,
        next_cursor: null,
      };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchOrdersByPair('XCP', 'PEPECASH');

      expect(result.orders).toEqual([mockOrder]);
      expect(result.total).toBe(1);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/orders/XCP/PEPECASH`,
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: true,
          }),
        })
      );
    });

    it('should handle filter options', async () => {
      const mockData = { result: [], result_count: 0, next_cursor: null };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchOrdersByPair('XCP', 'BTC', {
        status: 'open',
        limit: 50,
        offset: 10,
      });

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            status: 'open',
            limit: 50,
            offset: 10,
          }),
        })
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchOrdersByPair('XCP', 'BTC')).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchOrderMatches', () => {
    it('should fetch order matches for an order', async () => {
      const mockMatch = {
        id: 'match123',
        tx0_hash: 'abc123',
        tx0_index: 1,
        tx0_address: mockAddress,
        tx1_hash: 'def456',
        tx1_index: 2,
        tx1_address: 'bc1qother',
        forward_asset: 'XCP',
        forward_quantity: 100000000,
        forward_quantity_normalized: '1.00000000',
        backward_asset: 'BTC',
        backward_quantity: 1000000,
        backward_quantity_normalized: '0.01000000',
        tx0_block_index: 680000,
        tx1_block_index: 680001,
        block_index: 680001,
        block_time: 1640995200,
        match_expire_index: 700000,
        fee_paid: 1000,
        fee_paid_normalized: '0.00001000',
        status: 'completed',
      };
      const mockData = {
        result: [mockMatch],
        result_count: 1,
        next_cursor: null,
      };
      mockedApiClient.get.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchOrderMatches('abc123');

      expect(result.matches).toEqual([mockMatch]);
      expect(result.total).toBe(1);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/orders/abc123/matches`,
        expect.objectContaining({
          params: expect.objectContaining({
            verbose: true,
          }),
        })
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchOrderMatches('abc123')).rejects.toThrow(CounterpartyApiError);
    });
  });

  describe('fetchServerInfo', () => {
    it('should fetch server information', async () => {
      const mockServerInfo = {
        server_ready: true,
        network: 'mainnet',
        version: '10.0.0',
        backend_height: 800000,
        counterparty_height: 800000,
        documentation: 'https://docs.counterparty.io',
        routes: '/v2/routes',
        blueprint: '/apiary.apib',
      };
      mockedApiClient.get.mockResolvedValue({
        data: { result: mockServerInfo },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchServerInfo();

      expect(result).toEqual(mockServerInfo);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        `${mockApiBase}/v2/`,
        expect.any(Object)
      );
    });

    it('should throw CounterpartyApiError on network error', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchServerInfo()).rejects.toThrow(CounterpartyApiError);
    });
  });
});
