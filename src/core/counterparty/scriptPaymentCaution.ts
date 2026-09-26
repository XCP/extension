/**
 * The script-address caution for transactions the wallet builds itself: sends, dispenses, BTCPay,
 * UTXO moves, consolidation and the rest.
 *
 * Detection is `scriptPaymentRisk.ts` and the payer's holdings are `assetHoldings.ts`, exactly as
 * a site's signing request uses them (`signRequestAnalysis.ts`). This adapts a composed
 * transaction, or a set of payments not yet built, to that detection, and words the result the
 * one way every surface states it.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { decodeAddressFromScript, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseTransactionForSigning } from '@/core/bitcoin/rawTransaction';
import {
  type PaymentOutput,
  type ScriptPaymentRisk,
  scriptPaymentCandidates,
  scriptPaymentRisk,
} from '@/core/bitcoin/scriptPaymentRisk';
import { addressHoldsCounterpartyAssets } from '@/core/counterparty/assetHoldings';
import { fromSatoshis, toSafeInteger } from '@/core/numeric';
import { scriptHexForAddress } from '@/core/zeld/huntTemplate';
import { t } from '@/i18n';

/** The caution's title and body, for the approval screens and the wallet's own review alike. */
export function scriptPaymentRiskText(risk: ScriptPaymentRisk): { title: string; description: string } {
  const btcAmount = fromSatoshis(risk.totalSats);
  return {
    title: t('safety_unproven_script_output'),
    description: risk.addresses.length === 1
      ? t('safety_unproven_script_output_one', [btcAmount, risk.addresses[0]!, risk.source])
      : t('safety_unproven_script_output_many', [btcAmount, risk.addresses.join(', '), risk.source]),
  };
}

/**
 * A composed transaction's outputs, each with its script and the address it pays. An output
 * paying one of `ownedAddresses` is named by that address, whatever network it is on, so change is
 * recognized by script rather than by how the parser happens to render it.
 */
export function composedTransactionOutputs(rawTransaction: string, ownedAddresses: string[]): PaymentOutput[] {
  const ownedByScript = new Map<string, string>();
  for (const address of ownedAddresses) {
    const script = scriptHexForAddress(address);
    if (script) ownedByScript.set(script, address);
  }
  const tx = parseTransactionForSigning(rawTransaction);
  const outputs: PaymentOutput[] = [];
  for (let index = 0; index < tx.outputsLength; index += 1) {
    const output = tx.getOutput(index);
    if (!output.script) continue;
    const script = bytesToHex(output.script).toLowerCase();
    const address = ownedByScript.get(script) ?? decodeAddressFromScript(script) ?? undefined;
    outputs.push({ value: toSafeInteger(output.amount) ?? 0, script, ...(address ? { address } : {}) });
  }
  return outputs;
}

/** Payments the wallet is about to build, by address, as outputs the detection can read. */
export function plannedPaymentOutputs(payments: { address: string; value: number }[]): PaymentOutput[] {
  return payments.map(({ address, value }) => {
    const script = scriptHexForAddress(address);
    return { address, value, ...(script ? { script } : {}) };
  });
}

export interface OwnScriptPaymentInput {
  outputs: PaymentOutput[];
  /** The address funding the transaction: in the wallet's own flows, the active address. */
  payerAddress: string;
  /** Every address this wallet controls; the payer is added if missing. */
  ownedAddresses: string[];
  /** Outputs proved to commit to a known script, such as a verified inscription commit. */
  provenAddresses?: string[];
  /** The spent inputs are known to carry attached assets (a UTXO move or detach). */
  inputsCarryAssets?: boolean;
}

/**
 * The risk to state before the wallet signs its own transaction, or null. The holdings lookup runs
 * only when an output pays someone else's script address, so most transactions cost nothing extra;
 * a failed lookup counts as holding (`assetHoldings.ts`).
 */
export async function assessOwnScriptPayments(input: OwnScriptPaymentInput): Promise<ScriptPaymentRisk | null> {
  const payer = normalizeAddressForComparison(input.payerAddress);
  const ownedAddresses = input.ownedAddresses.some(address => normalizeAddressForComparison(address) === payer)
    ? input.ownedAddresses
    : [input.payerAddress, ...input.ownedAddresses];
  const detection = {
    outputs: input.outputs,
    payerAddress: input.payerAddress,
    ownedAddresses,
    provenAddresses: input.provenAddresses ?? [],
  };
  if (scriptPaymentCandidates(detection).length === 0) return null;
  const holds = input.inputsCarryAssets === true || await addressHoldsCounterpartyAssets(input.payerAddress);
  return scriptPaymentRisk(detection, holds);
}
