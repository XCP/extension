/**
 * The network edge between the wallet and a regtest stack, and nothing else.
 *
 * The wallet renders every address in its mainnet form (`decodeAddressFromScript`, `unpackAddress`)
 * because it only ever runs on mainnet, while a regtest node only accepts regtest addresses. So
 * the review-versus-ledger suite runs the wallet exactly as it runs in production, as the mainnet
 * form of each throwaway key, and translates at the transport:
 *
 * - `installRegtestFetch` rewrites mainnet addresses in requests to the Counterparty API into their
 *   regtest form (same script, different encoding), answers the wallet's Esplora transaction reads
 *   from Bitcoin Core, stands in for the Electrs a production node has (`withElectrsInputs`), and
 *   refuses every other remote host so the suite never reaches a live service (the ZELD indexer
 *   then reads as unavailable, which the wallet treats as "no ZELD" everywhere);
 * - `utxoTransport` answers the wallet's UTXO and previous-transaction reads from Bitcoin Core.
 *
 * Composition, verification, review, signing and parsing are all the production functions.
 * Addresses are compared by script (`sameScript`), never by string, since the two sides spell the
 * same output differently.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import * as btc from '@scure/btc-signer';


const MAINNET = btc.NETWORK;
const REGTEST_NET = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };
const TESTNET = btc.TEST_NETWORK;

function decodeAny(address: string): Uint8Array | null {
  for (const network of [MAINNET, REGTEST_NET, TESTNET]) {
    try {
      return btc.OutScript.encode(btc.Address(network).decode(address));
    } catch {
      // try the next network
    }
  }
  return null;
}

/** The scriptPubKey an address pays, as hex, whichever network spelled it. */
export function scriptOf(address: string): string {
  const script = decodeAny(address);
  if (!script) throw new Error(`Not an address: ${address}`);
  return Buffer.from(script).toString('hex');
}

/** Whether two addresses, on any network, pay the same script. */
export function sameScript(left: string | undefined | null, right: string | undefined | null): boolean {
  if (!left || !right) return false;
  const a = decodeAny(left);
  const b = decodeAny(right);
  return !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
}

/** The mainnet spelling of an address: what the wallet shows, stores and signs for. */
export function toMainnet(address: string): string {
  const script = decodeAny(address);
  if (!script) throw new Error(`Not an address: ${address}`);
  return btc.Address(MAINNET).encode(btc.OutScript.decode(script));
}

/** The regtest spelling of an address: what the regtest node accepts. */
export function toRegtest(address: string): string {
  const script = decodeAny(address);
  if (!script) throw new Error(`Not an address: ${address}`);
  return btc.Address(REGTEST_NET).encode(btc.OutScript.decode(script));
}

function isMainnetAddress(token: string): boolean {
  try {
    btc.Address(MAINNET).decode(token);
    return true;
  } catch {
    return false;
  }
}

/** Rewrite every mainnet address inside a URL component or form body; anything else is kept. */
function translateText(text: string): string {
  return text.replace(/[A-Za-z0-9]{25,90}/g, token => (isMainnetAddress(token) ? toRegtest(token) : token));
}

function translateUrl(raw: string): string {
  const url = new URL(raw);
  url.pathname = url.pathname.split('/').map(segment => translateText(decodeURIComponent(segment))).join('/');
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) params.append(key, translateText(value));
  url.search = params.toString();
  return url.toString();
}

/**
 * Stand in for the Electrs a production node has and this stack does not.
 *
 * A detach or move is composed from the UTXO alone (`composeUtxoTransaction` sends no inputs), so
 * Core looks up the owner's other outputs for the fee, and it can only do that through Electrs
 * (`backend.get_unspent_txouts`). Here the same lookup is answered from Bitcoin Core's UTXO set and
 * handed to Core as `inputs_set`; Core still chooses among them and still drops any holding assets.
 */
