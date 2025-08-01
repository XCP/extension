import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  composeTransaction,
  composeBet,
  composeBroadcast,
  composeBTCPay,
  composeBurn,
  composeCancel,
  composeDestroy,
  composeDispenser,
  composeDispense,
  composeDividend,
  getDividendEstimateXcpFee,
  composeIssuance,
  composeMPMA,
  composeOrder,
  composeSend,
  composeSweep,
  getSweepEstimateXcpFee,
  composeFairminter,
  composeFairmint,
  composeAttach,
  getAttachEstimateXcpFee,
  composeDetach,
  composeMove,
  ComposeResult,
  ApiResponse,
  BetOptions,
  BroadcastOptions,
  BTCPayOptions,
  BurnOptions,
  CancelOptions,
  DestroyOptions,
  DispenserOptions,
  DispenseOptions,
  DividendOptions,
  IssuanceOptions,
  MPMAOptions,
  OrderOptions,
  SendOptions,
  SweepOptions,
  FairminterOptions,
  FairmintOptions,
  AttachOptions,
  DetachOptions,
  MoveOptions,
} from '../compose';
import * as settingsStorage from '@/utils/storage/settingsStorage';

// Mock dependencies
vi.mock('axios');
vi.mock('@/utils/storage/settingsStorage');

const mockedAxios = vi.mocked(axios);
const mockedGetKeychainSettings = vi.mocked(settingsStorage.getKeychainSettings);

// Test data
const mockAddress = 'bc1qtest123address';
const mockApiBase = 'https://api.counterparty.io:4000';
const mockSettings = { counterpartyApiBase: mockApiBase };
const mockSatPerVbyte = 10;

const mockComposeResult: ComposeResult = {
  rawtransaction: '0200000001...',
  btc_in: 100000,
  btc_out: 90000,
  btc_change: 8000,
  btc_fee: 2000,
  data: 'counterparty_data_hex',
  lock_scripts: ['script1', 'script2'],
  inputs_values: [100000],
  signed_tx_estimated_size: {
    vsize: 250,
    adjusted_vsize: 250,
    sigops_count: 2,
  },
  psbt: 'cHNidP8BAP0...',
  params: {
    source: mockAddress,
    destination: 'bc1qdest456address',
    asset: 'XCP',
    quantity: 100000000,
    memo: null,
    memo_is_hex: false,
    use_enhanced_send: false,
    no_dispense: false,
    skip_validation: false,
    asset_info: {
      asset_longname: null,
      description: 'Test Asset',
      issuer: mockAddress,
      divisible: true,
      locked: false,
      owner: mockAddress,
    },
    quantity_normalized: '1.00000000',
  },
  name: 'send',
};

const mockApiResponse: ApiResponse = {
  result: mockComposeResult,
};

