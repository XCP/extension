/**
 * Separate from `composer-context.tsx` so that reading the context does not pull in building it:
 * the provider imports the wallet, which imports `webext-bridge`, which calls
 * `chrome.runtime.connect` at module load and fails under jsdom. Keep every import here type-only.
 */

import { createContext, use } from "react";
import type { useSettings } from "@/contexts/settings-context";
import type { useWallet } from "@/contexts/wallet-context";
import type { ScriptPaymentRisk } from "@/core/bitcoin/scriptPaymentRisk";
import type { ApiResponse } from "@/core/counterparty/compose";
import type { ZeldHuntProgress } from "@/core/zeld/types";

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
  /** Live figures while a ZELD hunt runs between composing and review; null otherwise. */
  zeldHuntProgress: ZeldHuntProgress | null;
  /**
   * Payments to script addresses this wallet does not control, from an address holding
   * Counterparty assets; null when there are none. Signing waits for an acknowledgement.
   */
  scriptPaymentRisk: ScriptPaymentRisk | null;
}

export interface ComposerContextType<T> {
  state: ComposerState<T>;

  composeTransaction: (formData: FormData) => Promise<void>;
  signAndBroadcast: () => Promise<void>;
  /** review → form, success → home. */
  goBack: () => void;
  reset: () => void;
  clearError: () => void;
  /** Record that the user reviewed `state.scriptPaymentRisk`; call it before `signAndBroadcast`. */
  acknowledgeScriptPaymentRisk: () => void;
  /** Settle the ZELD hunt for the rare txid it already holds rather than waiting out the budget. */
  acceptZeldHunt: () => void;

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
