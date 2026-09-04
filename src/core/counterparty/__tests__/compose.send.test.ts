import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDieselBalance } from '@/core/alkanes/api';
import { buildDieselMintScript } from '@/core/alkanes/diesel';
import * as apiClientUtils from '@/core/api/client';
import { asBaseUnits } from '@/core/numeric';
import { getActiveSettings } from '@/core/settings';
import { composeDieselSend, composeMove, composeSend, composeSendOrMPMA, composeSweep } from '../compose';
import {
  assertComposeUrlCalled,
  createMockComposeResponse,
  createMockComposeResult,
  mockAddress,
  mockDestAddress,
  mockSatPerVbyte,
  mockSettings,
  testAssets,
  testMemos,
  testQuantities,
} from './helpers/composeTestHelpers';

// Mock dependencies
vi.mock('@/core/api/client');
vi.mock('@/core/alkanes/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/alkanes/api')>();
  return { ...actual, fetchDieselBalance: vi.fn() };
});
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: vi.fn().mockReturnValue(actual.DEFAULT_SETTINGS) };
});

// Mock UTXO selection to prevent real API calls to mempool.space.
// The txid is spelled out rather than imported as `mockInputTxid`: this factory is hoisted
// above the imports and cannot read them. It must stay in step with the composed transaction
// in composeTestHelpers, or the input check has nothing to match and stops testing anything.
vi.mock('@/core/counterparty/utxoSelection', () => ({
  selectUtxosForTransaction: vi.fn().mockResolvedValue({
    utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
    inputsSet: `${'aa'.repeat(32)}:0`,
    totalValue: 100000,
    excludedWithAssets: 0,
  }),
}));

const mockedApiClient = vi.mocked(apiClientUtils.apiClient, true);
const mockedGetSettings = vi.mocked(getActiveSettings);
const mockedFetchDieselBalance = vi.mocked(fetchDieselBalance);

