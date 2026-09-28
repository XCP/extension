import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { CounterpartyApiError, UnofferedInputsError } from '@/core/errors';
import {
  canInscribe,
  carriesTaprootReveal,
  chooseComposeEncoding,
  chooseEncoding,
  composeWithEncoding,
  isTaprootEligibleMessage,
  isTaprootEncodingSource,
  OP_RETURN_MESSAGE_MAX_BYTES,
  readRevealShape,
  signsTaprootReveals,
} from '../taprootEncoding';
import { BROADCAST_P2WPKH } from './taproot115Fixtures';
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
  it('accepts Native SegWit (P2WPKH) and Taproot addresses', () => {
    expect(isTaprootEncodingSource(P2WPKH)).toBe(true);
    expect(isTaprootEncodingSource(P2TR)).toBe(true);
  });

  it('refuses P2WSH, whose script has no single key to close the envelope (core 11.5)', () => {
    expect(isTaprootEncodingSource(P2WSH)).toBe(false);
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

describe('which wallets sign a Taproot reveal', () => {
  it('a software wallet signs one; a hardware wallet never asks for Taproot', () => {
    expect(signsTaprootReveals('mnemonic')).toBe(true);
    expect(signsTaprootReveals('privateKey')).toBe(true);
    expect(signsTaprootReveals('hardware')).toBe(false);
    expect(signsTaprootReveals(undefined)).toBe(false);
  });

  it('offers inscribing only from a Taproot source in a software wallet', () => {
    expect(canInscribe(P2WPKH, 'mnemonic')).toBe(true);
    expect(canInscribe(P2TR, 'privateKey')).toBe(true);
    expect(canInscribe(P2WPKH, 'hardware')).toBe(false);
    expect(canInscribe(P2TR, 'hardware')).toBe(false);
    expect(canInscribe(P2WSH, 'mnemonic')).toBe(false);
    expect(canInscribe(P2SH, 'mnemonic')).toBe(false);
    expect(canInscribe(undefined, 'mnemonic')).toBe(false);
  });
});

describe('choosing the encoding', () => {
  const base = { composeType: 'mpma', params: {}, sourceAddress: P2WPKH, walletType: 'mnemonic' as const };

  it('never chooses Taproot for a hardware wallet, which keeps the default encoding', () => {
    expect(chooseEncoding({ ...base, walletType: 'hardware', messageLength: OVERFLOWING })).toBeUndefined();
    expect(chooseEncoding({ ...base, walletType: undefined, messageLength: OVERFLOWING })).toBeUndefined();
    expect(chooseEncoding({ ...base, walletType: 'privateKey', messageLength: OVERFLOWING })).toBe('taproot');
    expect(chooseComposeEncoding('mpma', MPMA_TAPROOT.request, P2WPKH, 'hardware')).toBeUndefined();
  });

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
    expect(chooseComposeEncoding('send', SEND_TAPROOT.request, P2WPKH, 'mnemonic')).toBe('taproot');
    expect(chooseComposeEncoding('send', { ...SEND_TAPROOT.request, memo: 'hi' }, P2WPKH, 'mnemonic')).toBeUndefined();
    expect(chooseComposeEncoding('send', SEND_TAPROOT.request, P2PKH, 'mnemonic')).toBeUndefined();
  });

  it('chooses Taproot for a several-recipient MPMA, including one sent from the send form', () => {
    expect(chooseComposeEncoding('mpma', MPMA_TAPROOT.request, P2WPKH, 'mnemonic')).toBe('taproot');
    expect(chooseComposeEncoding('send', {
      asset: 'PEPEMEMECOIN',
      quantity: '100',
      destinations: MPMA_TAPROOT.request.destinations,
    }, P2WPKH, 'mnemonic')).toBe('taproot');
  });

  it('measures a broadcast before core stamps its timestamp', () => {
    const long = { text: 'x'.repeat(80), value: '0', fee_fraction: '0' };
    expect(chooseComposeEncoding('broadcast', long, P2WPKH, 'mnemonic')).toBe('taproot');
    expect(chooseComposeEncoding('broadcast', { ...long, text: 'short' }, P2WPKH, 'mnemonic')).toBeUndefined();
  });

  it('measures an issuance, and leaves an ownership transfer on the default', () => {
    const issuance = { asset: 'PEPEMEMECOIN', quantity: '0', description: 'd'.repeat(90), lock: false, reset: false };
    expect(chooseComposeEncoding('issuance', issuance, P2WPKH, 'mnemonic')).toBe('taproot');
    expect(chooseComposeEncoding('issuance', { ...issuance, transfer_destination: P2TR }, P2WPKH, 'mnemonic')).toBeUndefined();
  });

  it('never switches a request it cannot pack', () => {
    expect(chooseComposeEncoding('send', { asset: 'PEPEMEMECOIN' }, P2WPKH, 'mnemonic')).toBeUndefined();
    expect(chooseComposeEncoding('move', { destination: P2TR }, P2WPKH, 'mnemonic')).toBeUndefined();
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

describe('reading the reveal a compose returns', () => {
  const { result } = BROADCAST_P2WPKH;

  it('reads Core 11.5\'s unsigned reveal, with everything signing it needs', () => {
    const shape = readRevealShape(result);
    expect(shape).toEqual({
      kind: 'unsigned',
      envelopeScriptHex: result.envelope_script,
      reveal: {
        revealHex: result.reveal_rawtransaction,
        controlBlockHex: result.reveal_control_block,
        revealPubkeyHex: result.reveal_pubkey,
        lockScripts: result.reveal_lock_scripts,
        inputsValues: result.reveal_inputs_values,
      },
    });
    expect(carriesTaprootReveal(result)).toBe(true);
  });

  it('refuses a reveal the server signed, the shape before Core 11.5', () => {
    expect(readRevealShape({ rawtransaction: '02', envelope_script: '0063', signed_reveal_rawtransaction: '02' }))
      .toEqual({ kind: 'server_signed' });
    // Even alongside the 11.5 fields.
    expect(readRevealShape({ ...result, signed_reveal_rawtransaction: '02' })).toEqual({ kind: 'server_signed' });
    expect(carriesTaprootReveal({ signed_reveal_rawtransaction: '02' })).toBe(true);
  });

  it.each([
    'envelope_script', 'reveal_rawtransaction', 'reveal_control_block', 'reveal_pubkey',
    'reveal_lock_scripts', 'reveal_inputs_values',
  ] as const)('treats a compose missing %s as half a Taproot compose', (field) => {
    const { [field]: _dropped, ...partial } = result;
    expect(readRevealShape(partial)).toEqual({ kind: 'partial' });
    expect(carriesTaprootReveal(partial)).toBe(true);
  });

  it.each([
    ['a compressed reveal_pubkey', { reveal_pubkey: `02${result.reveal_pubkey}` }],
    ['a non-hex reveal', { reveal_rawtransaction: 'zz' }],
    ['an odd-length control block', { reveal_control_block: 'c' }],
    ['a lock script that is not hex', { reveal_lock_scripts: [7] }],
    ['a zero value', { reveal_inputs_values: [0] }],
    ['a fractional value', { reveal_inputs_values: [1.5] }],
    ['values that are not a list', { reveal_inputs_values: 526 }],
  ])('treats %s as malformed', (_, change) => {
    expect(readRevealShape({ ...result, ...change })).toEqual({ kind: 'partial' });
  });

  it('reads an ordinary compose as carrying no reveal', () => {
    expect(readRevealShape({ rawtransaction: '02' })).toEqual({ kind: 'none' });
    expect(readRevealShape(null)).toEqual({ kind: 'none' });
    expect(readRevealShape('reveal_rawtransaction')).toEqual({ kind: 'none' });
    expect(carriesTaprootReveal({ rawtransaction: '02' })).toBe(false);
    expect(carriesTaprootReveal(undefined)).toBe(false);
  });
});

describe('composing when Core 11.5 returns an unsigned reveal', () => {
  const data = { sourceAddress: P2WPKH, sat_per_vbyte: '2' };

  it('keeps the Taproot compose: the wallet signs the reveal itself', async () => {
    const response = { result: BROADCAST_P2WPKH.result };
    const compose = vi.fn().mockResolvedValue(response);
    await expect(composeWithEncoding(compose, data, 'taproot')).resolves.toBe(response);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledWith({ ...data, encoding: 'taproot' });
  });

  it('composes the default way when the API is too old for Taproot, which the compose layer refuses', async () => {
    const compose = vi.fn()
      .mockRejectedValueOnce(new CounterpartyApiError('Taproot encoding and inscriptions need Counterparty API 11.5.0 or newer.', '/v2/'))
      .mockResolvedValueOnce('default');
    await expect(composeWithEncoding(compose, data, 'taproot')).resolves.toBe('default');
    expect(compose).toHaveBeenNthCalledWith(2, data);
  });
});
