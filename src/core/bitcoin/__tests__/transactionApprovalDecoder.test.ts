import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ parse: vi.fn(), prevouts: vi.fn(), assets: vi.fn(), analyze: vi.fn() }));
vi.mock('@/core/bitcoin/localTransactionParse', () => ({ parseRawTransactionLocally: mocks.parse }));
vi.mock('@/core/counterparty/transaction', () => ({ fetchInputPrevouts: mocks.prevouts }));
vi.mock('@/core/counterparty/inputAssets', () => ({ fetchInputsAttachedAssets: mocks.assets }));
vi.mock('@/core/counterparty/unpack/opReturn', () => ({ extractCounterpartyPayload: () => undefined }));
vi.mock('@/core/counterparty/signRequestAnalysis', () => ({ analyzeSignRequest: mocks.analyze }));

import { decodeTransactionForApproval } from '../transactionApprovalDecoder';

describe('raw transaction approval decoder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assets.mockResolvedValue([]);
    mocks.parse.mockReturnValue({ txid: 'tx', inputs: [{ txid: 'prev', vout: 0 }],
      outputs: [{ index: 0, value: 19_000, type: 'p2wpkh', address: 'bound-address', script: '0014' }],
      vsize: 100, hasOpReturn: false });
    mocks.prevouts.mockResolvedValue(new Map([['prev:0', { value: 20_000, address: 'bound-address' }]]));
    mocks.analyze.mockResolvedValue({ safety: { blocked: false, warnings: [] } });
  });

  it('analyzes the supplied bound signer with locally parsed outputs and independently resolved prevouts', async () => {
    const result = await decodeTransactionForApproval('reviewed-hex', 'bound-address');
    expect(mocks.parse).toHaveBeenCalledWith('reviewed-hex');
    expect(result.fee).toBe(1000);
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({
      signerAddresses: ['bound-address'], signedInputIndices: [0],
      inputs: [{ txid: 'prev', vout: 0, value: 20_000, address: 'bound-address' }],
      outputs: [expect.objectContaining({ address: 'bound-address', value: 19_000, script: '0014' })],
    }));
  });

  it('uses the injected trusted prevout source for both BTC and attached-asset evidence', async () => {
    const trusted = vi.fn().mockResolvedValue(undefined);
    await decodeTransactionForApproval('hex', 'bound-address', trusted);
    expect(mocks.prevouts).toHaveBeenCalledWith(expect.any(Array), trusted);
    expect(mocks.assets).toHaveBeenCalledWith(expect.any(Array), undefined, trusted);
  });

  it('keeps unresolved amounts visibly unknown rather than assigning a partial fee', async () => {
    mocks.prevouts.mockResolvedValue(new Map());
    const result = await decodeTransactionForApproval('hex', 'bound-address');
    expect(result.inputs[0]?.value).toBeUndefined();
    expect(result.fee).toBe(0);
  });

  it('rejects undecodable local bytes before requesting any remote interpretation', async () => {
    mocks.parse.mockReturnValue(null);
    await expect(decodeTransactionForApproval('broken', 'bound-address')).rejects.toThrow(/could not be decoded/);
    expect(mocks.prevouts).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
