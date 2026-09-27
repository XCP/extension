import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { attach } from "@/pages/transactions/_messages/attach";
import { broadcast } from "@/pages/transactions/_messages/broadcast";
import { btcpay } from "@/pages/transactions/_messages/btcpay";
import { cancel } from "@/pages/transactions/_messages/cancel";
import { destroy } from "@/pages/transactions/_messages/destroy";
import { detach } from "@/pages/transactions/_messages/detach";
import { dispense } from "@/pages/transactions/_messages/dispense";
// Import all message type handlers
import { dispenser } from "@/pages/transactions/_messages/dispenser";
import { dividend } from "@/pages/transactions/_messages/dividend";
import { fairmint } from "@/pages/transactions/_messages/fairmint";
import { fairminter } from "@/pages/transactions/_messages/fairminter";
import { issuance } from "@/pages/transactions/_messages/issuance";
import { move_utxo } from "@/pages/transactions/_messages/move_utxo";
import { mpma } from "@/pages/transactions/_messages/mpma";
import { order } from "@/pages/transactions/_messages/order";
import { pooldeposit, poolwithdraw } from "@/pages/transactions/_messages/pool";
import { send } from "@/pages/transactions/_messages/send";
import { sweep } from "@/pages/transactions/_messages/sweep";

/**
 * Type for a message handler function
 */
export type MessageHandler = (tx: Transaction) => Array<{ label: string; value: string | ReactNode }>;

/**
 * Map of message types to their handler functions
 */
export const messageHandlers: Record<string, MessageHandler> = {
  dispenser,
  dispense,
  order,
  send,
  mpma,
  issuance,
  cancel,
  dividend,
  broadcast,
  fairminter,
  fairmint,
  sweep,
  attach,
  detach,
  move_utxo,
  btcpay,
  destroy,
  pooldeposit,
  poolwithdraw,
  // Add aliases for variations
  // A UTXO move: Core lists one as `utxomove` (no message; facts in its events), and the API and
  // local unpack name the legacy move message `utxo`. `move_utxo` is kept for older records.
  utxomove: move_utxo,
  utxo: move_utxo,
  subasset_issuance: issuance,
  lr_issuance: issuance,
  lr_subasset: issuance,
  enhanced_send: send,
  mpma_send: mpma,
  open_order: order,
  open_dispenser: dispenser,
};

/**
 * Get the appropriate handler for a transaction
 */
export function getMessageHandler(messageType: string): MessageHandler | undefined {
  return messageHandlers[messageType];
}