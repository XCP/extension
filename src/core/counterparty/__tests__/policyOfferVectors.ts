/**
 * Cross-check vectors for funded_policy_offer_v1, generated from the marketplace's reference
 * implementation (XCP/marketplace, packages/market/src/policy-offer.ts and policy-offer-wallet.ts at
 * branch policy-offer-core 7edc632, through its tests/helpers/policy-offer.ts fixtures). The wallet
 * never imports that code; these vectors pin the wallet's own port to it byte for byte.
 *
 * Every reference request carries the complete claim as its `intent`; that repetition is stripped
 * here, and the tests put it back. The reference's own verifier accepted every vector as generated.
 */
export const POLICY_OFFER_VECTORS = {
  "generatedFrom": "marketplace policy-offer-core packages/market (policy-offer.ts, policy-offer-wallet.ts) via tests/helpers/policy-offer.ts",
  "keys": {
    "bidderWpkhPriv": "0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d",
    "bidderTrPriv": "0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e",
    "sellerTrPriv": "0707070707070707070707070707070707070707070707070707070707070707",
    "sellerWpkhPriv": "0808080808080808080808080808080808080808080808080808080808080808",
    "anchorScript": "51204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb",
    "deliveryTr": "bc1pdjy7gwgp596l6q4zly0p79sujmp47l4l6d9x74nknjgwwgn8g8ysq2zjrg",
    "deliveryLegacy": "1Q1pE5vPGEEMqRcVRMbtBK842Y6Pzo6nK9"
  },
  "fund": {
    "wpkh": {
      "kind": "wpkh",
      "now": 1800000000,
      "marketKey": "552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84",
      "otherMarketKey": "d793631af7aa0e709439dd47fc001acd0b0727670b6670ea528ac83cb0127f4a",
      "delivery": "bc1pdjy7gwgp596l6q4zly0p79sujmp47l4l6d9x74nknjgwwgn8g8ysq2zjrg",
      "claim": {
        "standard": "counterparty-marketplace",
        "version": 1,
        "action": "fund_policy_offer",
        "protocolVersion": "funded_policy_offer_v1",
        "operationId": "policy-offer:wpkh",
        "assets": [],
        "bidder": "bc1qfc4739hq7jx65max77mygag0m2fsll7me4e7e4",
        "internalKey": "2f1b310f4c065331bc0d79ba4661bb9822d67d7c4a1b0a1892e1fd0cd23aa68d",
        "marketKey": "552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84",
        "delivery": {
          "mode": "detached",
          "address": "bc1pdjy7gwgp596l6q4zly0p79sujmp47l4l6d9x74nknjgwwgn8g8ysq2zjrg"
        },
        "fundingInputs": [
          {
            "txid": "0000000100000001000000010000000100000001000000010000000100000001",
            "vout": 0,
            "valueSats": 150000
          }
        ],
        "anchor": {
          "txid": "0000000200000002000000020000000200000002000000020000000200000002",
          "vout": 3,
          "valueSats": 330,
          "scriptPubKey": "51204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb"
        },
        "alternatives": [
          {
            "expectedParentTxid": "c0d7f9f7f913dc6ef2960f0bbc15f7bb3493fd554a4cf55c8265bdb66c908088",
            "priceSats": 100000,
            "offerValueSats": 100000,
            "expiresAt": 1800604800,
            "policy": {
              "scope": "collection",
              "asset": null,
              "collection": "rare-pepe",
              "max_supply_units": null,
              "min_supply_units": null,
              "issued_year": null,
              "series": 3,
              "artist": null
            },
            "policyHash": "cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a02",
            "leafHex": "00631864696769726172652f706f6c6963792d6f666665722f763111a086010000000000800c536b00000000003e62633170646a7937677767703539366c3671347a6c793070373973756a6d7034376c346c3664397837346e6b6e6a677777676e386738797371327a6a726720cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a026820552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84ac",
            "offerScriptPubKey": "51205a9a391f5af3682963d394ea94cd472bc7fb381bf29258916b7a95d6c0d76290",
            "parentVsize": 253,
            "changeSats": 50000,
            "parentFeeSats": 0,
            "detachScriptHex": "6a475806911751d16ca45d911f14ead28ccba38596da2b78bd76707a342110b7cce4e140ef25e2e0ab42023a331ddcca4239d836772d28c055fbe343104a141f56f782d36af8bfe8bd"
          },
          {
            "expectedParentTxid": "6e8e04bb86b3e2a227f343d661070f6dd4798769a6dbd4100c6717e03ac0335d",
            "priceSats": 80000,
            "offerValueSats": 80000,
            "expiresAt": 1800604800,
            "policy": {
              "scope": "collection",
              "asset": null,
              "collection": "rare-pepe",
              "max_supply_units": null,
              "min_supply_units": null,
              "issued_year": null,
              "series": 3,
              "artist": null
            },
            "policyHash": "cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a02",
            "leafHex": "00631864696769726172652f706f6c6963792d6f666665722f7631118038010000000000800c536b00000000003e62633170646a7937677767703539366c3671347a6c793070373973756a6d7034376c346c3664397837346e6b6e6a677777676e386738797371327a6a726720cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a026820552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84ac",
            "offerScriptPubKey": "512084ac9ed01f83e3473e734faf5305e3298694212d7d3509f8a199207bbae24bda",
            "parentVsize": 253,
            "changeSats": 70000,
            "parentFeeSats": 0,
            "detachScriptHex": "6a4728d1f93139e2fc9f9fc031e04eb604ed9fb96752eb1bbe3c4847dc5e5e2b97423f9f45d0a71fd245c366b33d2dacb3007d4d68676902491883953f02675d2e029c1d22028106a3"
          },
          {
            "expectedParentTxid": "d180d2f958b3f6bb085cd4cc6990fe8304e28522d60272d21e2a2d2c1e4c6b06",
            "priceSats": 149900,
            "offerValueSats": 149900,
            "expiresAt": 1800604800,
            "policy": {
              "scope": "collection",
              "asset": null,
              "collection": "rare-pepe",
              "max_supply_units": null,
              "min_supply_units": null,
              "issued_year": null,
              "series": 3,
              "artist": null
            },
            "policyHash": "cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a02",
            "leafHex": "00631864696769726172652f706f6c6963792d6f666665722f7631118c49020000000000800c536b00000000003e62633170646a7937677767703539366c3671347a6c793070373973756a6d7034376c346c3664397837346e6b6e6a677777676e386738797371327a6a726720cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a026820552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84ac",
            "offerScriptPubKey": "512059885654f3fe368eaa2c5b122a163e12c98c3b73fce3c05886b4e9a00cb12478",
            "parentVsize": 222,
            "changeSats": 0,
            "parentFeeSats": 100,
            "detachScriptHex": "6a472bfce296b924cf166f520b9386316d30d1550255c65fa2b36e0a17a655537c917fb6568466a09ad0588add8dae9600ab6123ecee2f81a2a27c7e4ab8cf15b86b7d27deedfff91e"
          }
        ],
        "marketplaceFee": {
          "payer": "seller",
          "bps": 250,
          "minSats": 1000
        }
      },
      "derived": [
        {
          "leafHash": "bb060ad451f4d7fc3864cd359e04535c895948f12109e906f2438ed5dfe1447f",
          "outputKey": "5a9a391f5af3682963d394ea94cd472bc7fb381bf29258916b7a95d6c0d76290",
          "parity": 1,
          "controlBlock": "c12f1b310f4c065331bc0d79ba4661bb9822d67d7c4a1b0a1892e1fd0cd23aa68d",
          "canonicalPolicyJson": "{\"v\":1,\"scope\":\"collection\",\"asset\":null,\"collection\":\"rare-pepe\",\"max_supply_units\":null,\"min_supply_units\":null,\"issued_year\":null,\"series\":3,\"artist\":null}",
          "detachScriptHex": "6a475806911751d16ca45d911f14ead28ccba38596da2b78bd76707a342110b7cce4e140ef25e2e0ab42023a331ddcca4239d836772d28c055fbe343104a141f56f782d36af8bfe8bd",
          "measuredVsize": 253
        },
        {
          "leafHash": "87846e563d1b53de31192c3c7a711ee436ba7a3ed6ff196b566727b5832171c4",
          "outputKey": "84ac9ed01f83e3473e734faf5305e3298694212d7d3509f8a199207bbae24bda",
          "parity": 1,
          "controlBlock": "c12f1b310f4c065331bc0d79ba4661bb9822d67d7c4a1b0a1892e1fd0cd23aa68d",
          "canonicalPolicyJson": "{\"v\":1,\"scope\":\"collection\",\"asset\":null,\"collection\":\"rare-pepe\",\"max_supply_units\":null,\"min_supply_units\":null,\"issued_year\":null,\"series\":3,\"artist\":null}",
          "detachScriptHex": "6a4728d1f93139e2fc9f9fc031e04eb604ed9fb96752eb1bbe3c4847dc5e5e2b97423f9f45d0a71fd245c366b33d2dacb3007d4d68676902491883953f02675d2e029c1d22028106a3",
          "measuredVsize": 253
        },
        {
          "leafHash": "11d2a944be3dc8504c37ff41bd3a9d2106020aa837d7e0954bdd167b40b07bb4",
          "outputKey": "59885654f3fe368eaa2c5b122a163e12c98c3b73fce3c05886b4e9a00cb12478",
          "parity": 1,
          "controlBlock": "c12f1b310f4c065331bc0d79ba4661bb9822d67d7c4a1b0a1892e1fd0cd23aa68d",
          "canonicalPolicyJson": "{\"v\":1,\"scope\":\"collection\",\"asset\":null,\"collection\":\"rare-pepe\",\"max_supply_units\":null,\"min_supply_units\":null,\"issued_year\":null,\"series\":3,\"artist\":null}",
          "detachScriptHex": "6a472bfce296b924cf166f520b9386316d30d1550255c65fa2b36e0a17a655537c917fb6568466a09ad0588add8dae9600ab6123ecee2f81a2a27c7e4ab8cf15b86b7d27deedfff91e",
          "measuredVsize": 222
        }
      ],
      "requests": [
        {
          "hex": "70736274ff0100d1030000000201000000010000000100000001000000010000000100000001000000010000000000000000fdffffff02000000020000000200000002000000020000000200000002000000020000000300000000fdffffff03a0860100000000002251205a9a391f5af3682963d394ea94cd472bc7fb381bf29258916b7a95d6c0d762904a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb50c30000000000001600144e2be896e0f48daa6fa6f7b644750fda930fffdb000000000001011ff0490200000000001600144e2be896e0f48daa6fa6f7b644750fda930fffdb010304010000000001012b4a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb00000000",
          "signInputs": {
            "bc1qfc4739hq7jx65max77mygag0m2fsll7me4e7e4": [
              0
            ]
          },
          "sighashTypes": [
            1,
            0
          ]
        },
        {
          "hex": "70736274ff0100d1030000000201000000010000000100000001000000010000000100000001000000010000000000000000fdffffff02000000020000000200000002000000020000000200000002000000020000000300000000fdffffff03803801000000000022512084ac9ed01f83e3473e734faf5305e3298694212d7d3509f8a199207bbae24bda4a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb70110100000000001600144e2be896e0f48daa6fa6f7b644750fda930fffdb000000000001011ff0490200000000001600144e2be896e0f48daa6fa6f7b644750fda930fffdb010304010000000001012b4a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb00000000",
          "signInputs": {
            "bc1qfc4739hq7jx65max77mygag0m2fsll7me4e7e4": [
              0
            ]
          },
          "sighashTypes": [
            1,
            0
          ]
        },
        {
          "hex": "70736274ff0100b2030000000201000000010000000100000001000000010000000100000001000000010000000000000000fdffffff02000000020000000200000002000000020000000200000002000000020000000300000000fdffffff028c4902000000000022512059885654f3fe368eaa2c5b122a163e12c98c3b73fce3c05886b4e9a00cb124784a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb000000000001011ff0490200000000001600144e2be896e0f48daa6fa6f7b644750fda930fffdb010304010000000001012b4a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb000000",
          "signInputs": {
            "bc1qfc4739hq7jx65max77mygag0m2fsll7me4e7e4": [
              0
            ]
          },
          "sighashTypes": [
            1,
            0
          ]
        }
      ]
    },
    "tr": {
      "kind": "tr",
      "now": 1800000000,
      "marketKey": "552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84",
      "otherMarketKey": "d793631af7aa0e709439dd47fc001acd0b0727670b6670ea528ac83cb0127f4a",
      "delivery": "bc1pdjy7gwgp596l6q4zly0p79sujmp47l4l6d9x74nknjgwwgn8g8ysq2zjrg",
      "claim": {
        "standard": "counterparty-marketplace",
        "version": 1,
        "action": "fund_policy_offer",
        "protocolVersion": "funded_policy_offer_v1",
        "operationId": "policy-offer:tr",
        "assets": [],
        "bidder": "bc1p309tr5lqkkca688cet7xyewgur4g0zvsmf4cjcng9qaqvpandjpsweujtx",
        "internalKey": "99c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc9",
        "marketKey": "552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84",
        "delivery": {
          "mode": "detached",
          "address": "bc1pdjy7gwgp596l6q4zly0p79sujmp47l4l6d9x74nknjgwwgn8g8ysq2zjrg"
        },
        "fundingInputs": [
          {
            "txid": "0000000300000003000000030000000300000003000000030000000300000003",
            "vout": 0,
            "valueSats": 70000
          },
          {
            "txid": "0000000400000004000000040000000400000004000000040000000400000004",
            "vout": 1,
            "valueSats": 80000
          }
        ],
        "anchor": {
          "txid": "0000000500000005000000050000000500000005000000050000000500000005",
          "vout": 3,
          "valueSats": 330,
          "scriptPubKey": "51204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb"
        },
        "alternatives": [
          {
            "expectedParentTxid": "1bc6019957b3a736ef2179db04440dff27e2ddd3bf2ec022d51cfcb2d376c4a5",
            "priceSats": 100000,
            "offerValueSats": 100000,
            "expiresAt": 1800604800,
            "policy": {
              "scope": "asset",
              "asset": "RAREPEPE",
              "collection": null,
              "max_supply_units": null,
              "min_supply_units": null,
              "issued_year": null,
              "series": null,
              "artist": null
            },
            "policyHash": "d9ca9868df868e68bffaa1c5bab4ad26943adbab190f81066baa6545c45aa27d",
            "leafHex": "00631864696769726172652f706f6c6963792d6f666665722f763111a086010000000000800c536b00000000003e62633170646a7937677767703539366c3671347a6c793070373973756a6d7034376c346c3664397837346e6b6e6a677777676e386738797371327a6a726720d9ca9868df868e68bffaa1c5bab4ad26943adbab190f81066baa6545c45aa27d6820552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84ac",
            "offerScriptPubKey": "51208360eb9bdec9736a6da5a7ca3649c7de741a6470880aad341f43dea0a1bdece4",
            "parentVsize": 313,
            "changeSats": 50000,
            "parentFeeSats": 0,
            "detachScriptHex": "6a47437a85762cb010c8a15b6598249408d15362b033d27ef192842e28ac082c232978da2f097bc03c0b21527bdd008fbcaf4b1fb71ee6f50545aa657adf8a186e84d16218d22fd958"
          },
          {
            "expectedParentTxid": "9bd411a8ed7f6a485e1b3fe9f7dba9b25d74321ae162989274ec8ab64605f440",
            "priceSats": 149800,
            "offerValueSats": 149800,
            "expiresAt": 1800604800,
            "policy": {
              "scope": "asset",
              "asset": "RAREPEPE",
              "collection": null,
              "max_supply_units": null,
              "min_supply_units": null,
              "issued_year": null,
              "series": null,
              "artist": null
            },
            "policyHash": "d9ca9868df868e68bffaa1c5bab4ad26943adbab190f81066baa6545c45aa27d",
            "leafHex": "00631864696769726172652f706f6c6963792d6f666665722f7631112849020000000000800c536b00000000003e62633170646a7937677767703539366c3671347a6c793070373973756a6d7034376c346c3664397837346e6b6e6a677777676e386738797371327a6a726720d9ca9868df868e68bffaa1c5bab4ad26943adbab190f81066baa6545c45aa27d6820552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84ac",
            "offerScriptPubKey": "5120a64773ae0dbd6c81721f7c4845a871c9bcae609fe5768ab576a48f2651201ad1",
            "parentVsize": 270,
            "changeSats": 0,
            "parentFeeSats": 200,
            "detachScriptHex": "6a47d8f49a16724675129be98d6b454685cbb3232228a0d20ba22324ee4f616add250f14f0df7c839f3cc27d3fb792e73ea35ed735164ef4c3d55d72ffe1af1eb712a04330c0dc8ef2"
          }
        ],
        "marketplaceFee": {
          "payer": "seller",
          "bps": 250,
          "minSats": 1000
        }
      },
      "derived": [
        {
          "leafHash": "78fe99ae9b72acdcd5a070fb385a72a46153ba6291aec83cb22caab7c02f755c",
          "outputKey": "8360eb9bdec9736a6da5a7ca3649c7de741a6470880aad341f43dea0a1bdece4",
          "parity": 0,
          "controlBlock": "c099c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc9",
          "canonicalPolicyJson": "{\"v\":1,\"scope\":\"asset\",\"asset\":\"RAREPEPE\",\"collection\":null,\"max_supply_units\":null,\"min_supply_units\":null,\"issued_year\":null,\"series\":null,\"artist\":null}",
          "detachScriptHex": "6a47437a85762cb010c8a15b6598249408d15362b033d27ef192842e28ac082c232978da2f097bc03c0b21527bdd008fbcaf4b1fb71ee6f50545aa657adf8a186e84d16218d22fd958",
          "measuredVsize": 313
        },
        {
          "leafHash": "352a0a4052aa862e0c626afe12dae8da89ab6567f1497a982f5cbb98474ef903",
          "outputKey": "a64773ae0dbd6c81721f7c4845a871c9bcae609fe5768ab576a48f2651201ad1",
          "parity": 0,
          "controlBlock": "c099c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc9",
          "canonicalPolicyJson": "{\"v\":1,\"scope\":\"asset\",\"asset\":\"RAREPEPE\",\"collection\":null,\"max_supply_units\":null,\"min_supply_units\":null,\"issued_year\":null,\"series\":null,\"artist\":null}",
          "detachScriptHex": "6a47d8f49a16724675129be98d6b454685cbb3232228a0d20ba22324ee4f616add250f14f0df7c839f3cc27d3fb792e73ea35ed735164ef4c3d55d72ffe1af1eb712a04330c0dc8ef2",
          "measuredVsize": 270
        }
      ],
      "requests": [
        {
          "hex": "70736274ff0100fd0601030000000303000000030000000300000003000000030000000300000003000000030000000000000000fdffffff04000000040000000400000004000000040000000400000004000000040000000100000000fdffffff05000000050000000500000005000000050000000500000005000000050000000300000000fdffffff03a0860100000000002251208360eb9bdec9736a6da5a7ca3649c7de741a6470880aad341f43dea0a1bdece44a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb50c30000000000002251208bcab1d3e0b5b1dd1cf8cafc6265c8e0ea878990da6b896268283a0607b36c83000000000001012b70110100000000002251208bcab1d3e0b5b1dd1cf8cafc6265c8e0ea878990da6b896268283a0607b36c8301172099c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc90001012b80380100000000002251208bcab1d3e0b5b1dd1cf8cafc6265c8e0ea878990da6b896268283a0607b36c8301172099c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc90001012b4a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb00000000",
          "signInputs": {
            "bc1p309tr5lqkkca688cet7xyewgur4g0zvsmf4cjcng9qaqvpandjpsweujtx": [
              0,
              1
            ]
          },
          "sighashTypes": [
            0,
            0,
            0
          ]
        },
        {
          "hex": "70736274ff0100db030000000303000000030000000300000003000000030000000300000003000000030000000000000000fdffffff04000000040000000400000004000000040000000400000004000000040000000100000000fdffffff05000000050000000500000005000000050000000500000005000000050000000300000000fdffffff022849020000000000225120a64773ae0dbd6c81721f7c4845a871c9bcae609fe5768ab576a48f2651201ad14a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb000000000001012b70110100000000002251208bcab1d3e0b5b1dd1cf8cafc6265c8e0ea878990da6b896268283a0607b36c8301172099c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc90001012b80380100000000002251208bcab1d3e0b5b1dd1cf8cafc6265c8e0ea878990da6b896268283a0607b36c8301172099c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc90001012b4a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb000000",
          "signInputs": {
            "bc1p309tr5lqkkca688cet7xyewgur4g0zvsmf4cjcng9qaqvpandjpsweujtx": [
              0,
              1
            ]
          },
          "sighashTypes": [
            0,
            0,
            0
          ]
        }
      ]
    },
    "legacyDelivery": {
      "kind": "wpkh",
      "now": 1800000000,
      "marketKey": "552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84",
      "otherMarketKey": "d793631af7aa0e709439dd47fc001acd0b0727670b6670ea528ac83cb0127f4a",
      "delivery": "1Q1pE5vPGEEMqRcVRMbtBK842Y6Pzo6nK9",
      "claim": {
        "standard": "counterparty-marketplace",
        "version": 1,
        "action": "fund_policy_offer",
        "protocolVersion": "funded_policy_offer_v1",
        "operationId": "policy-offer:wpkh",
        "assets": [],
        "bidder": "bc1qfc4739hq7jx65max77mygag0m2fsll7me4e7e4",
        "internalKey": "2f1b310f4c065331bc0d79ba4661bb9822d67d7c4a1b0a1892e1fd0cd23aa68d",
        "marketKey": "552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84",
        "delivery": {
          "mode": "detached",
          "address": "1Q1pE5vPGEEMqRcVRMbtBK842Y6Pzo6nK9"
        },
        "fundingInputs": [
          {
            "txid": "0000000600000006000000060000000600000006000000060000000600000006",
            "vout": 0,
            "valueSats": 150000
          }
        ],
        "anchor": {
          "txid": "0000000700000007000000070000000700000007000000070000000700000007",
          "vout": 3,
          "valueSats": 330,
          "scriptPubKey": "51204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb"
        },
        "alternatives": [
          {
            "expectedParentTxid": "8de1585baff2d2456f8cccbc17ef24294eba4d876afa718c86861494071423dc",
            "priceSats": 50000,
            "offerValueSats": 50000,
            "expiresAt": 1800604800,
            "policy": {
              "scope": "collection",
              "asset": null,
              "collection": "rare-pepe",
              "max_supply_units": null,
              "min_supply_units": null,
              "issued_year": null,
              "series": 3,
              "artist": null
            },
            "policyHash": "cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a02",
            "leafHex": "00631864696769726172652f706f6c6963792d6f666665722f76311150c3000000000000800c536b00000000002231513170453576504745454d71526356524d6274424b3834325936507a6f366e4b3920cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a026820552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84ac",
            "offerScriptPubKey": "5120b1d7a63948de0ed4997916225b2715613d1812f65f18855358cf923ac2422667",
            "parentVsize": 253,
            "changeSats": 100000,
            "parentFeeSats": 0,
            "detachScriptHex": "6a2bc30c384af20554ba49286be0ee86a414a0e6b7a5bd7a52c9e479222da3367fa11e7c2a949c70dbd962fc5f"
          }
        ],
        "marketplaceFee": {
          "payer": "seller",
          "bps": 250,
          "minSats": 1000
        }
      },
      "derived": [
        {
          "leafHash": "4efde4311b218accb24658d1b423716ee0d0dc0ad2fd56068a82040b17e3fab0",
          "outputKey": "b1d7a63948de0ed4997916225b2715613d1812f65f18855358cf923ac2422667",
          "parity": 0,
          "controlBlock": "c02f1b310f4c065331bc0d79ba4661bb9822d67d7c4a1b0a1892e1fd0cd23aa68d",
          "canonicalPolicyJson": "{\"v\":1,\"scope\":\"collection\",\"asset\":null,\"collection\":\"rare-pepe\",\"max_supply_units\":null,\"min_supply_units\":null,\"issued_year\":null,\"series\":3,\"artist\":null}",
          "detachScriptHex": "6a2bc30c384af20554ba49286be0ee86a414a0e6b7a5bd7a52c9e479222da3367fa11e7c2a949c70dbd962fc5f",
          "measuredVsize": 253
        }
      ],
      "requests": [
        {
          "hex": "70736274ff0100d1030000000206000000060000000600000006000000060000000600000006000000060000000000000000fdffffff07000000070000000700000007000000070000000700000007000000070000000300000000fdffffff0350c3000000000000225120b1d7a63948de0ed4997916225b2715613d1812f65f18855358cf923ac24226674a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbba0860100000000001600144e2be896e0f48daa6fa6f7b644750fda930fffdb000000000001011ff0490200000000001600144e2be896e0f48daa6fa6f7b644750fda930fffdb010304010000000001012b4a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb00000000",
          "signInputs": {
            "bc1qfc4739hq7jx65max77mygag0m2fsll7me4e7e4": [
              0
            ]
          },
          "sighashTypes": [
            1,
            0
          ]
        }
      ]
    }
  },
  "accept": {
    "trSeller": {
      "bidderKind": "wpkh",
      "sellerKind": "tr",
      "seller": "bc1pw53jtgez0wf69n06fchp0ctk48620zdscnrj8heh86wykp9mv20qya3c8w",
      "claim": {
        "standard": "counterparty-marketplace",
        "version": 1,
        "action": "accept_policy_offer",
        "protocolVersion": "funded_policy_offer_v1",
        "operationId": "policy-accept:tr",
        "assets": [
          {
            "asset": "RAREPEPE",
            "quantityRaw": "1",
            "sourceOutpoint": {
              "txid": "0000000a0000000a0000000a0000000a0000000a0000000a0000000a0000000a",
              "vout": 0
            }
          }
        ],
        "offerOutpoint": {
          "parentTxid": "e4aa3e0bf455737bc1ef4fe5b089a74219f7dd5bb3ef483e36058b7024c3f2af",
          "vout": 0
        },
        "offerValueSats": 100000,
        "priceSats": 100000,
        "parentRawHex": "030000000208000000080000000800000008000000080000000800000008000000080000000000000000fdffffff09000000090000000900000009000000090000000900000009000000090000000300000000fdffffff03a0860100000000002251205a9a391f5af3682963d394ea94cd472bc7fb381bf29258916b7a95d6c0d762904a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb50c30000000000001600144e2be896e0f48daa6fa6f7b644750fda930fffdb00000000",
        "parentInputValuesSats": [
          150000,
          330
        ],
        "parentVsize": 253,
        "parentFeeSats": 0,
        "leafHex": "00631864696769726172652f706f6c6963792d6f666665722f763111a086010000000000800c536b00000000003e62633170646a7937677767703539366c3671347a6c793070373973756a6d7034376c346c3664397837346e6b6e6a677777676e386738797371327a6a726720cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a026820552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84ac",
        "internalKey": "2f1b310f4c065331bc0d79ba4661bb9822d67d7c4a1b0a1892e1fd0cd23aa68d",
        "seller": "bc1pw53jtgez0wf69n06fchp0ctk48620zdscnrj8heh86wykp9mv20qya3c8w",
        "utxoValueSats": 330,
        "delivery": {
          "mode": "detached",
          "address": "bc1pdjy7gwgp596l6q4zly0p79sujmp47l4l6d9x74nknjgwwgn8g8ysq2zjrg"
        },
        "platformFeeSats": 2500,
        "networkFeeSats": 1800,
        "packageVsize": 600,
        "packageFeeRate": 3,
        "sellerProceedsSats": 96030,
        "expectedTxid": "179f1cc65a76874b78690e973cdb2c02eefc21a8273750fc87854ef8680ebe69"
      },
      "request": {
        "hex": "70736274ff0100fd04010300000002aff2c324708b05363e48efb35bddf71942a789b0e54fefc17b7355f40b3eaae40000000000fdffffff0a0000000a0000000a0000000a0000000a0000000a0000000a0000000a0000000000000000fdffffff030000000000000000496a472e629641d93ec16f131108810265e16036ba45c7c3854ad1c647551b729d8df41bf4ec3756af80ae2acb888be4776a88b3bd060fa770e76ddd3490b2592834d17b3c26fd7c74511e77010000000000225120752325a3227b93a2cdfa4e2e17e176a9f4a789b0c4c723df373e9c4b04bb629ec4090000000000002251208fbe472c23713a856b33848c7d9f5377d662f14965e193a697e966c456489f42000000000001012ba0860100000000002251205a9a391f5af3682963d394ea94cd472bc7fb381bf29258916b7a95d6c0d762900001012b4a01000000000000225120752325a3227b93a2cdfa4e2e17e176a9f4a789b0c4c723df373e9c4b04bb629e011720989c0b76cb563971fdc9bef31ec06c3560f3249d6ee9e5d83c57625596e05f6f00000000",
        "signInputs": {
          "bc1pw53jtgez0wf69n06fchp0ctk48620zdscnrj8heh86wykp9mv20qya3c8w": [
            1
          ]
        },
        "sighashTypes": [
          0,
          0
        ]
      },
      "feeScriptHex": "51208fbe472c23713a856b33848c7d9f5377d662f14965e193a697e966c456489f42",
      "detachScriptHex": "6a472e629641d93ec16f131108810265e16036ba45c7c3854ad1c647551b729d8df41bf4ec3756af80ae2acb888be4776a88b3bd060fa770e76ddd3490b2592834d17b3c26fd7c7451"
    },
    "wpkhSeller": {
      "bidderKind": "tr",
      "sellerKind": "wpkh",
      "seller": "bc1qrnl0x4c644dlzct5a8fej29drft3va5n8yh883",
      "claim": {
        "standard": "counterparty-marketplace",
        "version": 1,
        "action": "accept_policy_offer",
        "protocolVersion": "funded_policy_offer_v1",
        "operationId": "policy-accept:wpkh",
        "assets": [
          {
            "asset": "RAREPEPE",
            "quantityRaw": "1",
            "sourceOutpoint": {
              "txid": "0000000d0000000d0000000d0000000d0000000d0000000d0000000d0000000d",
              "vout": 0
            }
          }
        ],
        "offerOutpoint": {
          "parentTxid": "0a85bac45117df36a6d03546bf3a8cf5f35653901ec17658896d28f877c96774",
          "vout": 0
        },
        "offerValueSats": 100000,
        "priceSats": 100000,
        "parentRawHex": "03000000020b0000000b0000000b0000000b0000000b0000000b0000000b0000000b0000000000000000fdffffff0c0000000c0000000c0000000c0000000c0000000c0000000c0000000c0000000300000000fdffffff03a0860100000000002251205cea5133c44a0304f8d1d4c792c683816db73de3078b00445ce7aaf0a2ee78894a010000000000002251204f78821f08f119333f981396ec5941b9f67a05c5302ecb7031861a879bbb0fbb50c30000000000002251208bcab1d3e0b5b1dd1cf8cafc6265c8e0ea878990da6b896268283a0607b36c8300000000",
        "parentInputValuesSats": [
          150000,
          330
        ],
        "parentVsize": 255,
        "parentFeeSats": 0,
        "leafHex": "00631864696769726172652f706f6c6963792d6f666665722f763111a086010000000000800c536b00000000002231513170453576504745454d71526356524d6274424b3834325936507a6f366e4b3920cc7655c1a72965d102b92398612c02e7f1b3bc4b6076249f37f323fcac7a2a026820552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84ac",
        "internalKey": "99c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc9",
        "seller": "bc1qrnl0x4c644dlzct5a8fej29drft3va5n8yh883",
        "utxoValueSats": 546,
        "delivery": {
          "mode": "detached",
          "address": "1Q1pE5vPGEEMqRcVRMbtBK842Y6Pzo6nK9"
        },
        "platformFeeSats": 2500,
        "networkFeeSats": 1695,
        "packageVsize": 565,
        "packageFeeRate": 3,
        "sellerProceedsSats": 96351,
        "expectedTxid": "1c66dab60ea1487836bf7e00b4553eaff5f33308b59f4e6e4a33f0a5d4e9f4be"
      },
      "request": {
        "hex": "70736274ff0100dc03000000027467c977f8286d895876c11e905356f3f58c3abf4635d0a636df1751c4ba850a0000000000fdffffff0d0000000d0000000d0000000d0000000d0000000d0000000d0000000d0000000000000000fdffffff0300000000000000002d6a2b58b1af45862e329c5ec6dc1b0088aa966800832fca85a38abc5086009623a3ba81ce75aa278f6d0ab02ad35f780100000000001600141cfef3571aad5bf16174e9d39928ad1a57167693c4090000000000002251208fbe472c23713a856b33848c7d9f5377d662f14965e193a697e966c456489f42000000000001012ba0860100000000002251205cea5133c44a0304f8d1d4c792c683816db73de3078b00445ce7aaf0a2ee78890001011f22020000000000001600141cfef3571aad5bf16174e9d39928ad1a571676930103040100000000000000",
        "signInputs": {
          "bc1qrnl0x4c644dlzct5a8fej29drft3va5n8yh883": [
            1
          ]
        },
        "sighashTypes": [
          0,
          1
        ]
      },
      "feeScriptHex": "51208fbe472c23713a856b33848c7d9f5377d662f14965e193a697e966c456489f42",
      "detachScriptHex": "6a2b58b1af45862e329c5ec6dc1b0088aa966800832fca85a38abc5086009623a3ba81ce75aa278f6d0ab02ad3"
    }
  },
  "ordnet": {
    "childHex": "03000000000103cf42141b76d2d3985634e0251fc98632cff651c0edcd3b4d2e745b9a101f57b31400000000fdffffff762c42ce9f35f579e1f129aadc04d21357d23d9d182f436f6a091b05da5463100000000000fdffffffa3c020d8c2a2a3ff276e9935c232f8ff6d7f2674053699d86e368d73c363c99c040000000090000000044a0100000000000022512004e2f30acb31fe251809baab1748ccd16efc465effa99361c3301ac36788c3a6d9ba0400000000002251203e0b0bbbbd590f8bd26247fcfe8a0420fb60e5c0e7addc7619623f962237e37b401f00000000000022512045928e9cef3c749a5831d958c276bb7baece9ded6ee871f924fac41280eb79c74d01000000000000225120e35ae50b5603ee32557c47ad5f293ad272d6904d7f1c31eecf4bc7fb41a5fe7f0140c77c1b54a9a363140df172cbe1dfe8f52562ef536344f8e29b175aa61d2a8fe7e1c6fdce21a664bbfe4441668b75aaa5a1203ee88ae439203a1801fd997cfa6c074054cfa077dfd1a8c9e1cbe292a06149c92b7277460eb45ba8faffeaea7ad375fed2270fe73aa25cc79c050f9c6b34bc4feb461d335c232b9669c14ee865f613274030f2f7c0261fd5763139a9f468bba57db359256f584506aca7447f7df3c147589aa36ace4ef785ebc524ca19d5420360b128379a1427e0abb7769eec99e7609340a599a1c40bcb973239ca6784dc2055f53469e0388789fad583c18497457c4b988dd4a8e660465ffb6afe6f5bf8d8dd092d51a484e41c2be0b8bf6f4730694a180020235e27d2ac869ae7882177505c2afca3de42457d25ee3317b3da8935f19d0d2efd370100630f6f72646e65742d6f666665722f76320800e2040000000000088f9e896a0000000022512004e2f30acb31fe251809baab1748ccd16efc465effa99361c3301ac36788c3a620c88a234a761a0a53c1d4acb5595a477c6622453e5f620f21ec1ffcd819d5fb772023f8f474f9a8e660cbf08fac90c08ef9ecb8f39d05dc1c005fd6803fa98a66d668a8203c7ff36bef7cbb7cf4b6c173ef75ef74d09df2086f2712ca37e9c739d6947b198820f3555e171a897d725b64486ce80923186761dd917085351775cc16fe5d673cebac20d2dc3222298e2a5f4e1c7d702fae2bcf7821cc0a095a478b95c62195b0df7398ba519d208efe604eb9dfa01d33404656dafa2aefea83660f01fa04ae0686a6110957b86fad203e4cb29671c3b25fa0b23d902cd46102d1c158420e8e00daac552d23b013a7d7ac21c1f3555e171a897d725b64486ce80923186761dd917085351775cc16fe5d673ceb01407b97ab76956af27144cec9607682f8337e325137e66fb38bc816ecf2a64b4c0aba9644fe3625fbe70f55199dca467f2b1acb6bd912aa38a900422d612181d08d00000000"
  }
};