describe('Compose Send Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockReturnValue(mockSettings as any);
    mockedApiClient.get.mockResolvedValue(createMockComposeResponse());
    mockedFetchDieselBalance.mockReset();
  });

  describe('composeDieselSend', () => {
    it('forces carrier inputs and proves the recipient, remainder, and edict outputs', async () => {
      const sourcePayment = p2wpkh(getPublicKey(hexToBytes('22'.repeat(32)), true));
      const destinationPayment = p2wpkh(getPublicKey(hexToBytes('33'.repeat(32)), true));
      const carrierTxid = 'bb'.repeat(32);
      mockedFetchDieselBalance.mockResolvedValue({
        baseUnits: '200000000',
        carriers: [{
          txid: carrierTxid,
          vout: 1,
          value: 330,
          balances: [{ id: '2:0', value: '200000000' }],
        }],
      });
      mockedGetSettings.mockReturnValue({
        ...mockSettings,
        protectAlkanesUtxos: true,
      });
      const transferScript = '6a5d0fff7f818eec8a80c08080c0e5b6de03';
      const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      tx.addInput({
        txid: hexToBytes(carrierTxid),
        index: 1,
        witnessUtxo: { script: sourcePayment.script, amount: 330n },
      });
      tx.addInput({
        txid: hexToBytes('aa'.repeat(32)),
        index: 0,
        witnessUtxo: { script: sourcePayment.script, amount: 100_000n },
      });
      tx.addOutput({ script: destinationPayment.script, amount: 546n });
      tx.addOutput({ script: sourcePayment.script, amount: 330n });
      tx.addOutput({ script: hexToBytes(transferScript), amount: 0n });
      tx.addOutput({ script: sourcePayment.script, amount: 90_000n });
      mockedApiClient.get.mockResolvedValue(createMockComposeResponse({
        rawtransaction: bytesToHex(tx.unsignedTx),
      }));

      const response = await composeDieselSend({
        sourceAddress: sourcePayment.address!,
        destination: destinationPayment.address!,
        amountBaseUnits: '125000000',
        sat_per_vbyte: 10,
      });

      const url = new URL(mockedApiClient.get.mock.calls[0]![0] as string);
      expect(url.searchParams.get('inputs_set')).toBe(`${carrierTxid}:1,${'aa'.repeat(32)}:0`);
      expect(url.searchParams.get('use_all_inputs_set')).toBe('true');
      expect(url.searchParams.get('more_outputs')).toBe(
        `330:${sourcePayment.address},0:${transferScript}`,
      );
      expect(response.result.diesel_transfer).toEqual({
        amount_base_units: '125000000',
        carrier_inputs: [`${carrierTxid}:1`],
        recipient_vout: 0,
        remainder_vout: 1,
        runestone_vout: 2,
      });
    });
  });

  describe('composeSend', () => {
    const defaultParams = {
      destination: mockDestAddress,
      asset: testAssets.XCP,
      quantity: testQuantities.MEDIUM,
    };

    it('should compose send transaction with required parameters', async () => {
      const result = await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'send', defaultParams);
    });

    it('should include optional parameters when provided', async () => {
      const optionalParams = {
        memo: testMemos.TEXT,
        memo_is_hex: false,
      };

      await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      const url = new URL(actualUrl);

      expect(url.searchParams.get('memo')).toBe(testMemos.TEXT);
      expect(url.searchParams.get('memo_is_hex')).toBe('false');
    });

    it('should handle hex memo correctly', async () => {
      const optionalParams = {
        memo: testMemos.HEX,
        memo_is_hex: true,
      };

      await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      expect(actualUrl).toContain(`memo=${encodeURIComponent(testMemos.HEX)}`);
      expect(actualUrl).toContain('memo_is_hex=true');
    });

    it('should handle API errors', async () => {
      const errorMessage = 'API Error';
      mockedApiClient.get.mockRejectedValueOnce(new Error(errorMessage));

      await expect(composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      })).rejects.toThrow(errorMessage);
    });

    it('should handle BTC sends', async () => {
      const btcParams = {
        destination: mockDestAddress,
        asset: testAssets.BTC,
        quantity: asBaseUnits(100000000), // 1 BTC in satoshis
      };

      await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...btcParams,
      });
      assertComposeUrlCalled(mockedApiClient, 'send', btcParams);
    });

    it('reshapes ordinary change into the DIESEL carrier for a +26-vB mint', async () => {
      const key = getPublicKey(hexToBytes('22'.repeat(32)), true);
      const payment = p2wpkh(key);
      const sourceAddress = payment.address!;
      const first = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      first.addInput({
        txid: hexToBytes('aa'.repeat(32)),
        index: 0,
        witnessUtxo: { script: payment.script, amount: 100_000n },
      });
      first.addOutput({ script: Uint8Array.from([0x6a, 0x00]), amount: 0n });
      first.addOutput({ script: payment.script, amount: 330n });
      first.addOutput({ script: hexToBytes(buildDieselMintScript(1)), amount: 0n });
      first.addOutput({ script: payment.script, amount: 99_226n });

      const optimized = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      optimized.addInput({
        txid: hexToBytes('aa'.repeat(32)),
        index: 0,
        witnessUtxo: { script: payment.script, amount: 100_000n },
      });
      optimized.addOutput({ script: Uint8Array.from([0x6a, 0x00]), amount: 0n });
      optimized.addOutput({ script: payment.script, amount: 99_618n });
      optimized.addOutput({ script: hexToBytes(buildDieselMintScript(1)), amount: 0n });
      mockedGetSettings.mockReturnValue({
        ...mockSettings,
        enableDieselMinting: true,
        protectAlkanesUtxos: true,
      });
      mockedApiClient.get
        .mockResolvedValueOnce(createMockComposeResponse({
          rawtransaction: bytesToHex(first.unsignedTx),
          btc_change: 99_226,
          btc_fee: 444,
          signed_tx_estimated_size: { vsize: 222, adjusted_vsize: 222, sigops_count: 1 },
        }))
        .mockResolvedValueOnce(createMockComposeResponse({
          rawtransaction: bytesToHex(optimized.unsignedTx),
          btc_change: 0,
          btc_fee: 382,
          signed_tx_estimated_size: { vsize: 191, adjusted_vsize: 191, sigops_count: 1 },
        }));

      const response = await composeSend({
        sourceAddress,
        destination: mockDestAddress,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        sat_per_vbyte: 2,
      });

      const firstUrl = new URL(mockedApiClient.get.mock.calls[0]![0] as string);
      expect(firstUrl.searchParams.get('encoding')).toBe('opreturn');
      expect(firstUrl.searchParams.get('more_outputs')).toBe(
        `330:${sourceAddress},0:${buildDieselMintScript(1)}`,
      );
      expect(firstUrl.searchParams.get('inputs_set')).toBe(`${'aa'.repeat(32)}:0`);

      const optimizedUrl = new URL(mockedApiClient.get.mock.calls[1]![0] as string);
      expect(optimizedUrl.searchParams.get('exact_fee')).toBe('382');
      expect(optimizedUrl.searchParams.get('inputs_set')).toBe(`${'aa'.repeat(32)}:0`);
      expect(optimizedUrl.searchParams.get('use_all_inputs_set')).toBe('true');
      expect(optimizedUrl.searchParams.get('more_outputs')).toBe(
        `99618:${sourceAddress},0:${buildDieselMintScript(1)}`,
      );
      expect(response.result.diesel_mint).toEqual({
        carrier_vout: 1,
        runestone_vout: 2,
        carrier_sats: 99_618,
        marginal_vbytes: 26,
        estimated_marginal_fee_sats: 52,
        fee_rate_sat_vbyte: 2,
        carrier_kind: 'change',
      });
    });

    it('keeps the verified +57-vB form when there is no separate change to reshape', async () => {
      const key = getPublicKey(hexToBytes('22'.repeat(32)), true);
      const payment = p2wpkh(key);
      const sourceAddress = payment.address!;
      const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      tx.addInput({
        txid: hexToBytes('aa'.repeat(32)),
        index: 0,
        witnessUtxo: { script: payment.script, amount: 100_000n },
      });
      tx.addOutput({ script: Uint8Array.from([0x6a, 0x00]), amount: 99_100n });
      tx.addOutput({ script: payment.script, amount: 330n });
      tx.addOutput({ script: hexToBytes(buildDieselMintScript(1)), amount: 0n });
      mockedGetSettings.mockReturnValue({
        ...mockSettings,
        enableDieselMinting: true,
        protectAlkanesUtxos: true,
      });
      mockedApiClient.get.mockResolvedValue(createMockComposeResponse({
        rawtransaction: bytesToHex(tx.unsignedTx),
        signed_tx_estimated_size: { vsize: 191, adjusted_vsize: 191, sigops_count: 1 },
      }));

      const response = await composeSend({
        sourceAddress,
        destination: mockDestAddress,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        sat_per_vbyte: 2,
      });

      expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
      expect(response.result.diesel_mint).toEqual({
        carrier_vout: 1,
        runestone_vout: 2,
        carrier_sats: 330,
        marginal_vbytes: 57,
        estimated_marginal_fee_sats: 114,
        fee_rate_sat_vbyte: 2,
        carrier_kind: 'explicit',
      });
    });

    it('skips DIESEL on unsupported send shapes instead of guessing an output pointer', async () => {
      mockedGetSettings.mockReturnValue({ ...mockSettings, enableDieselMinting: true });
      await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        memo: 'keep this memo',
      });
      const url = new URL(mockedApiClient.get.mock.calls[0]![0] as string);
      expect(url.searchParams.has('more_outputs')).toBe(false);
      expect(url.searchParams.has('encoding')).toBe(false);
    });
  });

  describe('composeSendOrMPMA', () => {
    const defaultParams = {
      destination: mockDestAddress,
      asset: testAssets.XCP,
      quantity: testQuantities.MEDIUM,
    };

    // composeSendOrMPMA accesses response.result.name, so we need proper ApiResponse structure
    const createApiResponseWithResult = () => ({
      data: { result: createMockComposeResult() },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as any },
    });

    it('should use composeSend for single destination and set result.name to "send"', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());

      const result = await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result.name).toBe('send');
      assertComposeUrlCalled(mockedApiClient, 'send', defaultParams);
    });

    it('should use composeMPMA for multiple destinations and set result.name to "mpma"', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());
      const destinations = `${mockDestAddress}, bc1qanother, bc1qthird`;

      const result = await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        destination: mockDestAddress, // ignored when destinations provided
        destinations,
      });

      expect(result.result.name).toBe('mpma');

      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      expect(actualUrl).toContain('/compose/mpma');
      // MPMA uses comma-separated destinations
      expect(actualUrl).toContain('destinations=');
      expect(actualUrl).toContain('bc1qanother');
      expect(actualUrl).toContain('bc1qthird');
    });

    it('should duplicate asset and quantity for each destination in MPMA', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());
      const destinations = `${mockDestAddress}, bc1qsecond`;

      await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        destination: mockDestAddress,
        destinations,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      // Should have same asset for both destinations
      expect(actualUrl).toContain(`assets=${testAssets.XCP}%2C${testAssets.XCP}`);
      // Should have same quantity for both destinations
      expect(actualUrl).toContain(`quantities=${testQuantities.MEDIUM}%2C${testQuantities.MEDIUM}`);
    });

    it('should include memo for each destination in MPMA', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());
      const destinations = `${mockDestAddress}, bc1qsecond`;

      await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        destination: mockDestAddress,
        destinations,
        memo: testMemos.TEXT,
        memo_is_hex: false,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      // The memo is identical for every destination, so it travels once as the whole-send memo.
      // (It must NOT travel as `memos[]=`: core's query_params() ignores a PHP-style [] suffix.)
      // URLSearchParams encodes a space as '+'.
      expect(actualUrl).toContain(`memo=${encodeURIComponent(testMemos.TEXT).replace(/%20/g, '+')}`);
      expect(actualUrl).toContain('memo_is_hex=false');
      expect(actualUrl).not.toContain('memos%5B%5D');
      expect(actualUrl).not.toContain('memos[]');
    });

    it('should treat single destination without comma as regular send', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());

      const result = await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        destinations: mockDestAddress, // Single destination, no comma
      });

      expect(result.result.name).toBe('send');
      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      expect(actualUrl).toContain('/compose/send');
    });

    it('should trim whitespace from destinations', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());
      const destinations = `  ${mockDestAddress}  ,  bc1qsecond  `;

      await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        destination: mockDestAddress,
        destinations,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      // Destinations should be trimmed (MPMA uses comma-separated, not array syntax)
      expect(actualUrl).toContain(`destinations=${encodeURIComponent(mockDestAddress)}%2Cbc1qsecond`);
      // Should not contain extra whitespace
      expect(actualUrl).not.toContain('%20%20');
    });
  });

  describe('composeSweep', () => {
    const defaultParams = {
      destination: mockDestAddress,
      flags: 1,
      memo: testMemos.TEXT,
    };

    it('should compose sweep transaction', async () => {
      const result = await composeSweep({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'sweep', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        allow_unconfirmed_inputs: true,
      };

      await composeSweep({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      expect(actualUrl).toContain('allow_unconfirmed_inputs=true');
    });

    it('should handle empty memo sweep', async () => {
      const noMemoParams = {
        destination: mockDestAddress,
        flags: 1,
      };

      await composeSweep({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...noMemoParams,
      });
      
      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      const url = new URL(actualUrl);
      expect(url.searchParams.get('memo')).toBe(''); // Default empty string
    });

    it('should handle different flag values', async () => {
      const flagValues = [1, 2, 3, 4]; // Different sweep flags
      
      for (const flags of flagValues) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());
        
        const params = { ...defaultParams, flags };
        await composeSweep({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
        expect(actualUrl).toContain(`flags=${flags}`);
      }
    });

    it('should include more_outputs when provided', async () => {
      await composeSweep({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        more_outputs: `10000:${mockDestAddress}`,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
      const url = new URL(actualUrl);
      expect(url.searchParams.get('more_outputs')).toBe(`10000:${mockDestAddress}`);
    });
  });

  describe('composeMove', () => {
    const defaultParams = {
      sourceUtxo: 'abc123def456:0',
      destination: mockDestAddress,
    };

    it('should compose move transaction', async () => {
      const result = await composeMove({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      
      // For UTXO-based transactions, check the URL format
      const actualUrl = mockedApiClient.get.mock.calls[0]![0];
      expect(actualUrl).toContain(`/v2/utxos/${defaultParams.sourceUtxo}/compose/move`);
      expect(actualUrl).toContain(`destination=${defaultParams.destination}`);
    });


    it('should handle moving all assets', async () => {
      const moveAllParams = {
        sourceUtxo: 'def456ghi789:1',
        destination: mockDestAddress,
      };

      await composeMove({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...moveAllParams,
      });
      const actualUrl = mockedApiClient.get.mock.calls[0]![0];
      expect(actualUrl).toContain(`/v2/utxos/${moveAllParams.sourceUtxo}/compose/move`);
      expect(actualUrl).toContain(`destination=${moveAllParams.destination}`);
    });

    it('should handle moving from different UTXOs', async () => {
      const utxos = [
        'utxo1:0',
        'utxo2:1',
        'utxo3:0',
      ];

      for (const sourceUtxo of utxos) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());
        
        const params = { ...defaultParams, sourceUtxo };
        await composeMove({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualUrl = mockedApiClient.get.mock.calls[0]![0] as string;
        expect(actualUrl).toContain(`/v2/utxos/${sourceUtxo}/compose/move`);
      }
    });

    it('should handle error when moving to same address', async () => {
      const sameAddressParams = {
        sourceUtxo: 'ghi789jkl012:0',
        destination: mockAddress, // Same as source
      };

      mockedApiClient.get.mockRejectedValueOnce(new Error('Cannot move to same address'));

      await expect(
        composeMove({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...sameAddressParams,
        })
      ).rejects.toThrow('Cannot move to same address');
    });
  });
});
