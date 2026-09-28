/**
 * Which address table an MPMA send carries, and which one Counterparty will read it with.
 *
 * An MPMA message opens with a table of its recipients' addresses. Two layouts exist:
 *
 * - `legacy`: a `>H` entry count, then every address in a fixed 21 bytes (core
 *   `address.pack_legacy`). A 32-byte witness program does not fit, so Taproot and P2WSH
 *   recipients cannot be named at all.
 * - `length-prefixed`: the same count, then each address as a one-byte length followed by that
 *   many bytes of the self-describing packing (`0x01`/`0x02` plus a hash, or `0x03`, a witness
 *   version and the program), which carries every address type.
 *
 * Core switched with the `mpma_taproot_support` protocol change: an MPMA is read with the table
 * of the block it is mined in, and composed for the block after the node's tip. Neither layout is
 * a harmless reading of the other. A length-prefixed table parsed before activation is read as
 * 21-byte legacy entries, naming addresses other than the ones intended; a legacy table parsed
 * after it is refused, and the fee is spent for nothing. So the layout is a consensus fact about *when* the
 * transaction lands, and it is checked against the height rather than taken from whoever composed
 * the message.
 */

import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import { fetchCounterpartyServerInfo } from '@/core/counterparty/capabilities';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';

export type MpmaTableFormat = 'legacy' | 'length-prefixed';

/**
 * Activation heights of `mpma_taproot_support` (core `protocol_changes.json`). Regtest enables
 * every change from block 0 (`protocol.enabled`). `testnet` is the name older nodes report for
 * testnet3.
 */
export const MPMA_TAPROOT_SUPPORT_HEIGHTS: Readonly<Record<string, number>> = {
  mainnet: 971_700,
  testnet: 5_166_000,
  testnet3: 5_166_000,
  testnet4: 155_500,
  signet: 325_500,
  regtest: 0,
};

/**
 * The table core composes and parses for a message mined at `blockIndex` on `network`, or null
 * for a network this build has no activation height for.
 */
export function mpmaTableFormatAt(network: string, blockIndex: number): MpmaTableFormat | null {
  const activation = MPMA_TAPROOT_SUPPORT_HEIGHTS[network];
  if (activation === undefined || !Number.isSafeInteger(blockIndex) || blockIndex < 0) return null;
  return blockIndex >= activation ? 'length-prefixed' : 'legacy';
}

/**
 * Blocks before activation within which a legacy-table MPMA is worth a notice (a next block of
 * 971,694 to 971,699 on mainnet): a confirmation that slips past the activation block lands under
 * the new rules, which refuse the legacy table.
 */
export const MPMA_ACTIVATION_NOTICE_BLOCKS = 6;

export interface MpmaTableFormatResolution {
  /** The table an MPMA composed now must carry. */
  format: MpmaTableFormat;
  /** The block the transaction can be mined in at the earliest, by the reading that decided. */
  nextBlockIndex: number;
  /** `mpma_taproot_support`'s activation height on the network that decided. */
  activationHeight: number;
}

interface HeightReading {
  network: string;
  nextBlockIndex: number;
}

function resolutionFrom(reading: HeightReading): MpmaTableFormatResolution | null {
  const format = mpmaTableFormatAt(reading.network, reading.nextBlockIndex);
  if (format === null) return null;
  return {
    format,
    nextBlockIndex: reading.nextBlockIndex,
    activationHeight: MPMA_TAPROOT_SUPPORT_HEIGHTS[reading.network]!,
  };
}

async function readNode(): Promise<MpmaTableFormatResolution | null> {
  try {
    const info = await fetchCounterpartyServerInfo();
    const height = Number(info.counterparty_height);
    if (typeof info.network !== 'string' || !Number.isSafeInteger(height) || height < 0) return null;
    // Core composes for `last_db_index + 1`, the earliest block the transaction can land in.
    return resolutionFrom({ network: info.network, nextBlockIndex: height + 1 });
  } catch {
    return null;
  }
}

async function readChain(forceRefresh: boolean): Promise<MpmaTableFormatResolution | null> {
  try {
    const tip = await getCurrentBlockHeight(forceRefresh);
    return Number.isSafeInteger(tip) && tip > 0
      ? resolutionFrom({ network: 'mainnet', nextBlockIndex: tip + 1 })
      : null;
  } catch {
    return null;
  }
}

/**
 * The table an MPMA sent now must carry, or null when that cannot be established.
 *
 * Two readings of the height are taken: the Counterparty node's own (its network and ledger tip,
 * from the same `/v2/` status the wallet's other activation-gated features read), and the Bitcoin
 * tip from the block explorers, which the node does not control. The node's reading is the one
 * that matches what it composes; the explorers' keeps a node that misreports its height or network
 * from having a table accepted that mainnet would read differently. When both are available they
 * must name the same table — a cached explorer height is refreshed once before deciding they do
 * not — and a disagreement yields null, which callers treat as "cannot confirm", never as either
 * answer. When only one is available it decides.
 */
export async function resolveMpmaTableFormat(): Promise<MpmaTableFormatResolution | null> {
  const node = await readNode();
  let chain = await readChain(false);
  if (node && chain && node.format !== chain.format) chain = await readChain(true);
  if (node && chain) return node.format === chain.format ? node : null;
  return node ?? chain;
}

/**
 * Whether a legacy-table MPMA is being sent so close to activation that a slow confirmation would
 * land it under the new rules, where it is refused. Informational: the table is still the right
 * one for the next block.
 */
export function mpmaNearsActivation(resolution: MpmaTableFormatResolution | null): boolean {
  if (!resolution || resolution.format !== 'legacy') return false;
  const blocksLeft = resolution.activationHeight - resolution.nextBlockIndex;
  return blocksLeft > 0 && blocksLeft <= MPMA_ACTIVATION_NOTICE_BLOCKS;
}

/**
 * The refusal for an MPMA whose address table is not the one core reads at the next block, or null
 * when it is (or when the height could not be read — the recipients shown are then those of the
 * table the bytes carry, which is also what core reads once the height agrees).
 *
 * Only a site's request reaches this: the wallet's own composes are held to the table before
 * review. Blocked in both directions, since neither is a send that does what it shows: a
 * length-prefixed table read before activation names other recipients, and a legacy table read
 * after it is refused while the fee is still paid.
 */
export function mpmaTableWarning(
  carried: MpmaTableFormat | undefined,
  expected: MpmaTableFormatResolution | null
): SecurityWarning | null {
  if (!carried || !expected || carried === expected.format) return null;
  return carried === 'length-prefixed'
    ? {
      severity: 'block',
      title: 'Blocked: Recipients Would Be Misread',
      message:
        `This send lists its recipients in the layout Counterparty adopts at block ${expected.activationHeight}. ` +
        'Mined before then, it would be read with the earlier layout, which names different ' +
        'recipients from the ones shown here.',
    }
    : {
      severity: 'block',
      title: 'Blocked: Send Would Not Take Effect',
      message:
        `This send lists its recipients in the layout Counterparty replaced at block ${expected.activationHeight}. ` +
        'Mined now, it would be rejected and nothing would be sent, though the Bitcoin fee would ' +
        'still be paid.',
    };
}
