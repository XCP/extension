import { Transaction, p2pkh, p2wpkh, p2sh, p2tr, SigHash, Address as BtcAddress } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';
import { fetchUTXOs, getUtxoByTxid, fetchPreviousRawTransaction, signAllInputsWithUncompressedKey } from '@/utils/blockchain/bitcoin';
import { AddressFormat } from '@/utils/blockchain/bitcoin';
import type { Wallet, Address } from '@/utils/wallet';

function paymentScript(pubkeyBytes: Uint8Array, addressFormat: AddressFormat) {
  switch (addressFormat) {
    case AddressFormat.P2PKH:
    case AddressFormat.Counterwallet:
      return p2pkh(pubkeyBytes);
    case AddressFormat.P2WPKH:
      return p2wpkh(pubkeyBytes);
    case AddressFormat.P2SH_P2WPKH:
      return p2sh(p2wpkh(pubkeyBytes));
    case AddressFormat.P2TR:
      return p2tr(pubkeyBytes);
    default:
      throw new Error(`Unsupported address type: ${ addressFormat }`);
  }
}

export async function signTransaction(
  rawTransaction: string,
  wallet: Wallet,
  targetAddress: Address,
  privateKeyHex: string,
  compressed: boolean = true
): Promise<string> {
  if (!wallet) throw new Error('Wallet not provided');
  if (!targetAddress) throw new Error('Target address not provided');

  const privateKeyBytes = hexToBytes(privateKeyHex);
  const pubkeyBytes = getPublicKey(privateKeyBytes, compressed);
  
  // Retry fetching UTXOs with a small delay to handle timing issues
  let utxos = await fetchUTXOs(targetAddress.address);
  if (!utxos || utxos.length === 0) {
    // Wait a bit and retry once
    await new Promise(resolve => setTimeout(resolve, 1000));
    utxos = await fetchUTXOs(targetAddress.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs found for the source address after retry');
    }
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
    disableScriptCheck: true,
    allowUnknown: true
  });

  const prevOutputScripts: Uint8Array[] = [];

  for (let i = 0; i < parsedTx.inputsLength; i++) {
    const input = parsedTx.getInput(i);
    if (!input?.txid || input.index === undefined) {
      throw new Error(`Invalid input at index ${i}`);
    }
    const txidHex = bytesToHex(input.txid);
    let utxo = getUtxoByTxid(utxos, txidHex, input.index);
    
    // If UTXO not found, try fetching fresh UTXOs once
    if (!utxo) {
      console.warn(`UTXO not found for input ${i}: ${txidHex}:${input.index}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const freshUtxos = await fetchUTXOs(targetAddress.address);
      if (freshUtxos && freshUtxos.length > 0) {
        utxo = getUtxoByTxid(freshUtxos, txidHex, input.index);
        if (utxo) {
          // Update the utxos array with fresh data
          utxos.push(...freshUtxos.filter(u => !utxos.some(existing => 
            existing.txid === u.txid && existing.vout === u.vout
          )));
        }
      }
    }
    
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
    
    if (prevOutput.script) {
      prevOutputScripts.push(prevOutput.script);
    }
    
    const inputData: any = {
      txid: input.txid,
      index: input.index,
      sequence: 0xfffffffd,
      sighashType: SigHash.ALL,
    };
    if (wallet.addressFormat === AddressFormat.P2PKH || wallet.addressFormat === AddressFormat.Counterwallet) {
      inputData.nonWitnessUtxo = hexToBytes(rawPrevTx);
    } else {
      inputData.witnessUtxo = {
        script: prevOutput.script,
        amount: prevOutput.amount,
      };
      if (wallet.addressFormat === AddressFormat.P2SH_P2WPKH) {
        // Generate redeem script for nested SegWit
        const redeemScript = p2wpkh(pubkeyBytes).script;
        if (redeemScript) {
          inputData.redeemScript = redeemScript;
        }
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

  // Sign the transaction
  if (!compressed && (wallet.addressFormat === AddressFormat.P2PKH || wallet.addressFormat === AddressFormat.Counterwallet)) {
    // Uncompressed P2PKH requires custom signing
    signAllInputsWithUncompressedKey(tx, privateKeyBytes, pubkeyBytes, prevOutputScripts);
  } else {
    // Standard signing for all compressed keys
    tx.sign(privateKeyBytes);
  }
  
  tx.finalize();
  
  return tx.hex;
}
