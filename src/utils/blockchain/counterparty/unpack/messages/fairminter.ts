/**
 * Fairminter Message Unpacker
 *
 * Message ID: 90
 *
 * Modern format (fairminter_v2): CBOR encoded array:
 *   [asset_id, asset_parent_id, price, quantity_by_price, max_mint_per_tx,
 *    max_mint_per_address, hard_cap, premint_quantity, start_block, end_block,
 *    soft_cap, soft_cap_deadline_block, minted_asset_commission_int,
 *    burn_payment, lock_description, lock_quantity, divisible, mime_type, description]
 *
 * Legacy format: Pipe-delimited string
 *   asset|asset_parent|price|quantity_by_price|max_mint_per_tx|hard_cap|
 *   premint_quantity|start_block|end_block|soft_cap|soft_cap_deadline_block|
 *   minted_asset_commission_int|burn_payment|lock_description|lock_quantity|
 *   divisible|description
 */

import { assetIdToName } from '../assetId';

/**
 * Unpacked Fairminter data
 */
export interface FairminterData {
  /** Asset name being fairminted */
  asset: string;
  /** Parent asset name (for subassets) */
  assetParent: string;
  /** Price in XCP per quantity_by_price units */
  price: bigint;
  /** Number of asset units given per price */
  quantityByPrice: bigint;
  /** Maximum units that can be minted per transaction */
  maxMintPerTx: bigint;
  /** Maximum units that can be minted per address */
  maxMintPerAddress: bigint;
  /** Total supply cap */
  hardCap: bigint;
  /** Amount pre-minted to issuer */
  premintQuantity: bigint;
  /** Block when fairminter opens */
  startBlock: number;
  /** Block when fairminter closes */
  endBlock: number;
  /** Minimum total to mint before distribution */
  softCap: bigint;
  /** Deadline block for reaching soft cap */
  softCapDeadlineBlock: number;
  /** Commission rate (as integer, divide by 1e8 for fraction) */
  mintedAssetCommissionInt: bigint;
  /** Whether payments are burned */
  burnPayment: boolean;
  /** Whether description is locked */
  lockDescription: boolean;
  /** Whether quantity is locked */
  lockQuantity: boolean;
  /** Whether asset is divisible */
  divisible: boolean;
  /** Description or MIME type */
  description: string;
  /** MIME type (for modern format) */
  mimeType?: string;
}

/**
 * Try to decode CBOR array (basic implementation for fairminter)
 */
function tryDecodeCBORFairminter(payload: Uint8Array): FairminterData | null {
  try {
    // Check for CBOR array marker (0x93 = 19-element array)
    if (payload[0] !== 0x93) {
      return null;
    }

    // Full CBOR parsing would require a CBOR library
    // For now, return null to fall back to legacy parsing
    return null;
  } catch {
    return null;
  }
}

/**
 * Unpack a Fairminter message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked Fairminter data
 * @throws Error if payload is invalid
 */
export function unpackFairminter(payload: Uint8Array): FairminterData {
  if (payload.length === 0) {
    throw new Error('Empty fairminter payload');
  }

  // Try CBOR first (modern format)
  const cborResult = tryDecodeCBORFairminter(payload);
  if (cborResult) {
    return cborResult;
  }

  // Legacy format: pipe-delimited string
  try {
    const text = new TextDecoder('utf-8').decode(payload);
    const parts = text.split('|');

    if (parts.length < 17) {
      throw new Error(`Invalid fairminter format: expected at least 17 fields, got ${parts.length}`);
    }

    // Parse fields in order
    const [
      asset,
      assetParent,
      priceStr,
      quantityByPriceStr,
      maxMintPerTxStr,
      hardCapStr,
      premintQuantityStr,
      startBlockStr,
      endBlockStr,
      softCapStr,
      softCapDeadlineBlockStr,
      mintedAssetCommissionIntStr,
      burnPaymentStr,
      lockDescriptionStr,
      lockQuantityStr,
      divisibleStr,
      ...descriptionParts
    ] = parts;

    // Description may contain | so rejoin
    const description = descriptionParts.join('|');

    return {
      asset: asset || '',
      assetParent: assetParent || '',
      price: BigInt(priceStr || '0'),
      quantityByPrice: BigInt(quantityByPriceStr || '1'),
      maxMintPerTx: BigInt(maxMintPerTxStr || '0'),
      maxMintPerAddress: 0n, // Not in legacy format
      hardCap: BigInt(hardCapStr || '0'),
      premintQuantity: BigInt(premintQuantityStr || '0'),
      startBlock: parseInt(startBlockStr || '0', 10),
      endBlock: parseInt(endBlockStr || '0', 10),
      softCap: BigInt(softCapStr || '0'),
      softCapDeadlineBlock: parseInt(softCapDeadlineBlockStr || '0', 10),
      mintedAssetCommissionInt: BigInt(mintedAssetCommissionIntStr || '0'),
      burnPayment: burnPaymentStr === '1',
      lockDescription: lockDescriptionStr === '1',
      lockQuantity: lockQuantityStr === '1',
      divisible: divisibleStr === '1',
      description,
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Invalid fairminter')) {
      throw e;
    }
    throw new Error(`Failed to parse fairminter payload: ${e}`);
  }
}
