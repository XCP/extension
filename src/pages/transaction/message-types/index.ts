import type { ReactNode } from "react";
import type { Transaction } from "@/utils/blockchain/counterparty";

// Import all message type handlers
import { dispenser } from "./dispenser";
import { dispense } from "./dispense";
import { order } from "./order";
import { send } from "./send";
import { mpma } from "./mpma";
import { issuance } from "./issuance";
import { cancel } from "./cancel";
import { bet } from "./bet";
import { dividend } from "./dividend";
import { broadcast } from "./broadcast";
import { fairminter } from "./fairminter";
import { fairmint } from "./fairmint";
import { sweep } from "./sweep";
import { attach } from "./attach";
import { detach } from "./detach";
import { btcpay } from "./btcpay";
import { move_utxo } from "./move_utxo";

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
  bet,
  dividend,
  broadcast,
  fairminter,
  fairmint,
  sweep,
  attach,
  detach,
  move_utxo,
  btcpay,
  // Add aliases for variations
  enhanced_send: send,
  open_order: order,
  open_dispenser: dispenser,
};

/**
 * Get the appropriate handler for a transaction
 */
export function getMessageHandler(messageType: string): MessageHandler | undefined {
  return messageHandlers[messageType];
}