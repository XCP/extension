/**
 * Who a BTCPay pays, and how much — derived from the order match rather than taken from the
 * composer's answer.
 *
 * A BTCPay settles a matched order by paying the BTC side. The message carries only the 64-byte
 * `order_match_id`, so byte-equality verification accepts any output layout that quotes the right
 * id: the payee and the amount are nowhere in the signed bytes. Output accounting could not help
 * either, because the payee is not an address the user typed — it comes from the match — so the
 * compose path exempted BTCPay entirely and an added output went unexamined (GHSA-2wjj-rfjm-hcqh).
 *
 * The match itself is the answer. `messages/btcpay.py` decides the destination and quantity from
 * it with no other input, so a wallet holding the match can reach the same two values on its own
 * and hold the transaction to them. Reading ledger state is not the same act as trusting a composed
 * transaction: a composer would have to corrupt the match record as well to move the payment, and
 * the match is what every other party settles against.
 */

import type { OrderMatch } from '@/core/counterparty/api';

/** The single output a BTCPay must pay, in satoshis. */
export interface BtcPayPayment {
  address: string;
  /** Satoshis. Core takes this straight from the match's BTC side. */
  quantity: number;
}

/** Counterparty's name for bitcoin on the ledger. */
const BTC = 'BTC';

/**
 * The payment a BTCPay for this match owes, or null when neither side is BTC.
 *
 * Mirrors `btcpay.validate`: whichever side of the match is BTC is the side being paid, and the
 * *other* side's address receives it. Null rather than a guess — a match with no BTC leg is not a
 * BTCPay, and inventing a payee would be worse than declining to check one.
 */
export function btcPayPayment(match: OrderMatch): BtcPayPayment | null {
  if (match.backward_asset === BTC) {
    return { address: match.tx0_address, quantity: match.backward_quantity };
  }
  if (match.forward_asset === BTC) {
    return { address: match.tx1_address, quantity: match.forward_quantity };
  }
  return null;
}
