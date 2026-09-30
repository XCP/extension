/**
 * Taproot composes captured from a Counterparty Core 11.5 build on regtest, never broadcast. Core 11.5 returns the commit and an unsigned
 * reveal the wallet signs with the source key, closing the envelope with that key.
 *
 * The keys are throwaway regtest keys derived from a fixed label, so the tests can sign. Each is
 * given in its regtest spelling (as Core saw it) and in the mainnet spelling the wallet holds; the
 * scripts, and so every byte below, are the same on both networks.
 *
 * Each request is recorded beside its result (`inputs_set` aside: every compose spent the key's
 * regtest funding). `e2e/regtest/review-taproot.test.ts` runs the same flow live.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2tr, TaprootControlBlock, Transaction } from '@scure/btc-signer';

export interface Fixture115Key {
  format: 'P2WPKH' | 'P2TR';
  privateKeyHex: string;
  /** The compressed key the wallet stores for the address (untweaked for P2TR). */
  publicKeyHex: string;
  regtestAddress: string;
  address: string;
  scriptHex: string;
}

export interface Compose115Result {
  rawtransaction: string;
  btc_in: number;
  btc_out: number;
  btc_change: number;
  btc_fee: number;
  data: string;
  lock_scripts: string[];
  inputs_values: number[];
  signed_tx_estimated_size: { vsize: number; adjusted_vsize: number; sigops_count: number };
  reveal_rawtransaction: string;
  envelope_script: string;
  reveal_control_block: string;
  reveal_pubkey: string;
  reveal_lock_scripts: string[];
  reveal_inputs_values: number[];
  psbt: string;
  name: string;
}

export interface Fixture115 {
  key: Fixture115Key;
  /** The compose request as sent to Core (endpoint and parameters, inputs_set aside). */
  request: Record<string, string>;
  feeRate: number;
  result: Compose115Result;
}

export const KEY_WPKH: Fixture115Key = {
  format: 'P2WPKH',
  privateKeyHex: '193e980d18f69456d0813ac7dbc8a9d7755c9e6090ac5cd8985d795f94a47073',
  publicKeyHex: '03f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2',
  regtestAddress: 'bcrt1qm9l9y4prz6w6xh3cgnjl38akus9vrytdzl4qvj',
  address: 'bc1qm9l9y4prz6w6xh3cgnjl38akus9vrytd2sh7qg',
  scriptHex: '0014d97e525423169da35e3844e5f89fb6e40ac1916d',
};

export const KEY_TR: Fixture115Key = {
  format: 'P2TR',
  privateKeyHex: '707e6aad36ced1e708f1320ee91a90575a4db0285fbeee2095d011c2acf1abab',
  publicKeyHex: '02bc1228545ff36928de97b50090b4121fb360da40339890e35346308a548228c3',
  regtestAddress: 'bcrt1pn3wlvjl9wqeekfjqytts4vgaj9vrwx4lmeah2nyzel497w7mevaqlydxy3',
  address: 'bc1pn3wlvjl9wqeekfjqytts4vgaj9vrwx4lmeah2nyzel497w7mevaq9430ty',
  scriptHex: '51209c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3a',
};

