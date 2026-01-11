/**
 * Parameter Schema for Counterparty Messages
 *
 * Defines the criticality and requirements of each parameter for verification.
 * This schema drives verification logic to ensure we check what matters.
 *
 * Criticality Levels:
 * - CRITICAL: Funds at risk if wrong (asset, quantity, destination)
 * - DANGEROUS: Harmful side effects if wrong (lock, reset, status)
 * - INFORMATIONAL: Metadata, no direct harm (memo, description, tag)
 *
 * Presence:
 * - required: Always present in the message
 * - optional: May or may not be present
 * - conditional: Present based on other fields or context
 */

export type Criticality = 'critical' | 'dangerous' | 'informational';
export type Presence = 'required' | 'optional' | 'conditional';

export interface ParamDefinition {
  /** How critical is this param for security */
  criticality: Criticality;
  /** Is this param always present, optional, or conditional */
  presence: Presence;
  /** What happens if this is wrong */
  riskDescription: string;
  /** Field name in local unpack (camelCase) */
  localField: string;
  /** Possible field names in API response (may vary) */
  apiFields: string[];
  /** Field name in compose request (snake_case usually) */
  composeField: string;
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
  enhanced_send: {
    messageType: 'enhanced_send',
    messageTypeIds: [2], // ENHANCED_SEND
    params: {
      asset: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong asset = lose wrong tokens',
        localField: 'asset',
        apiFields: ['asset'],
        composeField: 'asset',
      },
      quantity: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong amount = lose more than intended',
        localField: 'quantity',
        apiFields: ['quantity'],
        composeField: 'quantity',
      },
      destination: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong address = funds sent to wrong recipient',
        localField: 'destination',
        apiFields: ['destination', 'address'],
        composeField: 'destination',
      },
      memo: {
        criticality: 'informational',
        presence: 'optional',
        riskDescription: 'Just metadata, no direct financial impact',
        localField: 'memo',
        apiFields: ['memo'],
        composeField: 'memo',
      },
    },
  },

  send: {
    messageType: 'send',
    messageTypeIds: [0], // SEND (legacy)
    params: {
      asset: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong asset = lose wrong tokens',
        localField: 'asset',
        apiFields: ['asset'],
        composeField: 'asset',
      },
      quantity: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong amount = lose more than intended',
        localField: 'quantity',
        apiFields: ['quantity'],
        composeField: 'quantity',
      },
      // Note: destination is in the transaction output, not the OP_RETURN for legacy send
    },
  },

  order: {
    messageType: 'order',
    messageTypeIds: [10], // ORDER
    params: {
      give_asset: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong asset = offering wrong tokens',
        localField: 'giveAsset',
        apiFields: ['give_asset', 'giveAsset'],
        composeField: 'give_asset',
      },
      give_quantity: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong amount = offering more than intended',
        localField: 'giveQuantity',
        apiFields: ['give_quantity', 'giveQuantity'],
        composeField: 'give_quantity',
      },
      get_asset: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong asset = receiving wrong tokens',
        localField: 'getAsset',
        apiFields: ['get_asset', 'getAsset'],
        composeField: 'get_asset',
      },
      get_quantity: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong amount = bad exchange rate',
        localField: 'getQuantity',
        apiFields: ['get_quantity', 'getQuantity'],
        composeField: 'get_quantity',
      },
      expiration: {
        criticality: 'dangerous',
        presence: 'required',
        riskDescription: 'Too short = expires before fill, too long = funds locked longer',
        localField: 'expiration',
        apiFields: ['expiration'],
        composeField: 'expiration',
      },
      fee_required: {
        criticality: 'dangerous',
        presence: 'optional',
        riskDescription: 'Higher fee = lose more BTC on match',
        localField: 'feeRequired',
        apiFields: ['fee_required', 'feeRequired'],
        composeField: 'fee_required',
      },
    },
  },

  dispenser: {
    messageType: 'dispenser',
    messageTypeIds: [12], // DISPENSER
    params: {
      asset: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong asset = dispensing wrong tokens',
        localField: 'asset',
        apiFields: ['asset'],
        composeField: 'asset',
      },
      give_quantity: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong amount = giving wrong amount per dispense',
        localField: 'giveQuantity',
        apiFields: ['give_quantity', 'giveQuantity'],
        composeField: 'give_quantity',
      },
      escrow_quantity: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong amount = locking wrong total amount',
        localField: 'escrowQuantity',
        apiFields: ['escrow_quantity', 'escrowQuantity'],
        composeField: 'escrow_quantity',
      },
      mainchainrate: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong rate = selling at wrong price',
        localField: 'mainchainrate',
        apiFields: ['mainchainrate', 'satoshirate'],
        composeField: 'mainchainrate',
      },
      status: {
        criticality: 'dangerous',
        presence: 'optional',
        riskDescription: 'Wrong status = dispenser open when should be closed or vice versa',
        localField: 'status',
        apiFields: ['status'],
        composeField: 'status',
      },
      open_address: {
        criticality: 'dangerous',
        presence: 'optional',
        riskDescription: 'Wrong address = someone else can refill/control dispenser',
        localField: 'openAddress',
        apiFields: ['open_address', 'openAddress'],
        composeField: 'open_address',
      },
      oracle_address: {
        criticality: 'dangerous',
        presence: 'optional',
        riskDescription: 'Wrong oracle = price determined by untrusted source',
        localField: 'oracleAddress',
        apiFields: ['oracle_address', 'oracleAddress'],
        composeField: 'oracle_address',
      },
    },
  },

  issuance: {
    messageType: 'issuance',
    messageTypeIds: [20, 21, 22, 23], // ISSUANCE, SUBASSET_ISSUANCE, etc.
    params: {
      asset: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong asset name = creating/modifying wrong asset',
        localField: 'asset',
        apiFields: ['asset', 'asset_name'],
        composeField: 'asset',
      },
      quantity: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong amount = issuing wrong supply',
        localField: 'quantity',
        apiFields: ['quantity'],
        composeField: 'quantity',
      },
      divisible: {
        criticality: 'dangerous',
        presence: 'conditional', // Only on first issuance
        riskDescription: 'PERMANENT: Cannot change divisibility after creation',
        localField: 'divisible',
        apiFields: ['divisible'],
        composeField: 'divisible',
      },
      lock: {
        criticality: 'dangerous',
        presence: 'optional',
        riskDescription: 'PERMANENT: Locks supply forever, cannot issue more',
        localField: 'lock',
        apiFields: ['lock', 'locked'],
        composeField: 'lock',
      },
      reset: {
        criticality: 'dangerous',
        presence: 'optional',
        riskDescription: 'DESTRUCTIVE: Resets asset, existing holders lose tokens',
        localField: 'reset',
        apiFields: ['reset'],
        composeField: 'reset',
      },
      transfer_destination: {
        criticality: 'critical',
        presence: 'optional',
        riskDescription: 'Transfers ownership to another address',
        localField: 'transferDestination',
        apiFields: ['transfer_destination', 'transferDestination'],
        composeField: 'transfer_destination',
      },
      description: {
        criticality: 'informational',
        presence: 'optional',
        riskDescription: 'Asset description, visible but not financial',
        localField: 'description',
        apiFields: ['description'],
        composeField: 'description',
      },
    },
  },

  cancel: {
    messageType: 'cancel',
    messageTypeIds: [70], // CANCEL
    params: {
      offer_hash: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong hash = cancelling wrong order/offer',
        localField: 'offerHash',
        apiFields: ['offer_hash', 'offerHash', 'tx_hash', 'txHash'],
        composeField: 'offer_hash',
      },
    },
  },

  destroy: {
    messageType: 'destroy',
    messageTypeIds: [110], // DESTROY
    params: {
      asset: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong asset = destroying wrong tokens',
        localField: 'asset',
        apiFields: ['asset'],
        composeField: 'asset',
      },
      quantity: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong amount = destroying more than intended',
        localField: 'quantity',
        apiFields: ['quantity'],
        composeField: 'quantity',
      },
      tag: {
        criticality: 'informational',
        presence: 'optional',
        riskDescription: 'Just a label, no financial impact',
        localField: 'tag',
        apiFields: ['tag'],
        composeField: 'tag',
      },
    },
  },

  sweep: {
    messageType: 'sweep',
    messageTypeIds: [4], // SWEEP
    params: {
      destination: {
        criticality: 'critical',
        presence: 'required',
        riskDescription: 'Wrong address = all assets sent to wrong recipient',
        localField: 'destination',
        apiFields: ['destination', 'address'],
        composeField: 'destination',
      },
      flags: {
        criticality: 'dangerous',
        presence: 'required',
        riskDescription: 'Controls what gets swept (balances, ownerships, etc.)',
        localField: 'flags',
        apiFields: ['flags'],
        composeField: 'flags',
      },
      memo: {
        criticality: 'informational',
        presence: 'optional',
        riskDescription: 'Just metadata, no direct financial impact',
        localField: 'memo',
        apiFields: ['memo'],
        composeField: 'memo',
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
  return Object.values(schema.params).filter(p => p.criticality === 'critical');
}

/**
 * Get all dangerous params for a message type
 */
export function getDangerousParams(messageType: string): ParamDefinition[] {
  const schema = MESSAGE_SCHEMAS[messageType];
  if (!schema) return [];
  return Object.values(schema.params).filter(p => p.criticality === 'dangerous');
}

/**
 * Get all required params for a message type
 */
export function getRequiredParams(messageType: string): ParamDefinition[] {
  const schema = MESSAGE_SCHEMAS[messageType];
  if (!schema) return [];
  return Object.values(schema.params).filter(p => p.presence === 'required');
}
