/**
 * Prove a decode is complete by rebuilding the bytes from it.
 *
 * ### Why this exists
 *
 * The approval screen previously corroborated its decode by asking the Counterparty API to decode
 * the *same bytes* and comparing. Both sides read one input, so that comparison can never catch a
 * hostile dApp or a substituted payload — there is no second copy of the truth to disagree with.
 * All it could catch was a bug in this project's unpacker, and it was rendered to the user as "no
 * tampering detected", which claims far more than it earned. It was also fragile in practice: the
 * endpoint truncates mpma_send to a single send, and until the JSON boundary was fixed it rounded
 * 64-bit quantities, producing a "tampering" verdict for a disagreement our own parsing had
 * manufactured.
 *
 * Re-packing asks a different and answerable question: **does the decode account for every byte?**
 * Take the fields the screen is about to describe, rebuild the message with `pack/messages.ts`,
 * and compare byte for byte against the payload actually being signed. Equality proves nothing is
 * hiding in a field the unpacker skipped or a region it never read, because a byte the decode did
 * not capture could not have been reproduced. It needs no network, it cannot be influenced by a
 * remote party, and it is exact.
 *
 * ### It is a positive proof only
 *
 * Byte equality proves completeness. Inequality does **not** prove tampering — it may equally mean
 * this adapter is imperfect for a message shape, or that the sender used a non-canonical encoding
 * core still accepts. Reporting a difference as an alarm would cry wolf on legitimate
 * transactions, which is the failure mode that trains people to click through warnings. So a
 * difference is reported as "not proved", exactly like a message type with no packer at all. This
 * mirrors `packComposeMessage`'s own contract: a null return means "cannot verify by equality",
 * never "verified".
 */

import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { bytesToHex } from '@/core/counterparty/unpack/binary';
import type { AttachData, DetachData, MoveData } from '@/core/counterparty/unpack/messages/attach';
import type { BroadcastData } from '@/core/counterparty/unpack/messages/broadcast';
import type { BTCPayData } from '@/core/counterparty/unpack/messages/btcpay';
import type { CancelData } from '@/core/counterparty/unpack/messages/cancel';
import type { DestroyData } from '@/core/counterparty/unpack/messages/destroy';
import type { DispenserData } from '@/core/counterparty/unpack/messages/dispenser';
import type { DividendData } from '@/core/counterparty/unpack/messages/dividend';
import type { EnhancedSendData } from '@/core/counterparty/unpack/messages/enhancedSend';
import type { FairmintData } from '@/core/counterparty/unpack/messages/fairmint';
import type { FairminterData } from '@/core/counterparty/unpack/messages/fairminter';
import type { IssuanceData } from '@/core/counterparty/unpack/messages/issuance';
import type { MPMAData } from '@/core/counterparty/unpack/messages/mpma';
import type { OrderData } from '@/core/counterparty/unpack/messages/order';
import type { PoolDepositData, PoolWithdrawData } from '@/core/counterparty/unpack/messages/pool';
import type { SweepData } from '@/core/counterparty/unpack/messages/sweep';

/** Why a decode could not be proved complete. Never surfaced as an accusation. */
export type RepackUnproved =
  | 'no-adapter'   // this message type cannot be rebuilt in this build
  | 'not-equal';   // rebuilt bytes differ — adapter gap or non-canonical encoding, not a verdict

export interface RepackResult {
  /** True only when rebuilt bytes matched the payload exactly. */
  proved: boolean;
  reason?: RepackUnproved;
}

type Params = Record<string, unknown>;

/**
 * Map a decoded message back to the compose parameters that produce it.
 *
 * Returns null where a shape cannot be expressed. Memos are the common case: only the plain-text
 * form is packed, so a binary memo yields no params rather than a wrong guess.
 */