/** An MPMA of XCP to three recipients from a P2WPKH source: a data envelope. */
export const MPMA_P2WPKH: Fixture115 = {
  key: KEY_WPKH,
  request: {'endpoint':'mpma','assets':'XCP,XCP,XCP','destinations':'bcrt1pn3wlvjl9wqeekfjqytts4vgaj9vrwx4lmeah2nyzel497w7mevaqlydxy3,bcrt1qyk7kk9jcvkytejnpp864t0wh7kzn4x6qkfynj2,bcrt1qjvwk5tmph0n0ly6vmcf3hf48gn64u8y4wlanfa','quantities':'1000,2000,3000','encoding':'taproot','sat_per_vbyte':'3','multisig_pubkey':'03f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2'},
  feeRate: 3,
  result: {
    rawtransaction: '0200000001d6f10d94a75cce30547755fe20459587272aeb02c84f42a3b97136c615dc02890100000000ffffff'
      + 'ff029801000000000000225120e5dcce4286913a2e20c9378f79ab8ce4857f343db001a590d9addbc654d3bcb5'
      + '9dddf50500000000160014d97e525423169da35e3844e5f89fb6e40ac1916d00000000',
    btc_in: 100000000,
    btc_out: 408,
    btc_change: 99999133,
    btc_fee: 459,
    data: '434e5452505254590300032203019c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb'
      + '3a160300931d6a2f61bbe6ff934cde131ba6a744f55e1c9516030025bd6b16586588bcca6109f555bdd7f5853a'
      + '9b404000000000000000600000000000000fa100000000000003e810000000000000bb80',
    lock_scripts: ['0014d97e525423169da35e3844e5f89fb6e40ac1916d'],
    inputs_values: [100000000],
    signed_tx_estimated_size: {'vsize':153,'adjusted_vsize':153,'sigops_count':1},
    reveal_rawtransaction: '020000000100d28d699d502021277e91ddbcfc606035faacd00ac8e99f275241676a6bdb690000000000ffffff'
      + 'ff0100000000000000000a6a08434e54525052545900000000',
    envelope_script: '00634c760300032203019c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3a160300'
      + '931d6a2f61bbe6ff934cde131ba6a744f55e1c9516030025bd6b16586588bcca6109f555bdd7f5853a9b404000'
      + '000000000000600000000000000fa100000000000003e810000000000000bb806820f9200607b6fb83cd236c5f'
      + '8137616fe727841f2ae52c78212b65c19ebe6589d2ac',
    reveal_control_block: 'c0f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2',
    reveal_pubkey: 'f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2',
    reveal_lock_scripts: ['5120e5dcce4286913a2e20c9378f79ab8ce4857f343db001a590d9addbc654d3bcb5'],
    reveal_inputs_values: [408],
    psbt: 'cHNidP8BAH0CAAAAAdbxDZSnXM4wVHdV/iBFlYcnKusCyE9Co7lxNsYV3AKJAQAAAAD/////ApgBAAAAAAAAIlEg5d'
      + 'zOQoaROi4gyTePeauM5IV/ND2wAaWQ2a3bxlTTvLWd3fUFAAAAABYAFNl+UlQjFp2jXjhE5fiftuQKwZFtAAAAAAAA'
      + 'AAA=',
    name: 'mpma',
  },
};

/** A 600-character broadcast from a P2WPKH source: a two-chunk data envelope. */
export const BROADCAST_P2WPKH: Fixture115 = {
  key: KEY_WPKH,
  request: {'endpoint':'broadcast','timestamp':'1790000000','value':'0','fee_fraction':'0','text':'The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown','encoding':'taproot','sat_per_vbyte':'2','multisig_pubkey':'03f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2'},
  feeRate: 2,
  result: {
    rawtransaction: '0200000001d6f10d94a75cce30547755fe20459587272aeb02c84f42a3b97136c615dc02890100000000ffffff'
      + 'ff020e020000000000002251206b529876bba3ccb406299bfdd73afa4a7d668c58f2e0df58db163e7b0d7087e2'
      + 'c0ddf50500000000160014d97e525423169da35e3844e5f89fb6e40ac1916d00000000',
    btc_in: 100000000,
    btc_out: 526,
    btc_change: 99999168,
    btc_fee: 306,
    data: '434e5452505254591e851a6ab13b80fb0000000000000000006059025854686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e',
    lock_scripts: ['0014d97e525423169da35e3844e5f89fb6e40ac1916d'],
    inputs_values: [100000000],
    signed_tx_estimated_size: {'vsize':153,'adjusted_vsize':153,'sigops_count':1},
    reveal_rawtransaction: '0200000001577790aec5957eee3a01095bc21e6cb6be827f4f7effd2fc922b96656a6e0b9e0000000000ffffff'
      + 'ff0100000000000000000a6a08434e54525052545900000000',
    envelope_script: '00634d08021e851a6ab13b80fb0000000000000000006059025854686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e20546865204c65717569636b2062726f776e2066'
      + '6f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e2066'
      + '6f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e6820'
      + 'f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2ac',
    reveal_control_block: 'c1f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2',
    reveal_pubkey: 'f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2',
    reveal_lock_scripts: ['51206b529876bba3ccb406299bfdd73afa4a7d668c58f2e0df58db163e7b0d7087e2'],
    reveal_inputs_values: [526],
    psbt: 'cHNidP8BAH0CAAAAAdbxDZSnXM4wVHdV/iBFlYcnKusCyE9Co7lxNsYV3AKJAQAAAAD/////Ag4CAAAAAAAAIlEga1'
      + 'KYdrujzLQGKZv91zr6Sn1mjFjy4N9Y2xY+ew1wh+LA3fUFAAAAABYAFNl+UlQjFp2jXjhE5fiftuQKwZFtAAAAAAAA'
      + 'AAA=',
    name: 'broadcast',
  },
};

