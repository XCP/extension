import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { CounterpartyApiError, UnofferedInputsError } from '@/core/errors';
import {
  chooseComposeEncoding,
  chooseEncoding,
  composeWithEncoding,
  isTaprootEligibleMessage,
  isTaprootEncodingSource,
  OP_RETURN_MESSAGE_MAX_BYTES,
} from '../taprootEncoding';
import { MPMA_TAPROOT, SEND_TAPROOT, TAPROOT_SOURCE } from './taprootFixtures';

const P2WPKH = TAPROOT_SOURCE;
const P2WSH = 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3';
const P2TR = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
const P2PKH = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
const UTXO = `${'ab'.repeat(32)}:0`;

/** Packed length of the smallest message that no longer fits an OP_RETURN. */
const OVERFLOWING = OP_RETURN_MESSAGE_MAX_BYTES + 8 + 1;
const FITTING = OP_RETURN_MESSAGE_MAX_BYTES + 8;

describe('which sources core lets use Taproot encoding', () => {
  it('accepts native SegWit and Taproot addresses', () => {
    expect(isTaprootEncodingSource(P2WPKH)).toBe(true);
    expect(isTaprootEncodingSource(P2WSH)).toBe(true);
    expect(isTaprootEncodingSource(P2TR)).toBe(true);
  });

  it('refuses legacy, nested SegWit, UTXO and malformed sources', () => {
    expect(isTaprootEncodingSource(P2PKH)).toBe(false);
    expect(isTaprootEncodingSource(P2SH)).toBe(false);
    expect(isTaprootEncodingSource(UTXO)).toBe(false);
    expect(isTaprootEncodingSource('bc1qnotanaddress')).toBe(false);
    expect(isTaprootEncodingSource('')).toBe(false);
  });
});

describe('which messages have no destination outputs', () => {
  it.each([
    'mpma', 'broadcast', 'fairminter', 'fairmint', 'order', 'cancel', 'destroy', 'dividend', 'sweep',
    'pooldeposit', 'poolwithdraw',
  ])('%s is eligible', (composeType) => {
    expect(isTaprootEligibleMessage(composeType, {}, P2WPKH)).toBe(true);
  });

  it.each(['dispense', 'btcpay', 'burn', 'attach', 'detach', 'move', 'utxo', 'unknown'])('%s is not', (composeType) => {
    expect(isTaprootEligibleMessage(composeType, {}, P2WPKH)).toBe(false);
  });

  it('an asset send carries its recipient in the data; a BTC send carries no message', () => {
    expect(isTaprootEligibleMessage('send', { asset: 'XCP', destination: P2TR }, P2WPKH)).toBe(true);
    expect(isTaprootEligibleMessage('send', { asset: 'BTC', destination: P2TR }, P2WPKH)).toBe(false);
  });

  it('an issuance that transfers ownership pays the new owner in an output', () => {
    expect(isTaprootEligibleMessage('issuance', { asset: 'A', transfer_destination: '' }, P2WPKH)).toBe(true);
    expect(isTaprootEligibleMessage('issuance', { asset: 'A', transfer_destination: P2TR }, P2WPKH)).toBe(false);
  });

  it('a dispenser is eligible only when opened on the source, without an oracle', () => {
    expect(isTaprootEligibleMessage('dispenser', {}, P2WPKH)).toBe(true);
    expect(isTaprootEligibleMessage('dispenser', { open_address: P2WPKH }, P2WPKH)).toBe(true);
    expect(isTaprootEligibleMessage('dispenser', { open_address: P2TR }, P2WPKH)).toBe(false);
    expect(isTaprootEligibleMessage('dispenser', { oracle_address: P2TR }, P2WPKH)).toBe(false);
  });
});

describe('choosing the encoding', () => {
  const base = { composeType: 'mpma', params: {}, sourceAddress: P2WPKH };

  it('keeps an OP_RETURN for a message of 72 bytes or fewer, where Taproot costs more', () => {
    expect(chooseEncoding({ ...base, messageLength: FITTING })).toBeUndefined();
    expect(chooseEncoding({ ...base, messageLength: 20 })).toBeUndefined();
  });

  it('switches at 73 bytes, where core would otherwise fall back to bare multisig', () => {
    expect(chooseEncoding({ ...base, messageLength: OVERFLOWING })).toBe('taproot');
  });

  it('never switches a message it could not pack', () => {
    expect(chooseEncoding({ ...base, messageLength: null })).toBeUndefined();
  });

  it('never switches for a source or message core would refuse', () => {
    for (const sourceAddress of [P2PKH, P2SH, UTXO]) {
      expect(chooseEncoding({ ...base, sourceAddress, messageLength: OVERFLOWING })).toBeUndefined();
    }
    expect(chooseEncoding({ ...base, composeType: 'dispense', messageLength: OVERFLOWING })).toBeUndefined();
    expect(chooseEncoding({ ...base, composeType: 'detach', messageLength: OVERFLOWING })).toBeUndefined();
  });

  it('works for a Taproot source too', () => {
    expect(chooseEncoding({ ...base, sourceAddress: P2TR, messageLength: OVERFLOWING })).toBe('taproot');
  });

  it('leaves an explicit encoding and an inscription request alone', () => {
    expect(chooseEncoding({ ...base, params: { encoding: 'taproot' }, messageLength: OVERFLOWING })).toBeUndefined();
    expect(chooseEncoding({ ...base, params: { encoding: 'opreturn' }, messageLength: OVERFLOWING })).toBeUndefined();
    expect(chooseEncoding({ ...base, params: { inscription: 'true' }, messageLength: OVERFLOWING })).toBeUndefined();
  });
});