async function withElectrsInputs(raw: string): Promise<string> {
  const url = new URL(raw);
  const utxoCompose = /\/v2\/utxos\/([0-9a-f]{64}):(\d+)\/compose\//.exec(url.pathname);
  if (!utxoCompose || url.searchParams.has('inputs_set')) return raw;
  const { rpc, scanUnspents } = await import('./regtestHarness');
  const out = await rpc<{ scriptPubKey: { address?: string } } | null>('gettxout', [utxoCompose[1], Number(utxoCompose[2])], null);
  const owner = out?.scriptPubKey.address;
  if (!owner) return raw;
  const inputs = (await scanUnspents(owner)).map(u => `${u.txid}:${u.vout}`)
    .filter(outpoint => outpoint !== `${utxoCompose[1]}:${utxoCompose[2]}`);
  if (inputs.length > 0) url.searchParams.set('inputs_set', inputs.join(','));
  return url.toString();
}

let installed = false;

/**
 * Route the wallet's HTTP through the regtest stack: Counterparty requests get their addresses
 * translated, local requests pass through, and any other host is refused with a 503.
 */
export function installRegtestFetch(counterpartyBase: string): void {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch.bind(globalThis);
  const counterpartyOrigin = new URL(counterpartyBase).origin;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const origin = new URL(url).origin;
    if (origin === counterpartyOrigin) {
      const body = typeof init?.body === 'string' ? translateText(init.body) : init?.body;
      return original(await withElectrsInputs(translateUrl(url)), { ...init, ...(body !== undefined ? { body } : {}) });
    }
    if (origin.includes('127.0.0.1') || origin.includes('localhost')) return original(input, init);
    const esplora = /^https:\/\/(mempool\.space|blockstream\.info)\/api\/tx\/([0-9a-f]{64})(\/hex)?$/.exec(url);
    if (esplora) return esploraTransaction(esplora[2]!, !!esplora[3]);
    return new Response(JSON.stringify({ error: 'offline in the regtest suite' }), { status: 503 });
  }) as typeof fetch;
}

/**
 * The two Esplora reads the wallet makes for a transaction it did not compose (input values for the
 * fee check, the parent's bytes), answered from Bitcoin Core in Esplora's shape.
 */
async function esploraTransaction(txid: string, hex: boolean): Promise<Response> {
  const { rpc } = await import('./regtestHarness');
  if (hex) return new Response(await rpc<string>('getrawtransaction', [txid], null), { status: 200 });
  const tx = await rpc<{ vout: Array<{ value: number; scriptPubKey: { hex: string } }> }>('getrawtransaction', [txid, true], null);
  const vout = tx.vout.map(output => {
    let address: string | undefined;
    try {
      address = btc.Address(MAINNET).encode(btc.OutScript.decode(hexToBytes(output.scriptPubKey.hex)));
    } catch {
      address = undefined;
    }
    return { value: Math.round(output.value * 1e8), scriptpubkey: output.scriptPubKey.hex,
      ...(address ? { scriptpubkey_address: address } : {}) };
  });
  return new Response(JSON.stringify({ txid, vout }), { status: 200, headers: { 'content-type': 'application/json' } });
}

/**
 * The wallet's UTXO module, with its two network reads answered by Bitcoin Core.
 *
 * The harness is imported lazily: it imports the signer, which imports the module being mocked,
 * so an eager import from the mock factory would wait on itself.
 */
export function utxoTransport<T extends object>(original: T): T {
  return {
    ...original,
    fetchUTXOs: async (address: string) => {
      const { scanUnspents } = await import('./regtestHarness');
      return (await scanUnspents(toRegtest(address))).map(u => ({
        txid: u.txid, vout: u.vout, value: Math.round(u.amount * 1e8),
        status: { confirmed: true, block_height: u.height, block_hash: '', block_time: 0 },
      }));
    },
    fetchPreviousRawTransaction: async (txid: string) => {
      const { rpc } = await import('./regtestHarness');
      return rpc<string>('getrawtransaction', [txid], null);
    },
  };
}

/** Parse a raw transaction's outputs as scripts and values, for BTC-movement facts. */
export function outputsOf(rawTxHex: string): Array<{ index: number; script: string; value: number }> {
  const tx = btc.Transaction.fromRaw(hexToBytes(rawTxHex), { allowUnknownOutputs: true, disableScriptCheck: true });
  const outputs = [];
  for (let index = 0; index < tx.outputsLength; index++) {
    const output = tx.getOutput(index);
    outputs.push({ index, script: Buffer.from(output.script!).toString('hex'), value: Number(output.amount) });
  }
  return outputs;
}