/** The same broadcast from a P2TR source that named its internal key: the envelope closes with that key. */
export const BROADCAST_P2TR_INTERNAL: Fixture115 = {
  key: KEY_TR,
  request: {'endpoint':'broadcast','timestamp':'1790000000','value':'0','fee_fraction':'0','text':'The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown','encoding':'taproot','sat_per_vbyte':'2','multisig_pubkey':'02bc1228545ff36928de97b50090b4121fb360da40339890e35346308a548228c3'},
  feeRate: 2,
  result: {
    rawtransaction: '02000000014d18eb11540fa1a261b97b75c5514542df9baebc1cb7fc9df854520d1f39df610000000000ffffff'
      + 'ff020e02000000000000225120567c8fc599a8a52c60ab678f69592e0ce18f64f6a044e4c8d783bb6f1c19d8d0'
      + 'bcddf505000000002251209c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3a0000'
      + '0000',
    btc_in: 100000000,
    btc_out: 526,
    btc_change: 99999164,
    btc_fee: 310,
    data: '434e5452505254591e851a6ab13b80fb0000000000000000006059025854686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e',
    lock_scripts: ['51209c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3a'],
    inputs_values: [100000000],
    signed_tx_estimated_size: {'vsize':155,'adjusted_vsize':155,'sigops_count':0},
    reveal_rawtransaction: '020000000159cc72456ce520c970b20629c212349ca33791e4bc5e36be004eb751008ad0a00000000000ffffff'
      + 'ff0100000000000000000a6a08434e54525052545900000000',
    envelope_script: '00634d08021e851a6ab13b80fb0000000000000000006059025854686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e20546865204c65717569636b2062726f776e2066'
      + '6f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e2066'
      + '6f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e6820'
      + 'bc1228545ff36928de97b50090b4121fb360da40339890e35346308a548228c3ac',
    reveal_control_block: 'c0bc1228545ff36928de97b50090b4121fb360da40339890e35346308a548228c3',
    reveal_pubkey: 'bc1228545ff36928de97b50090b4121fb360da40339890e35346308a548228c3',
    reveal_lock_scripts: ['5120567c8fc599a8a52c60ab678f69592e0ce18f64f6a044e4c8d783bb6f1c19d8d0'],
    reveal_inputs_values: [526],
    psbt: 'cHNidP8BAIkCAAAAAU0Y6xFUD6GiYbl7dcVRRULfm668HLf8nfhUUg0fOd9hAAAAAAD/////Ag4CAAAAAAAAIlEgVn'
      + 'yPxZmopSxgq2ePaVkuDOGPZPagROTI14O7bxwZ2NC83fUFAAAAACJRIJxd9kvlcDObJkAi1wqxHZFYNxq/3nt1TILP'
      + '6l8728s6AAAAAAAAAAA=',
    name: 'broadcast',
  },
};

