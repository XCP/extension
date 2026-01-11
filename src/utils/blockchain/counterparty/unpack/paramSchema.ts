/**
 * Parameter Schema for Counterparty Messages
 *
 * Defines the criticality of each parameter for verification and UI display.
 * This schema is used to categorize mismatches by severity.
 *
 * Criticality Levels:
 * - CRITICAL: Funds at risk if wrong (asset, quantity, destination)
 * - DANGEROUS: Harmful side effects if wrong (lock, reset, status)
 * - INFORMATIONAL: Metadata, no direct harm (memo, description, tag)
 */

export type Criticality = 'critical' | 'dangerous' | 'informational';

export interface ParamDefinition {
  /** How critical is this param for security */
  criticality: Criticality;
  /** What happens if this is wrong */
  riskDescription: string;
}

export interface MessageSchema {
  /** Message type name */
  messageType: string;
  /** Message type IDs that map to this schema */
  messageTypeIds: number[];
  /** Parameter definitions */
  params: Record<string, ParamDefinition>;
}

/**
 * Schema definitions for each message type
 */
export const MESSAGE_SCHEMAS: Record<string, MessageSchema> = {
  send: {
    messageType: 'send',
    messageTypeIds: [0],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = lose wrong tokens',
      },
      quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = lose more than intended',
      },
    },
  },

  enhanced_send: {
    messageType: 'enhanced_send',
    messageTypeIds: [2],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = lose wrong tokens',
      },
      quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = lose more than intended',
      },
      destination: {
        criticality: 'critical',
        riskDescription: 'Wrong address = funds sent to wrong recipient',
      },
      memo: {
        criticality: 'informational',
        riskDescription: 'Just metadata, no direct financial impact',
      },
    },
  },

  mpma_send: {
    messageType: 'mpma_send',
    messageTypeIds: [3],
    params: {
      sends: {
        criticality: 'critical',
        riskDescription: 'Array of sends - each asset/quantity/destination must be verified',
      },
    },
  },

  sweep: {
    messageType: 'sweep',
    messageTypeIds: [4],
    params: {
      destination: {
        criticality: 'critical',
        riskDescription: 'Wrong address = all assets sent to wrong recipient',
      },
      flags: {
        criticality: 'dangerous',
        riskDescription: 'Controls what gets swept (balances, ownerships, etc.)',
      },
      memo: {
        criticality: 'informational',
        riskDescription: 'Just metadata, no direct financial impact',
      },
    },
  },

  order: {
    messageType: 'order',
    messageTypeIds: [10],
    params: {
      give_asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = offering wrong tokens',
      },
      give_quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = offering more than intended',
      },
      get_asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = receiving wrong tokens',
      },
      get_quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = bad exchange rate',
      },
      expiration: {
        criticality: 'dangerous',
        riskDescription: 'Too short = expires before fill, too long = funds locked longer',
      },
      fee_required: {
        criticality: 'dangerous',
        riskDescription: 'Higher fee = lose more BTC on match',
      },
    },
  },

  btcpay: {
    messageType: 'btcpay',
    messageTypeIds: [11],
    params: {
      order_match_id: {
        criticality: 'critical',
        riskDescription: 'Wrong order match = paying for wrong trade',
      },
    },
  },

  dispenser: {
    messageType: 'dispenser',
    messageTypeIds: [12],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = dispensing wrong tokens',
      },
      give_quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = giving wrong amount per dispense',
      },
      escrow_quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = locking wrong total amount',
      },
      mainchainrate: {
        criticality: 'critical',
        riskDescription: 'Wrong rate = selling at wrong price',
      },
      status: {
        criticality: 'dangerous',
        riskDescription: 'Wrong status = dispenser open when should be closed or vice versa',
      },
      open_address: {
        criticality: 'dangerous',
        riskDescription: 'Wrong address = someone else can refill/control dispenser',
      },
      oracle_address: {
        criticality: 'dangerous',
        riskDescription: 'Wrong oracle = price determined by untrusted source',
      },
    },
  },

  dispense: {
    messageType: 'dispense',
    messageTypeIds: [13],
    params: {
      // Dispense is minimal - verification is at transaction level
    },
  },

  issuance: {
    messageType: 'issuance',
    messageTypeIds: [20, 21, 22, 23],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset name = creating/modifying wrong asset',
      },
      quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = issuing wrong supply',
      },
      divisible: {
        criticality: 'dangerous',
        riskDescription: 'PERMANENT: Cannot change divisibility after creation',
      },
      lock: {
        criticality: 'dangerous',
        riskDescription: 'PERMANENT: Locks supply forever, cannot issue more',
      },
      reset: {
        criticality: 'dangerous',
        riskDescription: 'DESTRUCTIVE: Resets asset, existing holders lose tokens',
      },
      transfer_destination: {
        criticality: 'critical',
        riskDescription: 'Transfers ownership to another address',
      },
      description: {
        criticality: 'informational',
        riskDescription: 'Asset description, visible but not financial',
      },
    },
  },

  broadcast: {
    messageType: 'broadcast',
    messageTypeIds: [30],
    params: {
      timestamp: {
        criticality: 'informational',
        riskDescription: 'Broadcast timestamp',
      },
      value: {
        criticality: 'dangerous',
        riskDescription: 'Oracle value - may affect dependent contracts',
      },
      fee_fraction: {
        criticality: 'dangerous',
        riskDescription: 'Fee charged to users of this oracle',
      },
      text: {
        criticality: 'informational',
        riskDescription: 'Broadcast message text',
      },
    },
  },

  dividend: {
    messageType: 'dividend',
    messageTypeIds: [50],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = paying dividend to wrong token holders',
      },
      quantity_per_unit: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = paying wrong dividend per unit',
      },
      dividend_asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = paying dividend in wrong currency',
      },
    },
  },

  cancel: {
    messageType: 'cancel',
    messageTypeIds: [70],
    params: {
      offer_hash: {
        criticality: 'critical',
        riskDescription: 'Wrong hash = cancelling wrong order/offer',
      },
    },
  },

  fairminter: {
    messageType: 'fairminter',
    messageTypeIds: [90],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Asset name for the fairminter',
      },
      price: {
        criticality: 'critical',
        riskDescription: 'Price in XCP per lot - wrong = bad economics',
      },
      quantity_by_price: {
        criticality: 'critical',
        riskDescription: 'Units given per price - affects effective price',
      },
      hard_cap: {
        criticality: 'dangerous',
        riskDescription: 'Maximum supply - affects scarcity',
      },
      max_mint_per_tx: {
        criticality: 'dangerous',
        riskDescription: 'Max per transaction - rate limiting',
      },
      divisible: {
        criticality: 'dangerous',
        riskDescription: 'PERMANENT: Cannot change after creation',
      },
      lock_quantity: {
        criticality: 'dangerous',
        riskDescription: 'PERMANENT: Locks supply at hard cap',
      },
      lock_description: {
        criticality: 'dangerous',
        riskDescription: 'PERMANENT: Locks description',
      },
      description: {
        criticality: 'informational',
        riskDescription: 'Asset description',
      },
    },
  },

  fairmint: {
    messageType: 'fairmint',
    messageTypeIds: [91],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = minting from wrong fairminter',
      },
      quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong quantity = paying wrong amount',
      },
    },
  },

  detach: {
    messageType: 'detach',
    messageTypeIds: [100],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = detaching wrong tokens from UTXO',
      },
      quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = detaching wrong quantity',
      },
    },
  },

  attach: {
    messageType: 'attach',
    messageTypeIds: [101],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = attaching wrong tokens to UTXO',
      },
      quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = attaching wrong quantity',
      },
      destination_vout: {
        criticality: 'dangerous',
        riskDescription: 'Wrong vout = attaching to wrong output',
      },
    },
  },

  destroy: {
    messageType: 'destroy',
    messageTypeIds: [110],
    params: {
      asset: {
        criticality: 'critical',
        riskDescription: 'Wrong asset = destroying wrong tokens',
      },
      quantity: {
        criticality: 'critical',
        riskDescription: 'Wrong amount = destroying more than intended',
      },
      tag: {
        criticality: 'informational',
        riskDescription: 'Just a label, no financial impact',
      },
    },
  },
};

/**
 * Get schema for a message type
 */
export function getMessageSchema(messageType: string): MessageSchema | undefined {
  return MESSAGE_SCHEMAS[messageType];
}

/**
 * Get schema by message type ID
 */
export function getSchemaByTypeId(messageTypeId: number): MessageSchema | undefined {
  for (const schema of Object.values(MESSAGE_SCHEMAS)) {
    if (schema.messageTypeIds.includes(messageTypeId)) {
      return schema;
    }
  }
  return undefined;
}

/**
 * Get all critical params for a message type
 */
export function getCriticalParams(messageType: string): ParamDefinition[] {
  const schema = MESSAGE_SCHEMAS[messageType];
  if (!schema) return [];
  return Object.values(schema.params).filter((p) => p.criticality === 'critical');
}

/**
 * Get all dangerous params for a message type
 */
export function getDangerousParams(messageType: string): ParamDefinition[] {
  const schema = MESSAGE_SCHEMAS[messageType];
  if (!schema) return [];
  return Object.values(schema.params).filter((p) => p.criticality === 'dangerous');
}
