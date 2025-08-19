import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { 
  composeBet,
  composeBroadcast,
  composeBTCPay,
  composeMPMA,
  composeFairminter,
  composeFairmint,
  composeAttach,
  getAttachEstimateXcpFee,
  composeDetach,
  composeTransaction
} from '../compose';
import * as settingsStorage from '@/utils/storage/settingsStorage';
import {
  mockAddress,
  mockApiBase,
  mockSettings,
  mockSatPerVbyte,
  createMockComposeResult,
  createMockApiResponse,
  assertComposeUrlCalled,
  testQuantities,
} from './helpers/composeTestHelpers';

// Mock dependencies
vi.mock('axios');
vi.mock('@/utils/storage/settingsStorage');

const mockedAxios = vi.mocked(axios, true);
const mockedGetKeychainSettings = vi.mocked(settingsStorage.getKeychainSettings);

describe('Compose Specialized Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetKeychainSettings.mockResolvedValue(mockSettings as any);
    mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
  });

  describe('composeTransaction (generic)', () => {
    it('should compose generic transaction', async () => {
      const endpoint = 'custom_endpoint';
      const params = { custom_param: 'value' };
      const satPerVbyte = 10;

      const result = await composeTransaction(endpoint, params, mockAddress, satPerVbyte);

      expect(result).toEqual(createMockComposeResult());
      
      const expectedUrl = `${mockApiBase}/v2/addresses/${mockAddress}/compose/${endpoint}`;
      const actualCall = mockedAxios.get.mock.calls[0];
      expect(actualCall[0]).toContain(expectedUrl);
      expect(actualCall[1]?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should handle errors in generic composition', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Composition failed'));

      await expect(
        composeTransaction('endpoint', {}, mockAddress, 10)
      ).rejects.toThrow('Composition failed');
    });
  });

  describe('composeBet', () => {
    const defaultParams = {
      feed_address: 'bc1qfeedaddress',
      bet_type: 0,
      deadline: 1234567890,
      wager_quantity: 10000000,
      counterwager_quantity: 10000000,
      expiration: 100,
      target_value: 1000,
      leverage: 5040,
    };

    it('should compose bet transaction', async () => {
      const result = await composeBet({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'bet', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        target_value: 2000,
      };

      await composeBet({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      expect(url).toContain('target_value=2000');
    });

    it('should handle different bet types', async () => {
      const betTypes = [0, 1, 2, 3]; // Different bet types
      
      for (const bet_type of betTypes) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, bet_type };
        await composeBet({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
        const url = actualCall[0] as string;
        const urlParams = new URLSearchParams(url.split('?')[1]);
        const actualParams = Object.fromEntries(urlParams.entries());
        expect(url).toContain(`bet_type=${bet_type}`);
      }
    });
  });

  describe('composeBroadcast', () => {
    const defaultParams = {
      text: 'Broadcast message',
      value: '100.5',
      fee_fraction: '0.05',
      timestamp: '1234567890',
    };

    it('should compose broadcast transaction', async () => {
      const result = await composeBroadcast({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'broadcast', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        inscription: 'SGVsbG8gV29ybGQ=', // Base64 encoded "Hello World"
        mime_type: 'text/plain',
      };

      await composeBroadcast({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      expect(url).toContain('inscription=SGVsbG8gV29ybGQ%3D');
      expect(url).toContain('mime_type=text%2Fplain');
    });

    it('should handle different broadcast values', async () => {
      const values = ['0', '50.5', '100.0', '999.99'];
      
      for (const value of values) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, value };
        await composeBroadcast({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
        const url = actualCall[0] as string;
        const urlParams = new URLSearchParams(url.split('?')[1]);
        const actualParams = Object.fromEntries(urlParams.entries());
        expect(actualParams.value).toBe(value);
      }
    });
  });

  describe('composeBTCPay', () => {
    const defaultParams = {
      order_match_id: 'match123abc...',
    };

    it('should compose BTC pay transaction', async () => {
      const result = await composeBTCPay({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'btcpay', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        max_fee: 5000,
      };

      await composeBTCPay({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      expect(url).toContain('max_fee=5000');
    });

    it('should handle different order match IDs', async () => {
      const matchIds = ['match1', 'match2', 'match3'];
      
      for (const order_match_id of matchIds) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        await composeBTCPay({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          order_match_id,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const actualParams = Object.fromEntries(urlParams.entries());
        expect(actualParams.order_match_id).toBe(order_match_id);
      }
    });
  });

  describe('composeMPMA', () => {
    const defaultParams = {
      assets: ['ASSET1', 'ASSET2'],
      destinations: ['bc1qdest1', 'bc1qdest2'],
      quantities: ['1000', '2000'],
    };

    it('should compose MPMA transaction', async () => {
      const result = await composeMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'mpma', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        memos: ['memo1', 'memo2'],
        memos_are_hex: [false, false],
      };

      await composeMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      expect(url).toContain('memos=memo1%2Cmemo2');
      expect(url).toContain('memos_are_hex=false%2Cfalse');
    });

    it('should handle different message data', async () => {
      const assetSets = [
        ['ASSET1'],
        ['ASSET1', 'ASSET2'],
        ['ASSET1', 'ASSET2', 'ASSET3'],
      ];
      
      for (const assets of assetSets) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const destinations = assets.map((_, i) => `bc1qdest${i + 1}`);
        const quantities = assets.map((_, i) => `${(i + 1) * 1000}`);
        
        await composeMPMA({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          assets,
          destinations,
          quantities,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
        const url = actualCall[0] as string;
        expect(url).toContain(`assets=${encodeURIComponent(assets.join(','))}`);
      }
    });
  });

  describe('composeFairminter', () => {
    const defaultParams = {
      asset: 'FAIRMINTASSET',
      price: 100000,
      quantity_by_price: 1000,
      max_mint_per_tx: 100,
      hard_cap: 1000000,
      start_block: 800000,
      end_block: 810000,
    };

    it('should compose fairminter transaction', async () => {
      const result = await composeFairminter({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'fairminter', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        burn_payment: true,
        lock_description: false,
        lock_quantity: true,
        divisible: true,
        description: 'Fair mint asset',
        skip_validation: true,
      };

      await composeFairminter({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const actualParams = Object.fromEntries(urlParams.entries());
      expect(url).toContain('burn_payment=true');
      expect(url).toContain('lock_description=false');
      expect(url).toContain('lock_quantity=true');
      expect(url).toContain('divisible=true');
      expect(url).toContain('description=Fair+mint+asset');
    });
  });

  describe('composeFairmint', () => {
    const defaultParams = {
      asset: 'FAIRMINTASSET',
      quantity: 100,
    };

    it('should compose fairmint transaction', async () => {
      const result = await composeFairmint({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'fairmint', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        quantity: 200,
      };

      await composeFairmint({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      expect(url).toContain('quantity=200');
    });

    it('should handle different mint quantities', async () => {
      const quantities = [10, 50, 100, 500];
      
      for (const quantity of quantities) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, quantity };
        await composeFairmint({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const actualParams = Object.fromEntries(urlParams.entries());
        expect(url).toContain(`quantity=${quantity}`);
      }
    });
  });

  describe('composeAttach', () => {
    const defaultParams = {
      asset: 'UTXOASSET',
      quantity: testQuantities.MEDIUM,
    };

    it('should compose attach transaction', async () => {
      const result = await composeAttach({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'attach', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        utxo_value: 10000,
        destination_vout: 1,
      };

      await composeAttach({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      expect(url).toContain('utxo_value=10000');
      expect(url).toContain('destination_vout=1');
    });
  });

  describe('getAttachEstimateXcpFee', () => {
    it('should get attach fee estimate', async () => {
      const mockFeeEstimate = 25000000;
      mockedAxios.get.mockResolvedValueOnce({ data: { result: mockFeeEstimate } });

      const result = await getAttachEstimateXcpFee(mockAddress);

      expect(result).toBe(mockFeeEstimate);
      
      const expectedUrl = `${mockApiBase}/v2/addresses/${mockAddress}/compose/attach/estimatexcpfees`;
      const actualCall = mockedAxios.get.mock.calls[0];
      expect(actualCall[0]).toBe(expectedUrl);
    });
  });

  describe('composeDetach', () => {
    const defaultParams = {
      sourceUtxo: 'abc123def456:0',
      destination: 'bc1qdestination',
    };

    it('should compose detach transaction', async () => {
      const result = await composeDetach({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      
      const expectedUrl = `${mockApiBase}/v2/utxos/${defaultParams.sourceUtxo}/compose/detach`;
      const actualCall = mockedAxios.get.mock.calls[0];
      expect(actualCall[0]).toContain(expectedUrl);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        destination: 'bc1qoptionaldest',
      };

      await composeDetach({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const url = actualCall[0] as string;
      expect(url).toContain('destination=bc1qoptionaldest');
    });

    it('should handle detaching different quantities', async () => {
      const utxos = ['utxo1:0', 'utxo2:1', 'utxo3:0'];
      
      for (const sourceUtxo of utxos) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, sourceUtxo };
        await composeDetach({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
        const url = actualCall[0] as string;
        expect(url).toContain(`/v2/utxos/${sourceUtxo}/compose/detach`);
      }
    });
  });
});