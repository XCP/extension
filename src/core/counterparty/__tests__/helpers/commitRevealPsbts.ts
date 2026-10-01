/**
 * A Core 11.5 Taproot compose as a site sends it in a `commit-and-reveal` bundle: the commit as a
 * PSBT with `witnessUtxo` prevouts, and the unsigned reveal as a PSBT whose input 0 spends commit
 * output 0 (its `witnessUtxo`) through the envelope leaf and its control block.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Address, OutScript, p2tr, TAPROOT_UNSPENDABLE_KEY, TaprootControlBlock, Transaction } from '@scure/btc-signer';
import { pubSchnorr } from '@scure/btc-signer/utils.js';
import type { Compose115Result, Fixture115 } from '@/core/counterparty/__tests__/taproot115Fixtures';
import { encodeCbor } from '@/core/counterparty/pack/cbor';

const RAW = { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true };

export interface CommitRevealPsbts {
  commitHex: string;
  revealHex: string;
  /** The commit's txid, which the reveal spends. */
  commitTxid: string;
  /** The transaction the commit's input spends, when one was built (`fundedBy`). */
  parentHex?: string;
  /** The sighash each commit input signs with: ALL for P2WPKH, DEFAULT for P2TR. */
  commitSighash: number;
}

export interface CommitRevealOptions {
  /**
   * Re-fund the commit from a parent built here, paying the fixture's key what Core's commit spent,
   * so prevout checks can read it; the reveal then spends the re-funded commit. `fill` makes the
   * parent unique.
   */
  fundedBy?: { fill: number };
  /** Edits to the reveal PSBT's input 0 before it is serialized (tampering tests). */
  editRevealInput?: (input: Parameters<Transaction['addInput']>[0]) => Parameters<Transaction['addInput']>[0];
  /** Edits to the reveal transaction (its outputs) before it is serialized. */
  editReveal?: (reveal: Transaction) => void;
  /** Edits to the commit PSBT before it is serialized. */
  editCommit?: (commit: Transaction) => void;
}

/** Build the bundle's two PSBTs from a captured (or recomposed) Core 11.5 compose. */
export function commitRevealPsbts(
  fixture: Fixture115,
  result: Compose115Result = fixture.result,
  options: CommitRevealOptions = {},
): CommitRevealPsbts {
  const raw = Transaction.fromRaw(hexToBytes(result.rawtransaction), RAW);
  let parentHex: string | undefined;
  const inputTxids = Array.from({ length: raw.inputsLength }, (_, index) => raw.getInput(index).txid!);
  if (options.fundedBy) {
    const parent = new Transaction(RAW);
    parent.addInput({ txid: new Uint8Array(32).fill(options.fundedBy.fill), index: 0 });
    const vout = raw.getInput(0).index!;
    for (let index = 0; index <= vout; index += 1) {
      parent.addOutput({ script: hexToBytes(fixture.key.scriptHex), amount: BigInt(result.inputs_values[0]!) });
    }
    parentHex = bytesToHex(parent.toBytes(true, false));
    inputTxids[0] = hexToBytes(parent.id);
  }

  const commit = new Transaction({ version: raw.version, lockTime: raw.lockTime, ...RAW });
  for (let index = 0; index < raw.inputsLength; index += 1) {
    const input = raw.getInput(index);
    commit.addInput({
      txid: inputTxids[index]!,
      index: input.index!,
      sequence: input.sequence,
      witnessUtxo: { script: hexToBytes(result.lock_scripts[index]!), amount: BigInt(result.inputs_values[index]!) },
    });
  }
  for (let index = 0; index < raw.outputsLength; index += 1) {
    const output = raw.getOutput(index);
    commit.addOutput({ script: output.script!, amount: output.amount! });
  }
  options.editCommit?.(commit);
  const commitTxid = commit.id;

  const original = Transaction.fromRaw(hexToBytes(result.reveal_rawtransaction), RAW);
  options.editReveal?.(original);
  const reveal = new Transaction({ version: original.version, lockTime: original.lockTime, ...RAW });
  const envelope = hexToBytes(result.envelope_script);
  const input = {
    txid: hexToBytes(commitTxid),
    index: 0,
    sequence: original.getInput(0).sequence,
    witnessUtxo: {
      script: hexToBytes(result.reveal_lock_scripts[0]!),
      amount: BigInt(result.reveal_inputs_values[0]!),
    },
    tapLeafScript: [[
      TaprootControlBlock.decode(hexToBytes(result.reveal_control_block)),
      new Uint8Array([...envelope, 0xc0]),
    ]],
  } as Parameters<Transaction['addInput']>[0];
  for (let index = 0; index < original.outputsLength; index += 1) {
    const output = original.getOutput(index);
    reveal.addOutput({ script: output.script!, amount: output.amount! });
  }
  reveal.addInput(options.editRevealInput ? options.editRevealInput(input) : input);

  return {
    commitHex: bytesToHex(commit.toPSBT()),
    revealHex: bytesToHex(reveal.toPSBT()),
    commitTxid,
    ...(parentHex ? { parentHex } : {}),
    commitSighash: fixture.key.format === 'P2TR' ? 0x00 : 0x01,
  };
}

/** The bundle's two stored items, signed by the fixture's key as a site would request them. */
export function commitRevealItems(fixture: Fixture115, psbts: CommitRevealPsbts) {
  const commitInputs = Transaction.fromPSBT(hexToBytes(psbts.commitHex), RAW).inputsLength;
  const indices = Array.from({ length: commitInputs }, (_, index) => index);
  return {
    commit: {
      psbtHex: psbts.commitHex,
      signInputs: { [fixture.key.address]: indices },
      sighashTypes: indices.map(() => psbts.commitSighash),
    },
    reveal: {
      psbtHex: psbts.revealHex,
      signInputs: { [fixture.key.address]: [0] },
      sighashTypes: [0x00],
    },
  };
}