describe('measuring the request', () => {
  it('packs the same bytes core composed, so the length it measures is core\'s', () => {
    // The fixtures are real composes; their data is what core's length test saw.
    const send = packComposeMessage('send', SEND_TAPROOT.request);
    expect(send && bytesToHex(send.bytes)).toBe(SEND_TAPROOT.data);
    const mpma = packComposeMessage('mpma', MPMA_TAPROOT.request);
    expect(mpma && bytesToHex(mpma.bytes)).toBe(MPMA_TAPROOT.data);
  });

  it('chooses Taproot for a send whose memo overflows the OP_RETURN, and not for a short one', () => {
    expect(SEND_TAPROOT.data.length / 2 - 8).toBe(88);
    expect(chooseComposeEncoding('send', SEND_TAPROOT.request, P2WPKH)).toBe('taproot');
    expect(chooseComposeEncoding('send', { ...SEND_TAPROOT.request, memo: 'hi' }, P2WPKH)).toBeUndefined();
    expect(chooseComposeEncoding('send', SEND_TAPROOT.request, P2PKH)).toBeUndefined();
  });

  it('chooses Taproot for a several-recipient MPMA, including one sent from the send form', () => {
    expect(chooseComposeEncoding('mpma', MPMA_TAPROOT.request, P2WPKH)).toBe('taproot');
    expect(chooseComposeEncoding('send', {
      asset: 'PEPEMEMECOIN',
      quantity: '100',
      destinations: MPMA_TAPROOT.request.destinations,
    }, P2WPKH)).toBe('taproot');
  });

  it('measures a broadcast before core stamps its timestamp', () => {
    const long = { text: 'x'.repeat(80), value: '0', fee_fraction: '0' };
    expect(chooseComposeEncoding('broadcast', long, P2WPKH)).toBe('taproot');
    expect(chooseComposeEncoding('broadcast', { ...long, text: 'short' }, P2WPKH)).toBeUndefined();
  });

  it('measures an issuance, and leaves an ownership transfer on the default', () => {
    const issuance = { asset: 'PEPEMEMECOIN', quantity: '0', description: 'd'.repeat(90), lock: false, reset: false };
    expect(chooseComposeEncoding('issuance', issuance, P2WPKH)).toBe('taproot');
    expect(chooseComposeEncoding('issuance', { ...issuance, transfer_destination: P2TR }, P2WPKH)).toBeUndefined();
  });

  it('never switches a request it cannot pack', () => {
    expect(chooseComposeEncoding('send', { asset: 'PEPEMEMECOIN' }, P2WPKH)).toBeUndefined();
    expect(chooseComposeEncoding('move', { destination: P2TR }, P2WPKH)).toBeUndefined();
  });
});

describe('composing with the chosen encoding', () => {
  const data = { sourceAddress: P2WPKH, sat_per_vbyte: '2' };

  it('asks once, with no encoding, when none was chosen', async () => {
    const compose = vi.fn().mockResolvedValue('ok');
    await expect(composeWithEncoding(compose, data, undefined)).resolves.toBe('ok');
    expect(compose).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledWith(data);
  });

  it('asks for Taproot, then once for the default when the composer refuses it', async () => {
    const compose = vi.fn()
      .mockRejectedValueOnce(new CounterpartyApiError('Cannot use `taproot` encoding for transactions with destinations', 'send'))
      .mockResolvedValueOnce('default');
    await expect(composeWithEncoding(compose, data, 'taproot')).resolves.toBe('default');
    expect(compose).toHaveBeenNthCalledWith(1, { ...data, encoding: 'taproot' });
    expect(compose).toHaveBeenNthCalledWith(2, data);
  });

  it('retries only once', async () => {
    const refusal = new CounterpartyApiError('insufficient funds', 'send');
    const compose = vi.fn().mockRejectedValue(refusal);
    await expect(composeWithEncoding(compose, data, 'taproot')).rejects.toBe(refusal);
    expect(compose).toHaveBeenCalledTimes(2);
  });

  it('does not retry a response that spent inputs it was never offered, or a local failure', async () => {
    for (const error of [new UnofferedInputsError('Unoffered inputs', 'send'), new Error('boom')]) {
      const compose = vi.fn().mockRejectedValue(error);
      await expect(composeWithEncoding(compose, data, 'taproot')).rejects.toBe(error);
      expect(compose).toHaveBeenCalledTimes(1);
    }
  });

  it('does not retry once the compose was abandoned', async () => {
    const controller = new AbortController();
    const compose = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new CounterpartyApiError('refused', 'send');
    });
    await expect(composeWithEncoding(compose, data, 'taproot', controller.signal)).rejects.toThrow('refused');
    expect(compose).toHaveBeenCalledTimes(1);
  });
});
