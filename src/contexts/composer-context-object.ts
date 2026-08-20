/**
 * Separate from `composer-context.tsx` so that reading the context does not pull in building it:
 * the provider imports the wallet, which imports `webext-bridge`, which calls
 * `chrome.runtime.connect` at module load and fails under jsdom. Keep every import here type-only.
 */

import { createContext, use } from "react";
import type { useSettings } from "@/contexts/settings-context";
import type { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse } from "@/core/counterparty/compose";

export interface DecodedMessage {
  messageType: string;
  data: Record<string, unknown>;
}

export interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: T | null;
  apiResponse: ApiResponse | null;
  error: string | null;
  verificationWarnings: string[];
  /** Decoded from the transaction's own bytes, not from the response's echo of the request. */
  decodedMessage: DecodedMessage | null;
  isComposing: boolean;
  isSigning: boolean;
  composedAt: number | null;
  /** sat/vB; null means a valid fee rate has not been selected yet. */
  feeRate: number | null;
}

export interface ComposerContextType<T> {
  state: ComposerState<T>;

  composeTransaction: (formData: FormData) => Promise<void>;
  signAndBroadcast: () => Promise<void>;
  /** review → form, success → home. */
  goBack: () => void;
  reset: () => void;
  clearError: () => void;

  showHelpText: boolean;
  toggleHelpText: () => void;
  feeRate: number | null;
  setFeeRate: (rate: number | null) => void;

  activeAddress: ReturnType<typeof useWallet>["activeAddress"];
  activeWallet: ReturnType<typeof useWallet>["activeWallet"];
  settings: ReturnType<typeof useSettings>["settings"];
}

export const ComposerContext = createContext<ComposerContextType<any> | undefined>(undefined);

export function useComposer<T>(): ComposerContextType<T> {
  const context = use(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return context as ComposerContextType<T>;
}

/** For components rendered both inside and outside a compose flow. */
export function useComposerOptional<T>(): ComposerContextType<T> | null {
  return (use(ComposerContext) as ComposerContextType<T> | null) ?? null;
}
