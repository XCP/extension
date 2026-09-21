import { bytesToHex } from '@noble/hashes/utils.js';
import { isTextualMimeType } from '@/core/counterparty/inscriptionEnvelope';
import { assetIdToName } from '@/core/counterparty/unpack/assetId';
import { type CborValue, decodeCbor } from '@/core/counterparty/unpack/cbor';

export interface FairminterData {
  asset: string;
  assetParent: string;
  price: bigint;
  quantityByPrice: bigint;
  maxMintPerTx: bigint;
  maxMintPerAddress: bigint;
  hardCap: bigint;
  premintQuantity: bigint;
  startBlock: number;
  endBlock: number;
  softCap: bigint;
  softCapDeadlineBlock: number;
  mintedAssetCommissionInt: bigint;
  burnPayment: boolean;
  lockDescription: boolean;
  lockQuantity: boolean;
  divisible: boolean;
  poolQuantity: bigint;
  lpAsset: string | null;
  mimeType: string;
  description: string;
}

function integer(value: CborValue, field: string): bigint {
  if (typeof value !== 'bigint') throw new Error(`Invalid fairminter ${field}`);
  return value;
}

function flag(value: CborValue, field: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 0n || value === 1n) return value === 1n;
  throw new Error(`Invalid fairminter ${field}`);
}

function text(value: CborValue, field: string): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return new TextDecoder('utf-8', { fatal: true }).decode(value);
  throw new Error(`Invalid fairminter ${field}`);
}

/**
 * A description that arrived as bytes, read the way core reads it (`helpers.bytes_to_content`):
 * textual MIME types decode as UTF-8, everything else hexlifies. An image-carrying fairminter —
 * an inscription — has PNG bytes here, and decoding those as strict UTF-8 threw, which failed the
 * whole unpack for a message core parses fine.
 */
function content(value: CborValue, mimeType: string, field: string): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) {
    if (isTextualMimeType(mimeType || 'text/plain')) {
      return new TextDecoder('utf-8', { fatal: true }).decode(value);
    }
    return bytesToHex(value);
  }
  throw new Error(`Invalid fairminter ${field}`);
}

function block(value: CborValue, field: string): number {
  const parsed = integer(value, field);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Invalid fairminter ${field}`);
  return Number(parsed);
}

export function unpackFairminter(payload: Uint8Array): FairminterData {
  const fields = decodeCbor(payload);
  // Core reads `fields[:17]` and defaults everything after it — mime_type and description are
  // taken only `if len(fields) > 17` / `> 18`, and the pool pair only when there are 21 or more
  // (fairminter.py). Requiring exactly 19 or 21 rejected payloads core accepts, which fails
  // verification and blocks signing on a transaction the chain would honour.
  if (!Array.isArray(fields) || fields.length < 17) {
    throw new Error(`Invalid fairminter field count: ${Array.isArray(fields) ? fields.length : 0} (minimum 17)`);
  }

  const hasPool = fields.length >= 21;
  const poolQuantity = hasPool ? integer(fields[17]!, 'pool quantity') : 0n;
  const lpAssetId = hasPool ? integer(fields[18]!, 'LP asset') : 0n;
  const mimeTypeIndex = hasPool ? 19 : 17;
  const descriptionIndex = hasPool ? 20 : 18;
  const mimeType = fields.length > mimeTypeIndex ? text(fields[mimeTypeIndex]!, 'MIME type') : '';
  const description = fields.length > descriptionIndex
    ? content(fields[descriptionIndex]!, mimeType, 'description') : '';

  return {
    asset: assetIdToName(integer(fields[0]!, 'asset')),
    assetParent: integer(fields[1]!, 'asset parent') === 0n ? '' : assetIdToName(integer(fields[1]!, 'asset parent')),
    price: integer(fields[2]!, 'price'),
    quantityByPrice: integer(fields[3]!, 'quantity by price'),
    maxMintPerTx: integer(fields[4]!, 'max mint per transaction'),
    maxMintPerAddress: integer(fields[5]!, 'max mint per address'),
    hardCap: integer(fields[6]!, 'hard cap'),
    premintQuantity: integer(fields[7]!, 'premint quantity'),
    startBlock: block(fields[8]!, 'start block'),
    endBlock: block(fields[9]!, 'end block'),
    softCap: integer(fields[10]!, 'soft cap'),
    softCapDeadlineBlock: block(fields[11]!, 'soft cap deadline block'),
    mintedAssetCommissionInt: integer(fields[12]!, 'commission'),
    burnPayment: flag(fields[13]!, 'burn payment'),
    lockDescription: flag(fields[14]!, 'lock description'),
    lockQuantity: flag(fields[15]!, 'lock quantity'),
    divisible: flag(fields[16]!, 'divisible'),
    poolQuantity,
    lpAsset: lpAssetId === 0n ? null : assetIdToName(lpAssetId),
    // Reported as it appears on the wire, empty included. Substituting "text/plain" for an absent
    // value would make a fairminter that named that type indistinguishable from one that named
    // none, and any comparison against the request would then reject honest transactions. Callers
    // that need a default for display should apply it themselves.
    mimeType,
    description,
  };
}
