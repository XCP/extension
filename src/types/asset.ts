export interface AssetInfo {
  asset_longname: string | null;
  description?: string;
  issuer?: string;
  divisible?: boolean;
  locked?: boolean;
  supply?: string | number;
  fair_minting?: boolean;
} 