function paramsFor(messageType: string, data: unknown): { composeType: string; params: Params } | null {
  switch (messageType) {
    case 'enhanced_send':
    case 'send': {
      const send = data as EnhancedSendData;
      if (send.memoBytes && send.memo === undefined) return null;
      return {
        composeType: 'send',
        params: {
          destination: send.destination,
          asset: send.asset,
          quantity: send.quantity,
          ...(send.memo ? { memo: send.memo } : {}),
        },
      };
    }

    case 'mpma_send': {
      const mpma = data as MPMAData;
      if (!mpma.sends?.length) return null;
      // Per-send and global memos change the encoding; only the plain form is rebuilt here.
      if (mpma.globalMemo || mpma.sends.some((s) => s.memo)) return null;
      return {
        composeType: 'mpma',
        params: {
          destinations: mpma.sends.map((s) => s.destination).join(','),
          assets: mpma.sends.map((s) => s.asset).join(','),
          quantities: mpma.sends.map((s) => s.quantity.toString()).join(','),
        },
      };
    }

    case 'sweep': {
      const sweep = data as SweepData;
      if (sweep.memoIsBinary) return null;
      return {
        composeType: 'sweep',
        params: {
          destination: sweep.destination,
          flags: sweep.flags,
          ...(sweep.memo ? { memo: sweep.memo } : {}),
        },
      };
    }

    case 'destroy': {
      const destroy = data as DestroyData;
      return {
        composeType: 'destroy',
        params: {
          asset: destroy.asset,
          quantity: destroy.quantity,
          ...(destroy.tag ? { tag: destroy.tag } : {}),
        },
      };
    }

    case 'cancel':
      return { composeType: 'cancel', params: { offer_hash: (data as CancelData).offerHash } };

    case 'order': {
      const order = data as OrderData;
      return {
        composeType: 'order',
        params: {
          give_asset: order.giveAsset,
          give_quantity: order.giveQuantity,
          get_asset: order.getAsset,
          get_quantity: order.getQuantity,
          expiration: order.expiration,
          fee_required: order.feeRequired,
        },
      };
    }

    case 'dividend': {
      const dividend = data as DividendData;
      return {
        composeType: 'dividend',
        params: {
          asset: dividend.asset,
          dividend_asset: dividend.dividendAsset,
          quantity_per_unit: dividend.quantityPerUnit,
        },
      };
    }

    case 'fairmint': {
      const fairmint = data as FairmintData;
      return {
        composeType: 'fairmint',
        params: { asset: fairmint.asset, quantity: fairmint.quantity },
      };
    }

    case 'issuance': {
      const issuance = data as IssuanceData;
      // Subassets carry a parent and a randomly drawn id the request does not determine, and the
      // packer builds only the standard form, so those are left unproved rather than guessed at.
      if (issuance.subassetLongname) return null;
      return {
        composeType: 'issuance',
        params: {
          asset: issuance.asset,
          quantity: issuance.quantity,
          divisible: issuance.divisible,
          ...(issuance.description ? { description: issuance.description } : {}),
          ...(issuance.mimeType ? { mime_type: issuance.mimeType } : {}),
          ...(issuance.isLock ? { lock: true } : {}),
        },
      };
    }

    case 'fairminter': {
      const fairminter = data as FairminterData;
      if (fairminter.assetParent) return null; // subasset fairminters are not packed here
      return {
        composeType: 'fairminter',
        params: {
          asset: fairminter.asset,
          lot_price: fairminter.price,
          lot_size: fairminter.quantityByPrice,
          max_mint_per_tx: fairminter.maxMintPerTx,
          max_mint_per_address: fairminter.maxMintPerAddress,
          hard_cap: fairminter.hardCap,
          premint_quantity: fairminter.premintQuantity,
          start_block: fairminter.startBlock,
          end_block: fairminter.endBlock,
          soft_cap: fairminter.softCap,
          soft_cap_deadline_block: fairminter.softCapDeadlineBlock,
          // The packer recomputes int(commission * 1e8), so the float is handed back the way it
          // arrived. A value that does not survive the round trip reports unproved, not tampered.
          minted_asset_commission: Number(fairminter.mintedAssetCommissionInt) / 1e8,
          burn_payment: fairminter.burnPayment,
          lock_description: fairminter.lockDescription,
          lock_quantity: fairminter.lockQuantity,
          divisible: fairminter.divisible,
          pool_quantity: fairminter.poolQuantity,
          ...(fairminter.lpAsset ? { lp_asset: fairminter.lpAsset } : {}),
          ...(fairminter.mimeType ? { mime_type: fairminter.mimeType } : {}),
          ...(fairminter.description ? { description: fairminter.description } : {}),
        },
      };
    }

    case 'broadcast': {
      const broadcast = data as BroadcastData;
      return {
        composeType: 'broadcast',
        params: {
          text: broadcast.text,
          value: broadcast.value,
          fee_fraction: broadcast.feeFractionInt / 1e8,
          timestamp: broadcast.timestamp,
          ...(broadcast.mimeType ? { mime_type: broadcast.mimeType } : {}),
        },
      };
    }

    case 'attach': {
      const attach = data as AttachData;
      return {
        composeType: 'attach',
        params: {
          asset: attach.asset,
          quantity: attach.quantity,
          ...(attach.destinationVout !== undefined ? { destination_vout: attach.destinationVout } : {}),
        },
      };
    }

    case 'detach': {
      const detach = data as DetachData;
      return { composeType: 'detach', params: { destination: detach.destination } };
    }

    case 'utxo':
    case 'utxo_move': {
      const move = data as MoveData;
      return {
        composeType: 'utxo',
        params: {
          source: move.source,
          destination: move.destination,
          asset: move.asset,
          quantity: move.quantity,
        },
      };
    }

    case 'btcpay': {
      const btcpay = data as BTCPayData;
      // Core writes the two order-match hashes; the id is their "_"-joined form.
      if (!btcpay.tx0Hash || !btcpay.tx1Hash) return null;
      return {
        composeType: 'btcpay',
        params: { order_match_id: `${btcpay.tx0Hash}_${btcpay.tx1Hash}` },
      };
    }

    case 'dispenser': {
      const dispenser = data as DispenserData;
      return {
        composeType: 'dispenser',
        params: {
          asset: dispenser.asset,
          give_quantity: dispenser.giveQuantity,
          escrow_quantity: dispenser.escrowQuantity,
          mainchainrate: dispenser.mainchainrate,
          status: dispenser.status,
          ...(dispenser.openAddress ? { open_address: dispenser.openAddress } : {}),
          ...(dispenser.oracleAddress ? { oracle_address: dispenser.oracleAddress } : {}),
        },
      };
    }

    case 'pooldeposit': {
      const pool = data as PoolDepositData;
      return {
        composeType: 'pooldeposit',
        params: {
          asset_a: pool.assetA, asset_b: pool.assetB,
          quantity_a: pool.quantityA, quantity_b: pool.quantityB,
          min_lp_quantity: pool.minLpQuantity,
          ...(pool.lpAsset ? { lp_asset: pool.lpAsset } : {}),
        },
      };
    }

    case 'poolwithdraw': {
      const pool = data as PoolWithdrawData;
      return {
        composeType: 'poolwithdraw',
        params: {
          asset_a: pool.assetA, asset_b: pool.assetB,
          quantity: pool.quantity,
          min_quantity_a: pool.minQuantityA, min_quantity_b: pool.minQuantityB,
        },
      };
    }

    case 'dispense':
      // The payload is a single marker byte, so equality here only rules out a substituted type.
      return { composeType: 'dispense', params: {} };

    default:
      return null;
  }
}

/**
 * Rebuild `payloadHex` from its decoded form and report whether the two match exactly.
 *
 * @param payloadHex - the payload being signed, CNTRPRTY prefix included, as `pack` emits it
 */
export function proveByRepack(
  messageType: string | undefined,
  data: unknown,
  payloadHex: string
): RepackResult {
  if (!messageType || data == null) return { proved: false, reason: 'no-adapter' };

  const mapped = paramsFor(messageType, data);
  if (!mapped) return { proved: false, reason: 'no-adapter' };

  const packed = packComposeMessage(mapped.composeType, mapped.params as never);
  if (!packed) return { proved: false, reason: 'no-adapter' };

  const rebuilt = bytesToHex(packed.bytes).toLowerCase();
  return rebuilt === payloadHex.toLowerCase()
    ? { proved: true }
    : { proved: false, reason: 'not-equal' };
}
