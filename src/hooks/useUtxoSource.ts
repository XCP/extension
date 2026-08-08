import { useEffect, useState } from "react";
import { fetchUtxoBalances, type UtxoBalance } from "@/core/counterparty/api";

/**
 * The UTXO a compose form spends from, and what it holds.
 */
export interface UtxoSource {
  /** The resolved UTXO, or "" when the form was opened without one. */
  utxo: string;
  balances: UtxoBalance[];
  isLoadingBalances: boolean;
  /** Set when the balance lookup failed, so the form can say so rather than showing zero. */
  error: string | null;
  dismissError: () => void;
}

/**
 * Resolve the source UTXO for a compose form and load the balances it holds.
 *
 * Shared by the detach and move forms: both spend from a UTXO chosen on an
 * earlier screen and show what it holds before the user commits.
 *
 * @param initialUtxo - UTXO passed in by the route
 * @param formDataUtxo - UTXO carried on restored form data, used when the route has none
 */
export function useUtxoSource(
  initialUtxo: string | undefined,
  formDataUtxo: string | undefined,
): UtxoSource {
  const utxo = initialUtxo || formDataUtxo || "";

  const [balances, setBalances] = useState<UtxoBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!utxo) return;

    setIsLoadingBalances(true);
    fetchUtxoBalances(utxo)
      .then((response) => {
        setBalances(response.result || []);
      })
      .catch((err) => {
        console.error("Failed to fetch UTXO balances:", err);
        // Without this the form silently shows "0 Balances", which reads as an
        // empty UTXO rather than as a lookup that failed.
        setError("Could not load balances for this UTXO.");
        setBalances([]);
      })
      .finally(() => {
        setIsLoadingBalances(false);
      });
  }, [utxo]);

  return {
    utxo,
    balances,
    isLoadingBalances,
    error,
    dismissError: () => setError(null),
  };
}