/**
 * A launch as a launchpad site's own envelope builder shapes it, rather than Core: a fairminter
 * inscription whose ord envelope carries a properties tag (0x11) besides the `xcp` metadata, closed
 * by the funding P2TR address's *output* key and committed under the unspendable internal key; the
 * reveal pays the inscription's dust to a burn address beside the bare CNTRPRTY marker and is signed
 * `SIGHASH_ALL`. Funded from a parent built here, so prevout checks can read it.
 */
export interface SiteLaunch {
  privateKeyHex: string;
  /** The funding (and signing) P2TR address. */
  address: string;
  parentHex: string;
  commitHex: string;
  revealHex: string;
  commitTxid: string;
  leafHex: string;
}

export const SITE_BURN_ADDRESS = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';

function pushOp(out: number[], data: Uint8Array): void {
  if (data.length < 0x4c) out.push(data.length);
  else if (data.length <= 0xff) out.push(0x4c, data.length);
  else out.push(0x4d, data.length & 0xff, data.length >> 8);
  out.push(...data);
}

/** A fairminter's metadata, as Core packs it before the MIME type and content it takes from the envelope. */
const FAIRMINTER_METADATA: Array<bigint | boolean> = [
  90n, 95428956661682177n, 0n, 100000000n, 1000000000n, 1000000000n, 0n, 100000000000n, 0n,
  969200n, 0n, 10000000000n, 970200n, 0n, false, true, true, true, 5000000000n, 95428956661682178n,
];

export function siteLaunch(bodyBytes: number, fill: number, options: { internalKey?: Uint8Array } = {}): SiteLaunch {
  const privateKey = new Uint8Array(32).fill(0xa1);
  const payment = p2tr(pubSchnorr(privateKey));
  const address = payment.address!;
  const outputKey = payment.script.slice(2, 34);
  const encoder = new TextEncoder();
  const body = new Uint8Array(bodyBytes).map((_, i) => (i * 31 + 7) & 0xff);
  const metadata = encodeCbor(FAIRMINTER_METADATA);
  const ops: number[] = [0x00, 0x63];
  pushOp(ops, encoder.encode('ord'));
  pushOp(ops, new Uint8Array([0x07]));
  pushOp(ops, encoder.encode('xcp'));
  pushOp(ops, new Uint8Array([0x01]));
  pushOp(ops, encoder.encode('image/png'));
  pushOp(ops, new Uint8Array([0x11]));
  pushOp(ops, encodeCbor(['SAFELAUNCH', 'https://xcp.fun/SAFELAUNCH.json']));
  for (let i = 0; i < metadata.length; i += 520) {
    pushOp(ops, new Uint8Array([0x05]));
    pushOp(ops, metadata.slice(i, i + 520));
  }
  ops.push(0x00);
  for (let i = 0; i < body.length; i += 520) pushOp(ops, body.slice(i, i + 520));
  ops.push(0x68);
  pushOp(ops, outputKey);
  ops.push(0xac);
  const leaf = new Uint8Array(ops);
  const tree = p2tr(options.internalKey ?? TAPROOT_UNSPENDABLE_KEY, { script: leaf, leafVersion: 0xc0 }, undefined, true);

  const parent = new Transaction(RAW);
  parent.addInput({ txid: new Uint8Array(32).fill(fill), index: 0 });
  parent.addOutput({ script: payment.script, amount: 5_000_000n });

  // The reveal's size once signed ALL (a 65-byte signature), at 2 sat/vB, plus the dust it pays.
  const dust = 546n;
  const burn = OutScript.encode(Address().decode(SITE_BURN_ADDRESS));
  const marker = hexToBytes('6a08434e545250525459');
  const sizer = new Transaction(RAW);
  sizer.addOutput({ script: burn, amount: dust });
  sizer.addOutput({ script: marker, amount: 0n });
  sizer.addInput({ txid: new Uint8Array(32), index: 0, finalScriptWitness: [new Uint8Array(65), leaf, new Uint8Array(33)] });
  const commitAmount = dust + BigInt(sizer.vsize * 2);

  const commit = new Transaction(RAW);
  commit.addInput({ txid: hexToBytes(parent.id), index: 0, witnessUtxo: { script: payment.script, amount: 5_000_000n } });
  commit.addOutput({ script: tree.script, amount: commitAmount });
  commit.addOutput({ script: payment.script, amount: 5_000_000n - commitAmount - 300n });

  const reveal = new Transaction(RAW);
  reveal.addOutput({ script: burn, amount: dust });
  reveal.addOutput({ script: marker, amount: 0n });
  reveal.addInput({
    txid: hexToBytes(commit.id), index: 0, sighashType: 0x01,
    witnessUtxo: { script: tree.script, amount: commitAmount },
    tapLeafScript: tree.tapLeafScript,
  });

  return {
    privateKeyHex: bytesToHex(privateKey),
    address,
    parentHex: bytesToHex(parent.toBytes(true, false)),
    commitHex: bytesToHex(commit.toPSBT()),
    revealHex: bytesToHex(reveal.toPSBT()),
    commitTxid: commit.id,
    leafHex: bytesToHex(leaf),
  };
}

/** A site launch's two stored items: the commit signed DEFAULT from P2TR, the reveal ALL. */
export function siteLaunchItems(launch: SiteLaunch) {
  return {
    commit: { psbtHex: launch.commitHex, signInputs: { [launch.address]: [0] }, sighashTypes: [0x00] },
    reveal: { psbtHex: launch.revealHex, signInputs: { [launch.address]: [0] }, sighashTypes: [0x01] },
  };
}
