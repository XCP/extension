import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { parseTransactionForSigning } from '@/core/bitcoin/rawTransaction';
import { dustThresholdSats } from '@/core/bitcoin/relayPolicy';
import { CounterpartyApiError } from '@/core/errors';
import { scriptHexForAddress } from '@/core/zeld/huntTemplate';

/** Keep attached assets on a small output, including when the source carries excess BTC. */
export function moveOutputSats(destination: string): number {
  const script = scriptHexForAddress(destination);
  if (!script) throw new CounterpartyApiError('Invalid move destination', 'movetoutxo', {});
  return Math.max(330, dustThresholdSats(hexToBytes(script)));
}

/** Core's first output carries the assets; every later output must return BTC to the sender. */
export function assertMoveOutputs(raw: string, destination: string, sourceAddress: string): void {
  const tx = parseTransactionForSigning(raw);
  const recipient = scriptHexForAddress(destination);
  const sender = scriptHexForAddress(sourceAddress);
  const output = tx.outputsLength ? tx.getOutput(0) : undefined;
  if (!output?.script || bytesToHex(output.script) !== recipient
      || output.amount !== BigInt(moveOutputSats(destination))) {
    throw new CounterpartyApiError('Move must send the assets in a small output and return excess BTC as change', 'movetoutxo', {});
  }
  for (let i = 1; i < tx.outputsLength; i++) {
    const change = tx.getOutput(i);
    if (!sender || !change.script || bytesToHex(change.script) !== sender) {
      throw new CounterpartyApiError('Move change must return to the sending address', 'movetoutxo', {});
    }
  }
}
