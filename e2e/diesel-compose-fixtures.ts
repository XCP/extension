import type { BrowserContext } from '@playwright/test';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Address, OutScript, Transaction } from '@scure/btc-signer';
import { base64 } from '@scure/base';
import { packComposeMessage } from '../src/core/counterparty/pack/messages';
import { arc4 } from '../src/core/counterparty/unpack/binary';

const COIN = { txid: 'cd'.repeat(32), vout: 0, value: 2_000_000 };
const HEIGHT = 965633;
const scriptForAddress = (address: string) => OutScript.encode(Address().decode(address));

export interface DieselComposeCall {
  endpoint: string;
  params: URLSearchParams;
  rawtransaction: string;
}

/**
 * A network-only fixture: the installed extension runs its real settings, composition,
 * input protection and review code. Actual transaction bytes let local verification run.
 * The API honors requested outputs/fees; it never adds DIESEL metadata itself.
 */
export async function mockDieselComposeNetwork(context: BrowserContext) {
  const calls: DieselComposeCall[] = [];
  const unexpectedRequests: string[] = [];
  let source = '';
  const empty = { result: [], next_cursor: null, result_count: 0 };
  const tokenInfo = { asset_longname: null, divisible: true, description: 'Counterparty', issuer: '', locked: true };
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!/^https?:/.test(url.protocol)) return route.continue();
    const json = (data: unknown) => route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } });

    const compose = url.pathname.match(/\/addresses\/([^/]+)\/compose\/(send|destroy)$/);
    if (compose) {
      source = decodeURIComponent(compose[1]);
      const endpoint = compose[2];
      const params = url.searchParams;
      const sourceScript = scriptForAddress(source);
      const offered = params.get('inputs_set') ?? `${COIN.txid}:${COIN.vout}`;
      if (offered !== `${COIN.txid}:${COIN.vout}`) {
        throw new Error(`Unexpected fixture inputs: ${offered}`);
      }
      const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      tx.addInput({ txid: hexToBytes(COIN.txid), index: COIN.vout,
        witnessUtxo: { script: sourceScript, amount: BigInt(COIN.value) } });
      const quantity = BigInt(params.get('quantity')!);
      let data = '';
      if (endpoint === 'send' && params.get('asset') === 'BTC') {
        tx.addOutput({ script: scriptForAddress(params.get('destination')!), amount: quantity });
      } else if (endpoint === 'destroy') {
        const packed = packComposeMessage('destroy', Object.fromEntries(params));
        if (!packed) throw new Error('Unable to pack fixture destruction');
        data = bytesToHex(packed.bytes);
        const encrypted = arc4(hexToBytes(COIN.txid), packed.bytes);
        if (encrypted.length > 75) throw new Error('Fixture only supports a short OP_RETURN');
        tx.addOutput({ script: Uint8Array.from([0x6a, encrypted.length, ...encrypted]), amount: 0n });
      } else {
        throw new Error('Unexpected fixture compose type');
      }
      for (const output of (params.get('more_outputs') ?? '').split(',').filter(Boolean)) {
        const separator = output.indexOf(':');
        const destination = output.slice(separator + 1);
        tx.addOutput({ amount: BigInt(output.slice(0, separator)),
          script: /^[0-9a-f]+$/i.test(destination) ? hexToBytes(destination) : scriptForAddress(destination) });
      }
      let outputTotal = 0;
      for (let index = 0; index < tx.outputsLength; index++) outputTotal += Number(tx.getOutput(index).amount);
      const inputDelta = source.startsWith('bc1p') ? 17 : source.startsWith('bc1q') ? 28 : source.startsWith('3') ? 51 : 108;
      const noChangeVsize = tx.unsignedTx.length + inputDelta;
      const changeOutputSize = 9 + sourceScript.length;
      const fee = params.has('exact_fee') ? Number(params.get('exact_fee')) : Math.ceil((noChangeVsize + changeOutputSize) * Number(params.get('sat_per_vbyte') ?? 1));
      const change = COIN.value - outputTotal - fee;
      if (change < 0) throw new Error('Fixture unexpectedly exhausted its BTC');
      if (change > 0) tx.addOutput({ script: sourceScript, amount: BigInt(change) });
      const vsize = noChangeVsize + (change > 0 ? changeOutputSize : 0);
      const rawtransaction = bytesToHex(tx.unsignedTx);
      calls.push({ endpoint, params, rawtransaction });
      return json({ result: {
        rawtransaction, psbt: base64.encode(tx.toPSBT()), data,
        btc_in: COIN.value, btc_out: outputTotal, btc_change: change, btc_fee: fee,
        lock_scripts: [bytesToHex(sourceScript)], inputs_values: [COIN.value],
        signed_tx_estimated_size: { vsize, adjusted_vsize: vsize, sigops_count: 1 },
        name: endpoint, params: { ...Object.fromEntries(params), source, quantity: Number(quantity),
          quantity_normalized: `${quantity / 100_000_000n}.${(quantity % 100_000_000n).toString().padStart(8, '0')}`,
          asset_info: { ...tokenInfo, asset: params.get('asset') } },
      } });
    }
    const utxos = url.pathname.match(/\/api\/address\/([^/]+)\/utxo$/);
    if (utxos) {
      source = decodeURIComponent(utxos[1]);
      return json([{ ...COIN, status: { confirmed: true, block_height: HEIGHT - 10 } }]);
    }
    if (url.pathname === `/api/tx/${COIN.txid}`) {
      return json({ txid: COIN.txid, vout: [{ value: COIN.value,
        scriptpubkey: bytesToHex(scriptForAddress(source)), scriptpubkey_address: source }],
        status: { confirmed: true, block_height: HEIGHT - 10 } });
    }
    if (url.hostname === 'mainnet.subfrost.io') {
      const body = request.postDataJSON();
      if (body.method === 'metashrew_height') return json({ jsonrpc: '2.0', id: body.id, result: String(HEIGHT) });
      if (body.method === 'alkanes_protorunesbyaddress') return json({ jsonrpc: '2.0', id: body.id, result: { outpoints: [] } });
      if (body.method === 'alkanes_protorunesbyoutpoint') return json({ jsonrpc: '2.0', id: body.id, result: { balance_sheet: { balances: [] } } });
    }
    if (url.pathname.includes('/balances')) {
      if (url.pathname.includes('/utxos/') || url.searchParams.get('type') === 'utxo') return json(empty);
      return json({ ...empty, result_count: 1, result: [{ asset: 'XCP', quantity: '2500000000', quantity_normalized: '25.00000000', asset_info: tokenInfo }] });
    }
    if (url.pathname.includes('/assets/XCP')) return json({ result: { ...tokenInfo, asset: 'XCP', supply: '260000000000000', supply_normalized: '2600000' } });
    if (/\/api\/address\/[^/]+$/.test(url.pathname)) return json({ address: url.pathname.split('/').at(-1),
      chain_stats: { funded_txo_sum: COIN.value, spent_txo_sum: 0, tx_count: 1 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } });
    if (/\/fees\/(recommended|precise)$/.test(url.pathname)) return json({ fastestFee: 2, halfHourFee: 2, hourFee: 1, economyFee: 1, minimumFee: 1 });
    if (url.pathname.endsWith('/fee-estimates')) return json({ '1': 2, '3': 2, '6': 1, '144': 1 });
    if (url.pathname.endsWith('/blocks/tip/height')) return route.fulfill({ body: String(HEIGHT) });
    if (url.hostname === 'blockchain.info' && url.pathname === '/q/getblockcount') return route.fulfill({ body: String(HEIGHT) });
    if (url.pathname.endsWith('/prices')) return json({ USD: 100000 });
    if (url.hostname === 'api.coinbase.com') return json({ data: { amount: '100000', currency: 'USD' } });
    if (url.hostname === 'api.kraken.com') return json({ error: [], result: { XXBTZUSD: { c: ['100000'] } } });
    if (url.pathname.endsWith('/price/ticker')) return json({ result: { xcp: { usd: 5, change_pct: 0, sats: 5000 } } });
    if (url.hostname === 'cdn.xcp.io' && url.pathname.startsWith('/img/icon/')) return route.fulfill({ status: 204, body: '' });
    if (/^\/v2\/?$/.test(url.pathname)) return json({ result: { server_ready: true, network: 'mainnet', version: '11.3.0', counterparty_height: HEIGHT, backend_height: HEIGHT } });
    if (/mempool|\/transactions|\/dispensers|\/assets\/owned/.test(url.pathname)) return json(empty);
    if (url.hostname === 'cdn.usefathom.com') return route.abort();
    unexpectedRequests.push(`${request.method()} ${request.url()}`);
    return route.abort();
  });
  return { calls, unexpectedRequests };
}