/** The same broadcast from a P2TR source that named no key: Core falls back to the output key, signed for with the tweaked private key. */
export const BROADCAST_P2TR_OUTPUT_KEY: Fixture115 = {
  key: KEY_TR,
  request: {'endpoint':'broadcast','timestamp':'1790000000','value':'0','fee_fraction':'0','text':'The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown','encoding':'taproot','sat_per_vbyte':'2'},
  feeRate: 2,
  result: {
    rawtransaction: '02000000014d18eb11540fa1a261b97b75c5514542df9baebc1cb7fc9df854520d1f39df610000000000ffffff'
      + 'ff020e020000000000002251203d8b77cbfeb3a96dac03c5ce6562cb0bd0dea98f65d30c844b97f452d6e4f541'
      + 'bcddf505000000002251209c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3a0000'
      + '0000',
    btc_in: 100000000,
    btc_out: 526,
    btc_change: 99999164,
    btc_fee: 310,
    data: '434e5452505254591e851a6ab13b80fb0000000000000000006059025854686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20'
      + '666f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e',
    lock_scripts: ['51209c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3a'],
    inputs_values: [100000000],
    signed_tx_estimated_size: {'vsize':155,'adjusted_vsize':155,'sigops_count':0},
    reveal_rawtransaction: '0200000001e8311a79623aff27a71a389b1133e6688865d9a7aef9970b6ede6561a7064bcf0000000000ffffff'
      + 'ff0100000000000000000a6a08434e54525052545900000000',
    envelope_script: '00634d08021e851a6ab13b80fb0000000000000000006059025854686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e20666f78'
      + '206a756d7073206f76657220746865206c617a7920646f672e20546865204c65717569636b2062726f776e2066'
      + '6f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e2066'
      + '6f78206a756d7073206f76657220746865206c617a7920646f672e2054686520717569636b2062726f776e6820'
      + '9c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3aac',
    reveal_control_block: 'c09c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3a',
    reveal_pubkey: '9c5df64be570339b264022d70ab11d9158371abfde7b754c82cfea5f3bdbcb3a',
    reveal_lock_scripts: ['51203d8b77cbfeb3a96dac03c5ce6562cb0bd0dea98f65d30c844b97f452d6e4f541'],
    reveal_inputs_values: [526],
    psbt: 'cHNidP8BAIkCAAAAAU0Y6xFUD6GiYbl7dcVRRULfm668HLf8nfhUUg0fOd9hAAAAAAD/////Ag4CAAAAAAAAIlEgPY'
      + 't3y/6zqW2sA8XOZWLLC9DeqY9l0wyES5f0Utbk9UG83fUFAAAAACJRIJxd9kvlcDObJkAi1wqxHZFYNxq/3nt1TILP'
      + '6l8728s6AAAAAAAAAAA=',
    name: 'broadcast',
  },
};

/** A text/plain inscription broadcast of "hello" from a P2WPKH source: an ord envelope whose reveal returns dust. */
export const ORD_BROADCAST_P2WPKH: Fixture115 = {
  key: KEY_WPKH,
  request: {'endpoint':'broadcast','timestamp':'1790000000','value':'0','fee_fraction':'0','text':'hello','inscription':'true','mime_type':'text/plain','encoding':'taproot','sat_per_vbyte':'5','multisig_pubkey':'03f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2'},
  feeRate: 5,
  result: {
    rawtransaction: '0200000001d6f10d94a75cce30547755fe20459587272aeb02c84f42a3b97136c615dc02890100000000ffffff'
      + 'ff020b05000000000000225120826b207fc04869c18901a1348f07bb35dd39276bd22a35a0bfea1d96966c1188'
      + 'f8d8f50500000000160014d97e525423169da35e3844e5f89fb6e40ac1916d00000000',
    btc_in: 100000000,
    btc_out: 1291,
    btc_change: 99997944,
    btc_fee: 765,
    data: '434e5452505254591e851a6ab13b80fb0000000000000000006a746578742f706c61696e4568656c6c6f',
    lock_scripts: ['0014d97e525423169da35e3844e5f89fb6e40ac1916d'],
    inputs_values: [100000000],
    signed_tx_estimated_size: {'vsize':153,'adjusted_vsize':153,'sigops_count':1},
    reveal_rawtransaction: '02000000013a82ff196e4299fe6b073469e020c09c3dc5d558041c6636c2f48a3f023ea4cf0000000000ffffff'
      + 'ff0200000000000000000a6a08434e5452505254592202000000000000160014d97e525423169da35e3844e5f8'
      + '9fb6e40ac1916d00000000',
    envelope_script: '0063036f726401070378637001010a746578742f706c61696e01051284181e1a6ab13b80fb0000000000000000'
      + '00000568656c6c6f6820f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2ac',
    reveal_control_block: 'c1f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2',
    reveal_pubkey: 'f9200607b6fb83cd236c5f8137616fe727841f2ae52c78212b65c19ebe6589d2',
    reveal_lock_scripts: ['5120826b207fc04869c18901a1348f07bb35dd39276bd22a35a0bfea1d96966c1188'],
    reveal_inputs_values: [1291],
    psbt: 'cHNidP8BAH0CAAAAAdbxDZSnXM4wVHdV/iBFlYcnKusCyE9Co7lxNsYV3AKJAQAAAAD/////AgsFAAAAAAAAIlEggm'
      + 'sgf8BIacGJAaE0jwe7Nd05J2vSKjWgv+odlpZsEYj42PUFAAAAABYAFNl+UlQjFp2jXjhE5fiftuQKwZFtAAAAAAAA'
      + 'AAA=',
    name: 'broadcast',
  },
};