describe('counterparty/compose.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetKeychainSettings.mockResolvedValue(mockSettings as any);
  });

  describe('composeTransaction', () => {
    it('should compose transaction with correct parameters', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const params = { asset: 'XCP', quantity: '100000000' };
      const result = await composeTransaction('send', params, mockAddress, mockSatPerVbyte);

      expect(result).toEqual(mockApiResponse);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(`${mockApiBase}/v2/addresses/${mockAddress}/compose/send`),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Check URL contains required parameters
      const callArgs = mockedAxios.get.mock.calls[0];
      const urlWithParams = callArgs[0] as string;
      expect(urlWithParams).toContain('sat_per_vbyte=10');
      expect(urlWithParams).toContain('exclude_utxos_with_balances=true');
      expect(urlWithParams).toContain('allow_unconfirmed_inputs=true');
      expect(urlWithParams).toContain('disable_utxo_locks=true');
      expect(urlWithParams).toContain('verbose=true');
      expect(urlWithParams).toContain('asset=XCP');
      expect(urlWithParams).toContain('quantity=100000000');
    });

    it('should handle API errors', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      const params = { asset: 'XCP' };
      await expect(
        composeTransaction('send', params, mockAddress, mockSatPerVbyte)
      ).rejects.toThrow('API Error');
    });

    it('should use settings API base', async () => {
      const customApiBase = 'https://custom-api.example.com';
      mockedGetKeychainSettings.mockResolvedValue({ counterpartyApiBase: customApiBase } as any);
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      await composeTransaction('send', {}, mockAddress, mockSatPerVbyte);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(customApiBase),
        expect.any(Object)
      );
    });
  });

  describe('composeBet', () => {
    it('should compose bet transaction with all options', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: BetOptions = {
        sourceAddress: mockAddress,
        feed_address: 'bc1qfeed123',
        bet_type: 0,
        deadline: 1640995200,
        wager_quantity: 100000000,
        counterwager_quantity: 100000000,
        expiration: 100,
        leverage: 5040,
        target_value: 1000,
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeBet(options);

      expect(result).toEqual(mockApiResponse);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/compose/bet'),
        expect.any(Object)
      );

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('feed_address=bc1qfeed123');
      expect(urlWithParams).toContain('bet_type=0');
      expect(urlWithParams).toContain('deadline=1640995200');
      expect(urlWithParams).toContain('wager_quantity=100000000');
      expect(urlWithParams).toContain('counterwager_quantity=100000000');
      expect(urlWithParams).toContain('expiration=100');
      expect(urlWithParams).toContain('leverage=5040');
      expect(urlWithParams).toContain('target_value=1000');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should use default leverage when not provided', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: BetOptions = {
        sourceAddress: mockAddress,
        feed_address: 'bc1qfeed123',
        bet_type: 0,
        deadline: 1640995200,
        wager_quantity: 100000000,
        counterwager_quantity: 100000000,
        expiration: 100,
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeBet(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('leverage=5040'); // Default value
    });

    it('should omit optional parameters when undefined', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: BetOptions = {
        sourceAddress: mockAddress,
        feed_address: 'bc1qfeed123',
        bet_type: 0,
        deadline: 1640995200,
        wager_quantity: 100000000,
        counterwager_quantity: 100000000,
        expiration: 100,
        sat_per_vbyte: mockSatPerVbyte,
        // target_value and max_fee are undefined
      };

      await composeBet(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).not.toContain('target_value');
      expect(urlWithParams).not.toContain('max_fee');
    });
  });

  describe('composeBroadcast', () => {
    it('should compose broadcast transaction with all options', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: BroadcastOptions = {
        sourceAddress: mockAddress,
        text: 'Test broadcast message',
        value: '100',
        fee_fraction: '0.01',
        timestamp: '1640995200',
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeBroadcast(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('text=Test+broadcast+message');
      expect(urlWithParams).toContain('value=100');
      expect(urlWithParams).toContain('fee_fraction=0.01');
      expect(urlWithParams).toContain('timestamp=1640995200');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should use default values for optional parameters', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: BroadcastOptions = {
        sourceAddress: mockAddress,
        text: 'Test message',
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeBroadcast(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('value=0'); // Default
      expect(urlWithParams).toContain('fee_fraction=0'); // Default
      expect(urlWithParams).toMatch(/timestamp=\d+/); // Generated timestamp
    });
  });

  describe('composeBTCPay', () => {
    it('should compose BTC pay transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: BTCPayOptions = {
        sourceAddress: mockAddress,
        order_match_id: 'match123',
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeBTCPay(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('order_match_id=match123');
      expect(urlWithParams).toContain('max_fee=50000');
    });
  });

  describe('composeBurn', () => {
    it('should compose burn transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: BurnOptions = {
        sourceAddress: mockAddress,
        quantity: 100000000,
        overburn: true,
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeBurn(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('quantity=100000000');
      expect(urlWithParams).toContain('overburn=true');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should use default overburn value', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: BurnOptions = {
        sourceAddress: mockAddress,
        quantity: 100000000,
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeBurn(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('overburn=false'); // Default
    });
  });

  describe('composeCancel', () => {
    it('should compose cancel transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: CancelOptions = {
        sourceAddress: mockAddress,
        offer_hash: '  abc123def456  ', // With whitespace to test trimming
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeCancel(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('offer_hash=abc123def456'); // Should be trimmed
      expect(urlWithParams).toContain('max_fee=50000');
    });
  });

  describe('composeDestroy', () => {
    it('should compose destroy transaction with all options', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: DestroyOptions = {
        sourceAddress: mockAddress,
        asset: 'XCP',
        quantity: 100000000,
        tag: 'destruction_tag',
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeDestroy(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=XCP');
      expect(urlWithParams).toContain('quantity=100000000');
      expect(urlWithParams).toContain('tag=destruction_tag');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should omit tag when not provided', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: DestroyOptions = {
        sourceAddress: mockAddress,
        asset: 'XCP',
        quantity: 100000000,
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeDestroy(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).not.toContain('tag=');
    });
  });

  describe('composeDispenser', () => {
    it('should compose dispenser transaction with all options', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: DispenserOptions = {
        sourceAddress: mockAddress,
        asset: 'XCP',
        give_quantity: 100000000,
        escrow_quantity: 1000000000,
        mainchainrate: 1000,
        status: '1',
        open_address: 'bc1qopen123',
        oracle_address: 'bc1qoracle456',
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeDispenser(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=XCP');
      expect(urlWithParams).toContain('give_quantity=100000000');
      expect(urlWithParams).toContain('escrow_quantity=1000000000');
      expect(urlWithParams).toContain('mainchainrate=1000');
      expect(urlWithParams).toContain('status=1');
      expect(urlWithParams).toContain('open_address=bc1qopen123');
      expect(urlWithParams).toContain('oracle_address=bc1qoracle456');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should use default status when not provided', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: DispenserOptions = {
        sourceAddress: mockAddress,
        asset: 'XCP',
        give_quantity: 100000000,
        escrow_quantity: 1000000000,
        mainchainrate: 1000,
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeDispenser(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('status=0'); // Default
    });
  });

  describe('composeDispense', () => {
    it('should compose dispense transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: DispenseOptions = {
        sourceAddress: mockAddress,
        dispenser: 'abc123',
        quantity: 100000000,
        encoding: 'auto',
        pubkeys: 'pubkey123',
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeDispense(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('dispenser=abc123');
      expect(urlWithParams).toContain('quantity=100000000');
      expect(urlWithParams).toContain('encoding=auto');
      expect(urlWithParams).toContain('pubkeys=pubkey123');
      expect(urlWithParams).toContain('max_fee=50000');
    });
  });

  describe('composeDividend', () => {
    it('should compose dividend transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: DividendOptions = {
        sourceAddress: mockAddress,
        asset: 'MYASSET',
        dividend_asset: 'XCP',
        quantity_per_unit: 1000000,
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeDividend(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=MYASSET');
      expect(urlWithParams).toContain('dividend_asset=XCP');
      expect(urlWithParams).toContain('quantity_per_unit=1000000');
      expect(urlWithParams).toContain('max_fee=50000');
    });
  });

  describe('getDividendEstimateXcpFee', () => {
    it('should get dividend XCP fee estimate', async () => {
      const mockFeeResponse = { result: 5000000 };
      mockedAxios.get.mockResolvedValue({ data: mockFeeResponse });

      const result = await getDividendEstimateXcpFee(mockAddress, 'MYASSET');

      expect(result).toBe(5000000);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/compose/dividend/estimatexcpfees')
      );

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=MYASSET');
    });
  });

  describe('composeIssuance', () => {
    it('should compose issuance transaction with all options', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: IssuanceOptions = {
        sourceAddress: mockAddress,
        asset: 'NEWTOKEN',
        quantity: 1000000000,
        divisible: true,
        lock: false,
        reset: false,
        transfer_destination: 'bc1qtransfer123',
        description: 'My new token',
        pubkeys: 'pubkey123',
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeIssuance(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=NEWTOKEN');
      expect(urlWithParams).toContain('quantity=1000000000');
      expect(urlWithParams).toContain('divisible=true');
      expect(urlWithParams).toContain('lock=false');
      expect(urlWithParams).toContain('reset=false');
      expect(urlWithParams).toContain('transfer_destination=bc1qtransfer123');
      expect(urlWithParams).toContain('description=My+new+token');
      expect(urlWithParams).toContain('pubkeys=pubkey123');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should handle boolean conversion correctly', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: IssuanceOptions = {
        sourceAddress: mockAddress,
        asset: 'NEWTOKEN',
        quantity: 1000000000,
        divisible: false,
        lock: true,
        reset: true,
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeIssuance(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('divisible=false');
      expect(urlWithParams).toContain('lock=true');
      expect(urlWithParams).toContain('reset=true');
    });
  });

  describe('composeMPMA', () => {
    it('should compose MPMA transaction with all arrays', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: MPMAOptions = {
        sourceAddress: mockAddress,
        assets: ['XCP', 'PEPECASH'],
        destinations: ['bc1qdest1', 'bc1qdest2'],
        quantities: ['100000000', '200000000'],
        memos: ['memo1', 'memo2'],
        memos_are_hex: [false, true],
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeMPMA(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('assets=XCP%2CPEPECASH');
      expect(urlWithParams).toContain('destinations=bc1qdest1%2Cbc1qdest2');
      expect(urlWithParams).toContain('quantities=100000000%2C200000000');
      expect(urlWithParams).toContain('memos=memo1%2Cmemo2');
      expect(urlWithParams).toContain('memos_are_hex=false%2Ctrue');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should validate array lengths', async () => {
      const options: MPMAOptions = {
        sourceAddress: mockAddress,
        assets: ['XCP', 'PEPECASH'],
        destinations: ['bc1qdest1'], // Different length
        quantities: ['100000000', '200000000'],
        sat_per_vbyte: mockSatPerVbyte,
      };

      await expect(composeMPMA(options)).rejects.toThrow(
        'Assets, destinations, and quantities must be arrays of the same length.'
      );
    });

    it('should omit empty memo arrays', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: MPMAOptions = {
        sourceAddress: mockAddress,
        assets: ['XCP'],
        destinations: ['bc1qdest1'],
        quantities: ['100000000'],
        memos: [], // Empty array
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeMPMA(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).not.toContain('memos=');
    });
  });

  describe('composeOrder', () => {
    it('should compose order transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: OrderOptions = {
        sourceAddress: mockAddress,
        give_asset: 'XCP',
        give_quantity: 100000000,
        get_asset: 'BTC',
        get_quantity: 1000000,
        expiration: 1000,
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeOrder(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('give_asset=XCP');
      expect(urlWithParams).toContain('give_quantity=100000000');
      expect(urlWithParams).toContain('get_asset=BTC');
      expect(urlWithParams).toContain('get_quantity=1000000');
      expect(urlWithParams).toContain('expiration=1000');
      expect(urlWithParams).toContain('fee_required=0'); // Always 0
      expect(urlWithParams).toContain('max_fee=50000');
    });
  });

  describe('composeSend', () => {
    it('should compose send transaction with all options', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: SendOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        asset: 'XCP',
        quantity: 100000000,
        memo: 'test memo',
        memo_is_hex: false,
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeSend(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('destination=bc1qdest123');
      expect(urlWithParams).toContain('asset=XCP');
      expect(urlWithParams).toContain('quantity=100000000');
      expect(urlWithParams).toContain('memo=test+memo');
      expect(urlWithParams).toContain('memo_is_hex=false');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should omit undefined memo parameters', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: SendOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        asset: 'XCP',
        quantity: 100000000,
        sat_per_vbyte: mockSatPerVbyte,
        // memo and memo_is_hex are undefined
      };

      await composeSend(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).not.toContain('memo=');
      expect(urlWithParams).not.toContain('memo_is_hex=');
    });
  });

  describe('composeSweep', () => {
    it('should compose sweep transaction with all options', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: SweepOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        flags: 1,
        memo: 'sweep memo',
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
        allow_unconfirmed_inputs: true,
      };

      const result = await composeSweep(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('destination=bc1qdest123');
      expect(urlWithParams).toContain('flags=1');
      expect(urlWithParams).toContain('memo=sweep+memo');
      expect(urlWithParams).toContain('allow_unconfirmed_inputs=true');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should use default values', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: SweepOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        flags: 1,
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeSweep(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('memo='); // Empty default
      expect(urlWithParams).toContain('allow_unconfirmed_inputs=true'); // Default
    });
  });

  describe('getSweepEstimateXcpFee', () => {
    it('should get sweep XCP fee estimate', async () => {
      const mockFeeResponse = { result: 5000000 };
      mockedAxios.get.mockResolvedValue({ data: mockFeeResponse });

      const result = await getSweepEstimateXcpFee(mockAddress);

      expect(result).toBe(5000000);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/compose/sweep/estimatexcpfees')
      );
    });
  });

  describe('composeFairminter', () => {
    it('should compose fairminter transaction with all options', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: FairminterOptions = {
        sourceAddress: mockAddress,
        asset: 'FAIRTOKEN',
        price: 1000,
        quantity_by_price: 10,
        max_mint_per_tx: 1000,
        hard_cap: 1000000,
        premint_quantity: 100000,
        start_block: 800000,
        end_block: 900000,
        soft_cap: 500000,
        soft_cap_deadline_block: 850000,
        minted_asset_commission: 0.05,
        burn_payment: true,
        lock_description: true,
        lock_quantity: false,
        divisible: false,
        description: 'Fair minting token',
        encoding: 'p2sh',
        pubkeys: 'pubkey123',
        allow_unconfirmed_inputs: false,
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeFairminter(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=FAIRTOKEN');
      expect(urlWithParams).toContain('price=1000');
      expect(urlWithParams).toContain('quantity_by_price=10');
      expect(urlWithParams).toContain('max_mint_per_tx=1000');
      expect(urlWithParams).toContain('hard_cap=1000000');
      expect(urlWithParams).toContain('premint_quantity=100000');
      expect(urlWithParams).toContain('start_block=800000');
      expect(urlWithParams).toContain('end_block=900000');
      expect(urlWithParams).toContain('soft_cap=500000');
      expect(urlWithParams).toContain('soft_cap_deadline_block=850000');
      expect(urlWithParams).toContain('minted_asset_commission=0.05');
      expect(urlWithParams).toContain('burn_payment=true');
      expect(urlWithParams).toContain('lock_description=true');
      expect(urlWithParams).toContain('lock_quantity=false');
      expect(urlWithParams).toContain('divisible=false');
      expect(urlWithParams).toContain('description=Fair+minting+token');
      expect(urlWithParams).toContain('encoding=p2sh');
      expect(urlWithParams).toContain('pubkeys=pubkey123');
      expect(urlWithParams).toContain('allow_unconfirmed_inputs=true');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should use default values', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: FairminterOptions = {
        sourceAddress: mockAddress,
        asset: 'FAIRTOKEN',
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeFairminter(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('price=0'); // Default
      expect(urlWithParams).toContain('quantity_by_price=1'); // Default
      expect(urlWithParams).toContain('divisible=true'); // Default
      expect(urlWithParams).toContain('encoding=auto'); // Default
      expect(urlWithParams).toContain('allow_unconfirmed_inputs=true'); // Default
    });
  });

  describe('composeFairmint', () => {
    it('should compose fairmint transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: FairmintOptions = {
        sourceAddress: mockAddress,
        asset: 'FAIRTOKEN',
        quantity: 1000,
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeFairmint(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=FAIRTOKEN');
      expect(urlWithParams).toContain('quantity=1000');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should use default quantity', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: FairmintOptions = {
        sourceAddress: mockAddress,
        asset: 'FAIRTOKEN',
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeFairmint(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('quantity=0'); // Default
    });
  });

  describe('composeAttach', () => {
    it('should compose attach transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: AttachOptions = {
        sourceAddress: mockAddress,
        asset: 'XCP',
        quantity: 100000000,
        utxo_value: '546',
        destination_vout: '0',
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeAttach(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=XCP');
      expect(urlWithParams).toContain('quantity=100000000');
      expect(urlWithParams).toContain('utxo_value=546');
      expect(urlWithParams).toContain('destination_vout=0');
      expect(urlWithParams).toContain('max_fee=50000');
    });

    it('should omit optional parameters when undefined', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: AttachOptions = {
        sourceAddress: mockAddress,
        asset: 'XCP',
        quantity: 100000000,
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeAttach(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).not.toContain('utxo_value=');
      expect(urlWithParams).not.toContain('destination_vout=');
    });
  });

  describe('getAttachEstimateXcpFee', () => {
    it('should get attach XCP fee estimate', async () => {
      const mockFeeResponse = { result: 5000000 };
      mockedAxios.get.mockResolvedValue({ data: mockFeeResponse });

      const result = await getAttachEstimateXcpFee(mockAddress);

      expect(result).toBe(5000000);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/compose/attach/estimatexcpfees')
      );
    });
  });

  describe('composeDetach', () => {
    it('should compose detach transaction', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: DetachOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        sat_per_vbyte: mockSatPerVbyte,
      };

      const result = await composeDetach(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('destination=bc1qdest123');
    });
  });

  describe('composeMove', () => {
    it('should compose move transaction with utxo_value', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: MoveOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        utxo_value: '1000',
        sat_per_vbyte: mockSatPerVbyte,
      };

      const result = await composeMove(options);

      expect(result).toEqual(mockApiResponse);
      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('destination=bc1qdest123');
      expect(urlWithParams).toContain('utxo_value=1000');
    });

    it('should omit utxo_value when undefined', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: MoveOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeMove(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).not.toContain('utxo_value=');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle settings retrieval errors', async () => {
      mockedGetKeychainSettings.mockRejectedValue(new Error('Settings error'));

      await expect(
        composeTransaction('send', {}, mockAddress, mockSatPerVbyte)
      ).rejects.toThrow('Settings error');
    });

    it('should handle various parameter types correctly', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      // Test with various numeric parameters
      const options: BetOptions = {
        sourceAddress: mockAddress,
        feed_address: 'bc1qfeed',
        bet_type: 1,
        deadline: 1640995200,
        wager_quantity: 0, // Zero value
        counterwager_quantity: Number.MAX_SAFE_INTEGER, // Large value
        expiration: -1, // Negative value
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeBet(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('wager_quantity=0');
      expect(urlWithParams).toContain(`counterwager_quantity=${Number.MAX_SAFE_INTEGER}`);
      expect(urlWithParams).toContain('expiration=-1');
    });

    it('should handle URL encoding correctly', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: SendOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        asset: 'TOKEN WITH SPACES & SYMBOLS!',
        quantity: 100000000,
        memo: 'Memo with spaces & special chars @#$%',
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeSend(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=TOKEN+WITH+SPACES+%26+SYMBOLS%21');
      expect(urlWithParams).toContain('memo=Memo+with+spaces+%26+special+chars+%40%23%24%25');
    });

    it('should handle empty string parameters', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const options: IssuanceOptions = {
        sourceAddress: mockAddress,
        asset: '',
        quantity: 0,
        divisible: true,
        lock: false,
        reset: false,
        description: '',
        sat_per_vbyte: mockSatPerVbyte,
      };

      await composeIssuance(options);

      const urlWithParams = mockedAxios.get.mock.calls[0][0] as string;
      expect(urlWithParams).toContain('asset=');
      expect(urlWithParams).toContain('quantity=0');
      // Empty description parameter is omitted by URLSearchParams
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete transaction composition flow', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      // Test a complex send transaction
      const options: SendOptions = {
        sourceAddress: mockAddress,
        destination: 'bc1qdest123',
        asset: 'XCP',
        quantity: 100000000,
        memo: 'Integration test',
        memo_is_hex: false,
        sat_per_vbyte: mockSatPerVbyte,
        max_fee: 50000,
      };

      const result = await composeSend(options);

      expect(result.result.rawtransaction).toBe(mockComposeResult.rawtransaction);
      expect(result.result.btc_fee).toBe(mockComposeResult.btc_fee);
      expect(result.result.psbt).toBe(mockComposeResult.psbt);
      expect(mockedGetKeychainSettings).toHaveBeenCalled();
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/compose/send'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should handle different API base configurations', async () => {
      const customApiBase = 'https://testnet-api.counterparty.io:14000';
      mockedGetKeychainSettings.mockResolvedValue({ counterpartyApiBase: customApiBase } as any);
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      await composeSend({
        sourceAddress: mockAddress,
        destination: 'tb1qdest123',
        asset: 'XCP',
        quantity: 100000000,
        sat_per_vbyte: mockSatPerVbyte,
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(customApiBase),
        expect.any(Object)
      );
    });

    it('should maintain parameter consistency across different compose functions', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      // All compose functions should include these base parameters
      const baseChecks = (urlWithParams: string) => {
        expect(urlWithParams).toContain('sat_per_vbyte=10');
        expect(urlWithParams).toContain('exclude_utxos_with_balances=true');
        expect(urlWithParams).toContain('allow_unconfirmed_inputs=true');
        expect(urlWithParams).toContain('disable_utxo_locks=true');
        expect(urlWithParams).toContain('verbose=true');
      };

      // Test multiple compose functions
      await composeSend({
        sourceAddress: mockAddress,
        destination: 'bc1qdest',
        asset: 'XCP',
        quantity: 100,
        sat_per_vbyte: mockSatPerVbyte,
      });
      baseChecks(mockedAxios.get.mock.calls[0][0] as string);

      await composeOrder({
        sourceAddress: mockAddress,
        give_asset: 'XCP',
        give_quantity: 100,
        get_asset: 'BTC',
        get_quantity: 1,
        expiration: 100,
        sat_per_vbyte: mockSatPerVbyte,
      });
      baseChecks(mockedAxios.get.mock.calls[1][0] as string);

      await composeIssuance({
        sourceAddress: mockAddress,
        asset: 'TOKEN',
        quantity: 1000,
        divisible: true,
        lock: false,
        reset: false,
        sat_per_vbyte: mockSatPerVbyte,
      });
      baseChecks(mockedAxios.get.mock.calls[2][0] as string);
    });
  });
});