import { BinaryReader } from '../binary';
import { assetIdToName } from '../assetId';

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
