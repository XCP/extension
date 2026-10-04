/**
 * Whether a transaction the wallet signs but did not build can be relayed and mined: the timelocks
 * consensus enforces and the relay floors Bitcoin Core applies by default. Pure: nothing here knows
 * the chain tip, so a timelock is judged by whether it is in force at all, not by when it expires.
 */

import { DEFAULT_SEQUENCE, DUST_RELAY_FEE_SATS_PER_KVB, MIN_RELAY_FEE_SATS_PER_KVB } from '@/core/bitcoin/constants';
import { compactSizeLength } from '@/core/bitcoin/signedVsize';
import { divide, multiply, roundUp, toNumber } from '@/core/numeric';

/** BIP68: an input sequence with this bit set carries no relative locktime. */
const SEQUENCE_LOCKTIME_DISABLE_FLAG = 0x8000_0000;
/** BIP68: the low 16 bits of a sequence are its relative delay, in blocks or 512-second units. */
const SEQUENCE_LOCKTIME_MASK = 0xffff;
/** Bitcoin Core's `MAX_SCRIPT_SIZE`: a longer output script can never be spent. */
const MAX_SCRIPT_SIZE = 10_000;
/** Transaction versions Bitcoin Core relays (`TX_MIN_STANDARD_VERSION`..`TX_MAX_STANDARD_VERSION`). */
const MIN_STANDARD_VERSION = 1;
const MAX_STANDARD_VERSION = 3;

/** Whether Bitcoin Core relays a transaction of this version. */
export const isStandardVersion = (version: number): boolean =>
  version >= MIN_STANDARD_VERSION && version <= MAX_STANDARD_VERSION;

/**
 * Whether nLockTime binds the transaction: it is nonzero and some input is not final. With every
 * sequence final, consensus ignores nLockTime, whatever it holds (a ZELD nonce, for one).
 */
export const lockTimeInForce = (lockTime: number, sequences: readonly number[]): boolean =>
  lockTime !== 0 && sequences.some(sequence => sequence !== DEFAULT_SEQUENCE);

/**
 * Whether a BIP68 relative locktime delays this input past the block its prevout confirms in: a
 * version 2+ transaction, the disable flag clear, and a nonzero delay. A zero delay binds nothing.
 */
export const relativeLockInForce = (version: number, sequence: number): boolean =>
  version >= 2 && (sequence & SEQUENCE_LOCKTIME_DISABLE_FLAG) === 0 && (sequence & SEQUENCE_LOCKTIME_MASK) !== 0;

/** Whether a fee falls below the minimum relay fee for a transaction of `vsize` vbytes. */
export const belowMinRelayFee = (fee: number, vsize: number): boolean =>
  fee * 1_000 < vsize * MIN_RELAY_FEE_SATS_PER_KVB;

/** Bitcoin Core's `IsWitnessProgram`: a version opcode, then one push of 2 to 40 bytes and nothing else. */
const isWitnessProgram = (script: Uint8Array): boolean =>
  script.length >= 4 && script.length <= 42
  && (script[0] === 0x00 || (script[0]! >= 0x51 && script[0]! <= 0x60))
  && script[1] === script.length - 2;

/**
 * The value below which an output paying `script` is dust that Bitcoin Core will not relay
 * (`GetDustThreshold`): the dust relay fee on the output's own size plus the input that would
 * spend it. 546 for P2PKH, 540 for P2SH, 294 for P2WPKH, 330 for P2WSH and P2TR; 0 for an output
 * no one can spend, such as OP_RETURN.
 */
export function dustThresholdSats(script: Uint8Array): number {
  if (script[0] === 0x6a || script.length > MAX_SCRIPT_SIZE) return 0;
  const outputSize = 8 + compactSizeLength(script.length) + script.length;
  // Outpoint, scriptSig length and sequence, plus a 107-byte signature and key, at witness weight
  // for a witness program.
  const spendSize = 32 + 4 + 1 + (isWitnessProgram(script) ? Math.floor(107 / 4) : 107) + 4;
  return toNumber(roundUp(divide(multiply(outputSize + spendSize, DUST_RELAY_FEE_SATS_PER_KVB), 1_000)));
}
