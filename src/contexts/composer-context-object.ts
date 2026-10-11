/**
 * Separate from `composer-context.tsx` so that reading the context does not pull in building it:
 * the provider imports the wallet and settings contexts and, through them, the background proxy.
 * Keep every import here type-only.
 */

import { createContext, use } from "react";
import type { FormValues } from "@/components/composer/form-values";
import type { useSettings } from "@/contexts/settings-context";
import type { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse } from "@/core/counterparty/compose";
import type { ZeldHuntProgress } from "@/core/zeld/types";

export interface DecodedMessage {
  messageType: string;
  data: Record<string, unknown>;
}

/** Broadcast facts owned by the wallet, never supplied by the compose API. */
export interface ComposerBroadcastResult {
  broadcast?: { txid?: string };
  revealBroadcast?: { txid?: string };
  /** Commit accepted, but reveal submission failed; includes signed reveal recovery data. */
  broadcastWarning?: string;
}

export interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: FormValues<T> | null;
  apiResponse: (ApiResponse & ComposerBroadcastResult) | null;
  error: string | null;
  verificationWarnings: string[];
  /** Neutral notes for the review screen: facts about the send, not differences from the request. */
  reviewNotices: string[];
  /** Decoded from the transaction's own bytes, not from the response's echo of the request. */
  decodedMessage: DecodedMessage | null;
  isComposing: boolean;
  isSigning: boolean;
  composedAt: number | null;
  /** sat/vB; null means a valid fee rate has not been selected yet. */
  feeRate: number | null;
  /** Live figures while a ZELD hunt runs between composing and review; null otherwise. */
  zeldHuntProgress: ZeldHuntProgress | null;
}

export interface ComposerContextType<T> {
  state: ComposerState<T>;

  composeTransaction: (formData: FormData) => Promise<void>;
  signAndBroadcast: () => Promise<void>;
  /** review → form, success → home. */
  goBack: () => void;
  reset: () => void;
  clearError: () => void;
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

// React stores one context object for every form type. Consumers without a form type must
// narrow formData before reading it; only the typed hook asserts the caller's form contract.
export const ComposerContext = createContext<ComposerContextType<unknown> | undefined>(undefined);

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
