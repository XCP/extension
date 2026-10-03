import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import type { ConsolidationData } from '../../consolidationApi';
import { bareMultisigScript, buildPrevTx, counterpartyDataKey, txidOf } from './bareMultisigFixtures';

// Public test key only. A single Stamps funding transaction can leave hundreds of outputs.
export const RECOVERY_TEST_KEY = '11'.repeat(32);
export const RECOVERY_TEST_PUBKEY = getPublicKey(hexToBytes(RECOVERY_TEST_KEY), true);
export const RECOVERY_TEST_SCRIPT = bareMultisigScript(1, [RECOVERY_TEST_PUBKEY, counterpartyDataKey()]);

export function recoveryBatchFixture(count = 205): ConsolidationData {
  const parent = buildPrevTx(Array.from({ length: count }, () => ({
    amount: 10_000n, script: RECOVERY_TEST_SCRIPT,
  })), 1);
  const txid = txidOf(parent);
  return {
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    summary: { total_utxos: count, total_btc: count / 10_000, batches_required: 1,
      current_batch: 1, batch_utxos: count, max_batch_utxos: 420 },
    fee_config: { fee_address: '', fee_percent: 0, exemption_threshold: 0 },
    utxos: Array.from({ length: count }, (_, vout) => ({
      txid, vout, amount: 10_000, prev_tx_hex: bytesToHex(parent),
      script: bytesToHex(RECOVERY_TEST_SCRIPT), position: 0, script_type: 'bare_multisig',
    })),
    mempool_status: { pending_consolidations: 0, pending_utxo_count: 0, can_broadcast_more: true },
    stamp_protection: { protected_utxos: 0, protected_btc: 0, included: false },
  };
}