/**
 * A fixture's compose rebuilt around a changed envelope, key or tree, with everything downstream
 * made consistent again: commit output 0 pays the new tree, the reveal spends the new commit, and
 * the control block, lock script and value describe it. With no change it reproduces the fixture
 * byte for byte (tested), so what differs in a rebuilt compose is only what was asked for.
 */
export function recompose115(fixture: Fixture115, change: {
  /** A different envelope, hex. Its last push before OP_CHECKSIG is the key it is closed by. */
  envelope?: string;
  /** The tree's internal key; the envelope's key by default, as Core builds it. */
  internalKey?: Uint8Array;
  /** A second leaf hidden in the tree. */
  extraLeaf?: string;
  /** Commit output 0's value; the fixture's by default. */
  commitValue?: number;
  /** Edits to the reveal before it is re-pointed at the new commit. */
  editReveal?: (reveal: Transaction) => void;
} = {}): Compose115Result {
  const envelopeHex = change.envelope ?? fixture.result.envelope_script;
  const envelope = hexToBytes(envelopeHex);
  const envelopeKey = envelope.slice(-33, -1);
  const tree = change.extraLeaf
    ? [{ script: envelope }, { script: hexToBytes(change.extraLeaf) }]
    : { script: envelope };
  const payment = p2tr(change.internalKey ?? envelopeKey, tree, undefined, true);
  const [controlBlock] = payment.tapLeafScript!.find(([, script]) => bytesToHex(script.slice(0, -1)) === envelopeHex)!;

  const options = { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true };
  const commit = Transaction.fromRaw(hexToBytes(fixture.result.rawtransaction), options);
  const commitValue = BigInt(change.commitValue ?? Number(commit.getOutput(0).amount));
  commit.updateOutput(0, { script: payment.script, amount: commitValue });
  const rawtransaction = bytesToHex(commit.unsignedTx);

  const original = Transaction.fromRaw(hexToBytes(fixture.result.reveal_rawtransaction), options);
  change.editReveal?.(original);
  const reveal = new Transaction({ version: original.version, lockTime: original.lockTime, ...options });
  const input = original.getInput(0);
  reveal.addInput({ txid: hexToBytes(commit.id), index: 0, sequence: input.sequence });
  for (let i = 0; i < original.outputsLength; i += 1) {
    const output = original.getOutput(i);
    reveal.addOutput({ script: output.script!, amount: output.amount! });
  }
  return {
    ...fixture.result,
    rawtransaction,
    envelope_script: envelopeHex,
    reveal_rawtransaction: bytesToHex(reveal.unsignedTx),
    reveal_control_block: bytesToHex(TaprootControlBlock.encode(controlBlock)),
    reveal_pubkey: bytesToHex(envelopeKey),
    reveal_lock_scripts: [bytesToHex(payment.script)],
    reveal_inputs_values: [Number(commitValue)],
  };
}

/**
 * `recompose115` with the envelope's message rewritten by `tamper` (same length), still closed by
 * the fixture's key: a self-consistent tampered compose that only a check of what the message says
 * can refuse.
 */
export function tamperedMessage115(fixture: Fixture115, tamper: (messageHex: string) => string): Compose115Result {
  const message = fixture.result.data.slice(16);
  const tampered = tamper(message);
  if (tampered.length !== message.length) throw new Error('tamper must keep the length');
  let envelope = fixture.result.envelope_script;
  for (let offset = 0; offset < message.length; offset += 1040) {
    envelope = envelope.replace(message.slice(offset, offset + 1040), tampered.slice(offset, offset + 1040));
  }
  return { ...recompose115(fixture, { envelope }), data: fixture.result.data.slice(0, 16) + tampered };
}

/** The envelope of `fixture` closed by another key instead of the source's. */
export function envelopeClosedBy(fixture: Fixture115, xOnlyKey: Uint8Array): string {
  return fixture.result.envelope_script.slice(0, -66) + bytesToHex(xOnlyKey) + 'ac';
}
