import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDieselMintScript } from '@/core/alkanes/diesel';
import * as apiClientUtils from '@/core/api/client';
import { asBaseUnits } from '@/core/numeric';
import { getActiveSettings } from '@/core/settings';
import {
  composeAttach,
  composeBroadcast,
  composeBTCPay,
  composeDetach,
  composeFairmint,
  composeFairminter,
  composeMPMA,
  composePoolDeposit,
  composePoolWithdraw,
  composeTransaction
} from '../compose';
import {
  assertComposeUrlCalled,
  createMockApiResponse,
  createMockComposeResponse,
  createMockComposeResult,
  mockAddress,
  mockApiBase,
  mockSatPerVbyte,
  mockSettings,
  testQuantities,
} from './helpers/composeTestHelpers';

// Mock dependencies
vi.mock('@/core/api/client');
vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn(async () => 965600) }));
vi.mock('@/core/counterparty/capabilities', () => ({
  requireCounterpartyFeature: vi.fn().mockResolvedValue(undefined),
}));
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

describe('Compose Specialized Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockReturnValue(mockSettings as any);
    mockedApiClient.get.mockResolvedValue(createMockComposeResponse());
  });

  describe('composeTransaction (generic)', () => {
    it('should compose generic transaction', async () => {
      const endpoint = 'custom_endpoint';
      const params = { custom_param: 'value' };
      const satPerVbyte = 10;

      const result = await composeTransaction(endpoint, params, mockAddress, satPerVbyte);

      expect(result.result).toEqual(createMockComposeResult());
      
      const expectedUrl = `${mockApiBase}/v2/addresses/${mockAddress}/compose/${endpoint}`;
      const actualCall = mockedApiClient.get.mock.calls[0]!;
      expect(actualCall[0]).toContain(expectedUrl);
      expect(actualCall[1]?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should handle errors in generic composition', async () => {
      mockedApiClient.get.mockRejectedValueOnce(new Error('Composition failed'));

      await expect(
        composeTransaction('endpoint', {}, mockAddress, 10)
      ).rejects.toThrow('Composition failed');
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

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'broadcast', defaultParams);
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('inscription=SGVsbG8gV29ybGQ%3D');
      expect(url).toContain('mime_type=text%2Fplain');
    });

    it('should handle different broadcast values', async () => {
      const values = ['0', '50.5', '100.0', '999.99'];

      for (const value of values) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        const params = { ...defaultParams, value };
        await composeBroadcast({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
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

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'btcpay', defaultParams);
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('max_fee=5000');
    });

    it('should handle different order match IDs', async () => {
      const matchIds = ['match1', 'match2', 'match3'];

      for (const order_match_id of matchIds) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        await composeBTCPay({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          order_match_id,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
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

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'mpma', defaultParams);
    });

    it('sends per-send memos as repeated plain keys with one memos_are_hex flag', async () => {
      // Core's query_params() builds lists from repeated keys and does nothing with a PHP-style
      // [] suffix — `memos[]` is a different parameter that silently never reaches compose. The
      // hex flag is singular because core applies one flag to every memo in the list.
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('&memos=memo1');
      expect(url).toContain('&memos=memo2');
      expect(url).toContain('memos_are_hex=false');
      expect(url).not.toContain('memos[]');
      expect(url).not.toContain('memos%5B%5D');
    });

    it('refuses memos that mix hex and text, which one memos_are_hex flag cannot express', async () => {
      await expect(composeMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        memos: ['beef', 'plain text'],
        memos_are_hex: [true, false],
      })).rejects.toThrow(/all hex or all text/);
    });

    it('should handle different message data', async () => {
      const assetSets = [
        ['ASSET1'],
        ['ASSET1', 'ASSET2'],
        ['ASSET1', 'ASSET2', 'ASSET3'],
      ];

      for (const assets of assetSets) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        const destinations = assets.map((_, i) => `bc1qdest${i + 1}`);
        const quantities = assets.map((_, i) => `${(i + 1) * 1000}`);

        await composeMPMA({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          assets,
          destinations,
          quantities,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
        const url = actualCall[0] as string;
        expect(url).toContain(`assets=${encodeURIComponent(assets.join(','))}`);
      }
    });
  });

  describe('composeFairminter', () => {
    const defaultParams = {
      asset: 'FAIRMINTASSET',
      lot_price: 100000,
      lot_size: 1000,
      max_mint_per_tx: 100,
      max_mint_per_address: 1000,
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

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'fairminter', defaultParams);
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const _actualParams = Object.fromEntries(urlParams.entries());
      expect(url).toContain('burn_payment=true');
      expect(url).toContain('lock_description=false');
      expect(url).toContain('lock_quantity=true');
      expect(url).toContain('divisible=true');
      expect(url).toContain('description=Fair+mint+asset');
    });

    it('should include pool seeding parameters', async () => {
      await composeFairminter({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        pool_quantity: 400000000,
        lp_asset: 'A95428956661682178',
      });

      const url = mockedApiClient.get.mock.calls[0]![0] as string;
      expect(url).toContain('pool_quantity=400000000');
      expect(url).toContain('lp_asset=A95428956661682178');
    });

    it('should include an explicit subasset parent', async () => {
      await composeFairminter({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        asset: 'A95428956661682177',
        asset_parent: 'PEPECASH',
      });

      const url = mockedApiClient.get.mock.calls[0]![0] as string;
      expect(url).toContain('asset=A95428956661682177');
      expect(url).toContain('asset_parent=PEPECASH');
    });
  });

  describe('composeFairmint', () => {
    const defaultParams = {
      asset: 'FAIRMINTASSET',
      quantity: asBaseUnits(100),
    };

    it('should compose fairmint transaction', async () => {
      const result = await composeFairmint({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'fairmint', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        quantity: asBaseUnits(200),
      };

      await composeFairmint({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('quantity=200');
    });

    it('should handle different mint quantities', async () => {
      const quantities = [10, 50, 100, 500];

      for (const quantity of quantities) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        const params = { ...defaultParams, quantity };
        await composeFairmint({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const _actualParams = Object.fromEntries(urlParams.entries());
        expect(url).toContain(`quantity=${quantity}`);
      }
    });
  });

  describe('composePoolDeposit', () => {
    const defaultParams = {
      asset_a: 'XCP',
      asset_b: 'POOLTEST',
      quantity_a: '100000000',
      quantity_b: '500000000',
    };

    it('should compose pool deposit transaction', async () => {
      const result = await composePoolDeposit({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'pooldeposit', {
        ...defaultParams,
        min_lp_quantity: '0',
      });
    });

    it('should include slippage and LP asset parameters', async () => {
      await composePoolDeposit({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        min_lp_quantity: '1000',
        lp_asset: 'A77777777777777777',
      });

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('min_lp_quantity=1000');
      expect(url).toContain('lp_asset=A77777777777777777');
    });
  });

  describe('composePoolWithdraw', () => {
    const defaultParams = {
      asset_a: 'XCP',
      asset_b: 'POOLTEST',
      quantity: asBaseUnits('1000000'),
    };

    it('should compose pool withdraw transaction', async () => {
      const result = await composePoolWithdraw({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'poolwithdraw', {
        ...defaultParams,
        min_quantity_a: '0',
        min_quantity_b: '0',
      });
    });

    it('should compose pool withdraw with LP asset and slippage parameters', async () => {
      mockedApiClient.get.mockResolvedValueOnce(createMockApiResponse({
        result: createMockComposeResult(),
      }));

      const result = await composePoolWithdraw({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        quantity: asBaseUnits('1000000'),
        min_quantity_a: '100',
        min_quantity_b: '200',
        lp_asset: 'A77777777777777777',
      });

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('quantity=1000000');
      expect(url).toContain('min_quantity_a=100');
      expect(url).toContain('min_quantity_b=200');
      expect(url).toContain('lp_asset=A77777777777777777');
      expect(url).not.toContain('asset_a=');
      expect(url).not.toContain('asset_b=');
      expect(result.result.params.lp_asset).toBe('A77777777777777777');
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

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'attach', defaultParams);
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('utxo_value=10000');
      expect(url).toContain('destination_vout=1');
    });

    it('keeps the attached asset on vout 0 and optimizes DIESEL into separate change', async () => {
      const payment = p2wpkh(getPublicKey(hexToBytes('22'.repeat(32)), true));
      const sourceAddress = payment.address!;
      const inputTxid = 'aa'.repeat(32);
      const dieselScript = buildDieselMintScript(2);
      const buildAttach = (dieselUtxoSats: bigint, includeChange: boolean) => {
        const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
        tx.addInput({
          txid: hexToBytes(inputTxid),
          index: 0,
          witnessUtxo: { script: payment.script, amount: 100_000n },
        });
        tx.addOutput({ script: payment.script, amount: 546n });
        tx.addOutput({ script: Uint8Array.from([0x6a, 30, ...new Uint8Array(30)]), amount: 0n });
        tx.addOutput({ script: payment.script, amount: dieselUtxoSats });
        tx.addOutput({ script: hexToBytes(dieselScript), amount: 0n });
        if (includeChange) tx.addOutput({ script: payment.script, amount: 98_646n });
        return bytesToHex(tx.unsignedTx);
      };
      mockedGetSettings.mockReturnValue({
        ...mockSettings,
        enableDieselMinting: true,
        protectAlkanesUtxos: true,
      });
      mockedApiClient.get
        .mockResolvedValueOnce(createMockComposeResponse({
          rawtransaction: buildAttach(330n, true),
          btc_fee: 478,
          signed_tx_estimated_size: { vsize: 239, adjusted_vsize: 239, sigops_count: 1 },
        }))
        .mockResolvedValueOnce(createMockComposeResponse({
          rawtransaction: buildAttach(99_038n, false),
          btc_change: 0,
          btc_fee: 416,
          signed_tx_estimated_size: { vsize: 208, adjusted_vsize: 208, sigops_count: 1 },
        }));

      const response = await composeAttach({
        sourceAddress,
        asset: 'UTXOASSET',
        quantity: 1,
        sat_per_vbyte: 2,
      });

      const firstUrl = new URL(mockedApiClient.get.mock.calls[0]![0] as string);
      const optimizedUrl = new URL(mockedApiClient.get.mock.calls[1]![0] as string);
      expect(firstUrl.searchParams.get('more_outputs')).toBe(
        `330:${sourceAddress},0:${dieselScript}`,
      );
      expect(optimizedUrl.searchParams.get('more_outputs')).toBe(
        `99038:${sourceAddress},0:${dieselScript}`,
      );
      expect(optimizedUrl.searchParams.get('exact_fee')).toBe('416');
      expect(optimizedUrl.searchParams.get('use_all_inputs_set')).toBe('true');
      expect(response.result.diesel_mint).toEqual({
        utxo_vout: 2,
        runestone_vout: 3,
        utxo_sats: 99_038,
        marginal_vbytes: 26,
        estimated_marginal_fee_sats: 52,
        fee_rate_sat_vbyte: 2,
        utxo_kind: 'change',
      });
    });

    it('skips DIESEL without blocking attach above the configured fee-rate ceiling', async () => {
      mockedGetSettings.mockReturnValue({
        ...mockSettings,
        enableDieselMinting: true,
        dieselMintMaxFeeRate: 2,
      });

      await composeAttach({
        sourceAddress: mockAddress,
        asset: 'UTXOASSET',
        quantity: 1,
        sat_per_vbyte: 3,
      });

      const url = new URL(mockedApiClient.get.mock.calls[0]![0] as string);
      expect(url.searchParams.has('more_outputs')).toBe(false);
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

      expect(result.result).toEqual(createMockComposeResult());
      
      const expectedUrl = `${mockApiBase}/v2/utxos/${defaultParams.sourceUtxo}/compose/detach`;
      const actualCall = mockedApiClient.get.mock.calls[0]!;
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('destination=bc1qoptionaldest');
    });

    it('should handle detaching different quantities', async () => {
      const utxos = ['utxo1:0', 'utxo2:1', 'utxo3:0'];

      for (const sourceUtxo of utxos) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        const params = { ...defaultParams, sourceUtxo };
        await composeDetach({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
        const url = actualCall[0] as string;
        expect(url).toContain(`/v2/utxos/${sourceUtxo}/compose/detach`);
      }
    });
  });

  describe('composeMove', () => {
    const defaultParams = {
      sourceUtxo: 'abc123def456:0',
      destination: 'bc1qdestination',
    };

    it('should compose move transaction', async () => {
      const { composeMove } = await import('../compose');
      
      const result = await composeMove({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      
      const expectedUrl = `${mockApiBase}/v2/utxos/${defaultParams.sourceUtxo}/compose/movetoutxo`;
      const actualCall = mockedApiClient.get.mock.calls[0]!;
      expect(actualCall[0]).toContain(expectedUrl);
    });

    it('should include destination parameter', async () => {
      const { composeMove } = await import('../compose');
      
      await composeMove({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const url = actualCall[0] as string;
      expect(url).toContain('destination=bc1qdestination');
    });

    it('should handle moving from different UTXOs', async () => {
      const { composeMove } = await import('../compose');
      const utxos = ['utxo1:0', 'utxo2:1', 'utxo3:0'];

      for (const sourceUtxo of utxos) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        const params = { ...defaultParams, sourceUtxo };
        await composeMove({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
        const url = actualCall[0] as string;
        expect(url).toContain(`/v2/utxos/${sourceUtxo}/compose/movetoutxo`);
      }
    });
  });
});
