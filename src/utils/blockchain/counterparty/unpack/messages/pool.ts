import { BinaryReader } from '../binary';
import { assetIdToName } from '../assetId';

// Exact payload lengths, matching counterparty-core (pooldeposit.py ">QQQQQQ",
// poolwithdraw.py ">QQQQQ"). Core rejects any other length, so the verifier must too.
const POOL_DEPOSIT_LENGTH = 48;
const POOL_WITHDRAW_LENGTH = 40;

export interface PoolDepositData {
  assetA: string;
  assetAId: bigint;
  assetB: string;
  assetBId: bigint;
  quantityA: bigint;
  quantityB: bigint;
  minLpQuantity: bigint;
  lpAssetId: bigint;
  lpAsset?: string;
}

export interface PoolWithdrawData {
  assetA: string;
  assetAId: bigint;
  assetB: string;
  assetBId: bigint;
  quantity: bigint;
  minQuantityA: bigint;
  minQuantityB: bigint;
}

export function unpackPoolDeposit(payload: Uint8Array): PoolDepositData {
  if (payload.length !== POOL_DEPOSIT_LENGTH) {
    throw new Error(`Invalid pool deposit payload length: ${payload.length} (expected ${POOL_DEPOSIT_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const assetAId = reader.readUint64BE();
  const assetBId = reader.readUint64BE();
  const quantityA = reader.readUint64BE();
  const quantityB = reader.readUint64BE();
  const minLpQuantity = reader.readUint64BE();
  const lpAssetId = reader.readUint64BE();

  return {
    assetA: assetIdToName(assetAId),
    assetAId,
    assetB: assetIdToName(assetBId),
    assetBId,
    quantityA,
    quantityB,
    minLpQuantity,
    lpAssetId,
    ...(lpAssetId > 0n ? { lpAsset: assetIdToName(lpAssetId) } : {}),
  };
}

export function unpackPoolWithdraw(payload: Uint8Array): PoolWithdrawData {
  if (payload.length !== POOL_WITHDRAW_LENGTH) {
    throw new Error(`Invalid pool withdraw payload length: ${payload.length} (expected ${POOL_WITHDRAW_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const assetAId = reader.readUint64BE();
  const assetBId = reader.readUint64BE();
  const quantity = reader.readUint64BE();
  const minQuantityA = reader.readUint64BE();
  const minQuantityB = reader.readUint64BE();

  return {
    assetA: assetIdToName(assetAId),
    assetAId,
    assetB: assetIdToName(assetBId),
    assetBId,
    quantity,
    minQuantityA,
    minQuantityB,
  };
}
