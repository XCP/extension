import { HardwareWalletError, type HardwareWalletVendor } from '@/core/hardware/types';

/** Presentation facts only; numeric RPC codes and the original message remain separate. */
export interface HardwareErrorMetadata {
  readonly vendor: HardwareWalletVendor;
  readonly code: string;
}

export function parseHardwareErrorMetadata(value: unknown): HardwareErrorMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if ((candidate.vendor !== 'trezor' && candidate.vendor !== 'ledger')
    || typeof candidate.code !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(candidate.code)) return undefined;
  return { vendor: candidate.vendor, code: candidate.code };
}

/** Accept native adapter errors and metadata validated by the trusted extension RPC. */
export function hardwareErrorMetadata(error: unknown): HardwareErrorMetadata | undefined {
  if (error instanceof HardwareWalletError) return parseHardwareErrorMetadata(error);
  if (!(error instanceof Error) || !Object.hasOwn(error, 'hardware')) return undefined;
  return parseHardwareErrorMetadata((error as Error & { hardware?: unknown }).hardware);
}

export function withHardwareErrorMetadata<T extends Error>(error: T, hardware: HardwareErrorMetadata): T & { hardware: HardwareErrorMetadata } {
  return Object.assign(error, { hardware });
}
