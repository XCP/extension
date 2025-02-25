import { Transaction, p2pkh, p2wpkh, p2sh, p2tr, SigHash } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';
import { AddressType } from '@/utils/blockchain/bitcoin/address';
import { fetchUTXOs, getUtxoByTxid, fetchPreviousRawTransaction } from '@/utils/blockchain/bitcoin/utxo';
import type { Wallet, Address } from '@/utils/wallet';

function paymentScript(pubkeyBytes: Uint8Array, addressType: AddressType) {
  switch (addressType) {
    case AddressType.P2PKH:
    case AddressType.Counterwallet:
      return p2pkh(pubkeyBytes);
    case AddressType.P2WPKH:
      return p2wpkh(pubkeyBytes);
    case AddressType.P2SH_P2WPKH:
      return p2sh(p2wpkh(pubkeyBytes));
    case AddressType.P2TR:
      return p2tr(pubkeyBytes);
    default:
      throw new Error(`Unsupported address type: ${addressType}`);
  }
}

export async function signTransaction(
  rawTransaction: string,
  wallet: Wallet,
  targetAddress: Address,
  privateKeyHex: string // New parameter
): Promise<string> {
  if (!wallet) throw new Error('Wallet not provided');
  if (!targetAddress) throw new Error('Target address not provided');
  
  console.log("Using wallet addresses:", wallet.addresses);
  console.log("Target address:", targetAddress);

  const privateKeyBytes = hexToBytes(privateKeyHex);
  const pubkeyBytes = getPublicKey(privateKeyBytes, true);
  const payment = paymentScript(pubkeyBytes, wallet.addressType);
  const utxos = await fetchUTXOs(targetAddress.address);
  if (!utxos || utxos.length === 0) {
    throw new Error('No UTXOs found for the source address');
  }

  const rawTxBytes = hexToBytes(rawTransaction);
  const parsedTx = Transaction.fromRaw(rawTxBytes, {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    disableScriptCheck: true
  });
  const tx = new Transaction({
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    disableScriptCheck: true
  });

  for (let i = 0; i < parsedTx.inputsLength; i++) {
    const input = parsedTx.getInput(i);
    if (!input?.txid || input.index === undefined) {
      throw new Error(`Invalid input at index ${i}`);
    }
    const txidHex = bytesToHex(input.txid);
    const utxo = getUtxoByTxid(utxos, txidHex, input.index);
    if (!utxo) {
      throw new Error(`UTXO not found for input ${i}: ${txidHex}:${input.index}`);
    }
    const rawPrevTx = await fetchPreviousRawTransaction(txidHex);
    if (!rawPrevTx) {
      throw new Error(`Failed to fetch previous transaction for input ${i}: ${txidHex}`);
    }
    const prevTx = Transaction.fromRaw(hexToBytes(rawPrevTx), { allowUnknownInputs: true, allowUnknownOutputs: true });
    const prevOutput = prevTx.getOutput(input.index);
    if (!prevOutput) {
      throw new Error(`Output not found in previous transaction for input ${i}: ${txidHex}:${input.index}`);
    }
    const inputData: any = {
      txid: input.txid,
      index: input.index,
      sequence: 0xfffffffd,
      sighashType: SigHash.ALL,
    };
    if (wallet.addressType === AddressType.P2PKH || wallet.addressType === AddressType.Counterwallet) {
      inputData.nonWitnessUtxo = hexToBytes(rawPrevTx);
    } else {
      inputData.witnessUtxo = {
        script: prevOutput.script,
        amount: prevOutput.amount,
      };
      if (wallet.addressType === AddressType.P2SH_P2WPKH && payment.redeemScript) {
        inputData.redeemScript = payment.redeemScript;
      }
    }
    tx.addInput(inputData);
  }

  for (let i = 0; i < parsedTx.outputsLength; i++) {
    const output = parsedTx.getOutput(i);
    tx.addOutput({
      script: output.script,
      amount: output.amount,
    });
  }

  tx.sign(privateKeyBytes);
  tx.finalize();
  return tx.hex;
}
