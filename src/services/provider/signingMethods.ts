/**
 * Signing methods: xcp_signMessage, xcp_signTransaction, xcp_signPsbt, xcp_signBitcoinPsbt and
 * xcp_signPsbts. Each validates what the site sent, checks the grant and the signer scope, and
 * hands the request to its approval flow.
 */

import { type AddressFormat, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseBitcoinPaymentIntent } from '@/core/bitcoin/providerPayment';
import {
  checkSignInputOwners,
  hasAuthenticatedFunding,
  hasExcessSighashEntries,
  missingSighashEntries,
  psbtHeaderProblem,
  psbtSigningRequestShape,
  usesSingleWithoutOutput,
} from '@/core/bitcoin/providerPsbtIntake';
import { signerScope, walletSupportsPair } from '@/core/bitcoin/providerSignerScope';
import { resolveProviderSignInputs } from '@/core/bitcoin/providerSigningPlan';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { CONNECTION_PROOF_PREFIX } from '@/core/connectionProof';
import { parseMarketplaceBatchIntents } from '@/core/counterparty/marketplaceBatch';
import { parseAcceptanceCpfpBundleIntents } from '@/core/counterparty/marketplaceBundle';
import { parseMarketplaceIntent } from '@/core/counterparty/marketplaceIntent';
import { MAX_POLICY_ALTERNATIVES } from '@/core/counterparty/policyOffer';
import { MAX_REVEAL_HEX_LENGTH } from '@/core/counterparty/providerReveal';
import {
  assertProviderPsbtSigningRequest,
  providerPsbtSigningCapabilities,
  unsupportedMarketplaceActionReason,
} from '@/core/providerCapabilities';
import { JSON_RPC_ERROR_CODES, PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { beginSignFlow } from '@/platform/provider/signFlow';
import type { ConnectionService } from '@/services/connectionService';
import { asInvalidParams, invalidParams, walletLocked } from '@/services/provider/requestErrors';
import type { ProviderMethodContext } from '@/services/provider/requestIntake';
import { runSignFlow } from '@/services/provider/signApproval';
import type { WalletService } from '@/services/walletService';
import type { PairedAddresses } from '@/types/wallet';

/**
 * Parse a site's PSBT. The parser's own errors carry library internals, so any failure is reported
 * with one fixed message instead.
 */
function parseSitePsbt(psbtHex: string, prefix = ''): ReturnType<typeof extractPsbtDetails> {
  try {
    return extractPsbtDetails(psbtHex);
  } catch {
    throw invalidParams(`${prefix}PSBT could not be parsed`);
  }
}

/** The active address's Legacy/SegWit pair, loaded only for a wallet that can derive one. */
async function loadPairedAddresses(
  walletService: Pick<WalletService, 'getPairedAddresses'>,
  wallet: { type: string; addressFormat: AddressFormat },
): Promise<PairedAddresses | null> {
  return walletSupportsPair(wallet) ? await walletService.getPairedAddresses() : null;
}

/** Refuse (4100) a request that signs with a paired sibling the site was never granted. */
async function assertPairedAddressGrant(
  connectionService: Pick<ConnectionService, 'hasPairedAddressPermission'>,
  origin: string,
  identity: { walletId: string; address: string },
): Promise<void> {
  if (!await connectionService.hasPairedAddressPermission(origin, identity.walletId, identity.address)) {
    throw new ProviderError(
      PROVIDER_ERROR_CODES.UNAUTHORIZED,
      'Paired Legacy/SegWit address access has not been granted',
    );
  }
}

/** xcp_signMessage: sign a message with the active address or, with the grant, its paired sibling. */
export async function signMessage(
  { origin, method, params, walletService, connectionService }: ProviderMethodContext,
): Promise<unknown> {
  const message = params?.[0];
  const address = params?.[1];

  // Validate message type and presence
  if (!message) {
    throw invalidParams('Message is required');
  }
  if (typeof message !== 'string') {
    throw invalidParams('Message must be a string');
  }
  if (message.startsWith(CONNECTION_PROOF_PREFIX)) {
    throw invalidParams('Messages in the connection-proof namespace are reserved');
  }

  // Validate address type if provided
  if (address !== undefined && typeof address !== 'string') {
    throw invalidParams('Address must be a string');
  }

  // Check if connected
  if (!await connectionService.hasPermission(origin)) {
    throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
  }

  // Get active address/wallet for the request
  const activeAddress = await walletService.getActiveAddress();
  const activeWallet = await walletService.getActiveWallet();
  if (!activeAddress || !activeWallet) {
    throw walletLocked();
  }

  let signingAddress = activeAddress.address;
  if (
    address
    && normalizeAddressForComparison(address) !== normalizeAddressForComparison(activeAddress.address)
  ) {
    const paired = await loadPairedAddresses(walletService, activeWallet);
    const target = signerScope(activeAddress.address, paired).findPairedTarget(address);
    if (!target) {
      throw invalidParams('Specified address is not the active address or its paired sibling');
    }
    await assertPairedAddressGrant(
      connectionService, origin, { walletId: activeWallet.id, address: activeAddress.address });
    signingAddress = target.address;
  }

  return await runSignFlow({
    origin,
    method,
    params: { message, signingAddress },
    identity: { walletId: activeWallet.id, address: activeAddress.address },
    pairedAddresses: signingAddress !== activeAddress.address,
    approval: {
      eventPrefix: 'sign-message',
      analyticsEvent: 'message_signed',
      cancelMessage: 'User cancelled sign message request',
      timeoutMessage: 'Sign message request timeout',
      mapResult: (result) => result.signature,
    },
    create: async (requestId, requestKey) => {
      // Binds the request to the authorized address/wallet so signing
      // can't later use a different identity.
      await beginSignFlow({
        id: requestId,
        origin,
        requestKey,
        kind: 'sign-message',
        message,
        address: activeAddress.address,
        signingAddress,
        walletId: activeWallet.id,
        timestamp: Date.now(),
      });
    },
    approvalRoute: '#/requests/message/approve',
  });
}

/** xcp_signTransaction: sign a raw transaction with the active address. */
export async function signTransaction(
  { origin, method, params, walletService, connectionService }: ProviderMethodContext,
): Promise<unknown> {
  const txParams = params?.[0] as { hex?: string } | string | undefined;

  // Support both { hex: "..." } object and plain string
  const rawTxHex = typeof txParams === 'string' ? txParams : txParams?.hex;

  if (!rawTxHex) {
    throw invalidParams('Transaction hex is required');
  }
  // Checked here, before the grant, the sign-popup limiter and the flow, as the other
  // signing methods check their params: a mistyped hex is the site's error to hear as such.
  if (typeof rawTxHex !== 'string') {
    throw invalidParams('Transaction hex must be a string');
  }

  // Check if connected
  if (!await connectionService.hasPermission(origin)) {
    throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
  }

  // Get active address/wallet for the request
  const activeAddress = await walletService.getActiveAddress();
  const activeWallet = await walletService.getActiveWallet();
  if (!activeAddress || !activeWallet) {
    throw walletLocked();
  }

  return await runSignFlow({
    origin,
    method,
    params: { rawTxHex },
    identity: { walletId: activeWallet.id, address: activeAddress.address },
    approval: {
      eventPrefix: 'sign-tx',
      analyticsEvent: 'transaction_signed',
      cancelMessage: 'User cancelled transaction signing request',
      timeoutMessage: 'Transaction signing request timeout',
      mapResult: (result) => ({ hex: result.signedTxHex }),
    },
    create: async (requestId, requestKey) => {
      // Binds the request to the authorized address/wallet so signing
      // can't later use a different identity.
      await beginSignFlow({
        id: requestId,
        origin,
        requestKey,
        kind: 'sign-transaction',
        rawTxHex,
        address: activeAddress.address,
        walletId: activeWallet.id,
        timestamp: Date.now(),
      });
    },
    approvalRoute: '#/requests/transaction/approve',
  });
}

/** xcp_signPsbts: sign a linked bundle of marketplace PSBTs, reviewed together. */
export async function signPsbts(
  { origin, method, params, walletService, connectionService }: ProviderMethodContext,
): Promise<unknown> {
  const bundleParams = params?.[0];
  if (!bundleParams || typeof bundleParams !== 'object' || Array.isArray(bundleParams)) {
    throw invalidParams('PSBT bundle parameters must be an object with requests');
  }
  const requests = (bundleParams as { requests?: unknown }).requests;
  // Each phase kind bounds its own count below (maxMarketplaceBatchRequests): 8, or 100
  // alternatives of one policy-offer funding set.
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > MAX_POLICY_ALTERNATIVES) {
    throw invalidParams(`This wallet version supports 1..${MAX_POLICY_ALTERNATIVES} linked PSBT requests`);
  }
  const parsedRequests = requests.map((request, requestIndex) => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw invalidParams(`PSBT bundle request ${requestIndex} must be an object`);
    }
    const candidate = request as {
      hex?: unknown;
      signInputs?: unknown;
      sighashTypes?: unknown;
      intent?: unknown;
    };
    if (typeof candidate.hex !== 'string' || candidate.hex.length === 0) {
      throw invalidParams(`PSBT bundle request ${requestIndex} requires hex`);
    }
    if (
      !candidate.signInputs
      || typeof candidate.signInputs !== 'object'
      || Array.isArray(candidate.signInputs)
      || Object.keys(candidate.signInputs).length === 0
    ) {
      throw invalidParams(`PSBT bundle request ${requestIndex} requires explicit signInputs`);
    }
    // DEFAULT (0x00) is the Taproot form of ALL, which a policy offer's P2TR bidder signs
    // with. Each family's proof still names the exact sighash it admits per input.
    if (
      !Array.isArray(candidate.sighashTypes)
      || candidate.sighashTypes.some(value => ![0x00, 0x01, 0x83].includes(value as number))
    ) {
      throw invalidParams(
        `PSBT bundle request ${requestIndex} supports only DEFAULT, ALL, or SINGLE|ANYONECANPAY`,
      );
    }
    return {
      psbtHex: candidate.hex,
      signInputs: candidate.signInputs as Record<string, number[]>,
      sighashTypes: candidate.sighashTypes as number[],
      intent: candidate.intent,
    };
  });
  const firstIntent = parsedRequests[0]!.intent;
  const exactCpfp = requests.length === 2
    && firstIntent !== null
    && typeof firstIntent === 'object'
    && !Array.isArray(firstIntent)
    && (firstIntent as { action?: unknown }).action === 'accept_exact_offer';
  // The intents are the site's claims; a malformed one, or a bundle over its phase's limit, is
  // the site's error (-32602) with the parser's reason.
  const parsedBundle = asInvalidParams(() => exactCpfp
    ? (() => {
        const pair = parseAcceptanceCpfpBundleIntents(
          parsedRequests[0]!.intent,
          parsedRequests[1]!.intent,
        );
        return {
          kind: 'acceptance-cpfp' as const,
          intents: [pair.parent, pair.child],
        };
      })()
    : parseMarketplaceBatchIntents(parsedRequests.map(request => request.intent)));

  if (!await connectionService.hasPermission(origin)) {
    throw new ProviderError(
      PROVIDER_ERROR_CODES.UNAUTHORIZED,
      'Unauthorized - not connected to wallet',
    );
  }
  const activeAddress = await walletService.getActiveAddress();
  const activeWallet = await walletService.getActiveWallet();
  if (!activeAddress || !activeWallet) throw walletLocked();

  const scope = signerScope(
    activeAddress.address, await loadPairedAddresses(walletService, activeWallet));
  const signing = providerPsbtSigningCapabilities(activeWallet).psbtBatch;
  for (const bundleIntent of parsedBundle.intents) {
    const unsupported = unsupportedMarketplaceActionReason(signing, bundleIntent.action);
    if (unsupported) throw invalidParams(unsupported);
  }
  let usesPairedAddress = false;

  for (const [requestIndex, request] of parsedRequests.entries()) {
    const details = parseSitePsbt(request.psbtHex, `PSBT bundle request ${requestIndex}: `);
    const marketplaceIntent = parsedBundle.intents[requestIndex]!;
    const headerProblem = psbtHeaderProblem(marketplaceIntent, details);
    if (headerProblem) {
      throw invalidParams(`PSBT bundle request ${requestIndex}: ${headerProblem}`);
    }
    if (!hasAuthenticatedFunding(details, {
      nullBuyerPlaceholder: marketplaceIntent.action === 'create_listing',
    })) {
      throw invalidParams(
        `PSBT bundle request ${requestIndex} must be fully funded with authenticated prevouts`,
      );
    }
    if (hasExcessSighashEntries(request.sighashTypes, details)) {
      throw invalidParams(`PSBT bundle request ${requestIndex} has too many sighash entries`);
    }
    if (usesSingleWithoutOutput(request.sighashTypes, details)) {
      throw invalidParams(
        `PSBT bundle request ${requestIndex} uses SINGLE without a paired output`,
      );
    }
    const validation = checkSignInputOwners(request.signInputs, scope.allowed, details);
    if (!validation.valid) {
      throw invalidParams(`PSBT bundle request ${requestIndex}: ${validation.error}`);
    }
    const requestedInputIndices = Object.values(request.signInputs).flat();
    const missing = missingSighashEntries(requestedInputIndices, request.sighashTypes);
    if (missing.length > 0) {
      throw invalidParams(
        `PSBT bundle request ${requestIndex} is missing absolute sighash entries for inputs: ${missing.join(', ')}`,
      );
    }
    asInvalidParams(() => assertProviderPsbtSigningRequest(
      signing,
      psbtSigningRequestShape(details, requestedInputIndices, request.sighashTypes),
    ), `PSBT bundle request ${requestIndex}: `);
    usesPairedAddress ||= scope.usesPairedSigner(request.signInputs);
  }
  if (usesPairedAddress) {
    await assertPairedAddressGrant(
      connectionService, origin, { walletId: activeWallet.id, address: activeAddress.address });
  }

  return await runSignFlow({
    origin,
    method,
    params: { requests: parsedRequests, bundle: parsedBundle },
    identity: { walletId: activeWallet.id, address: activeAddress.address },
    pairedAddresses: usesPairedAddress,
    approval: {
      eventPrefix: 'sign-psbts',
      analyticsEvent: 'psbt_bundle_signed',
      cancelMessage: 'User cancelled PSBT bundle signing request',
      timeoutMessage: 'PSBT bundle signing request timeout',
      mapResult: result => ({ hexes: result.signedPsbtHexes }),
    },
    create: async (requestId, requestKey) => {
      await beginSignFlow({
        id: requestId,
        origin,
        requestKey,
        kind: 'sign-psbts',
        bundleKind: parsedBundle.kind,
        items: parsedRequests.map((request, index) => ({
          psbtHex: request.psbtHex,
          signInputs: request.signInputs,
          sighashTypes: request.sighashTypes,
          marketplaceIntent: parsedBundle.intents[index]!,
        })),
        address: activeAddress.address,
        walletId: activeWallet.id,
        timestamp: Date.now(),
      });
    },
    approvalRoute: '#/requests/psbts/approve',
  });
}

/** xcp_signPsbt and xcp_signBitcoinPsbt: sign one PSBT, as a Counterparty or a plain Bitcoin request. */
export async function signPsbt(
  { origin, method, params, walletService, connectionService }: ProviderMethodContext,
): Promise<unknown> {
  const isBitcoinPayment = method === 'xcp_signBitcoinPsbt';
  const psbtParams = params?.[0];

  // Validate params structure
  if (!psbtParams || typeof psbtParams !== 'object') {
    throw invalidParams('PSBT parameters must be an object with hex property');
  }

  const { hex: psbtHex, signInputs: requestedSignInputs, sighashTypes, inscription, reveal, intent } = psbtParams as {
    hex?: string;
    signInputs?: Record<string, number[]>;
    sighashTypes?: number[];
    inscription?: { revealScript?: string; tapInternalKey?: string };
    reveal?: unknown;
    intent?: unknown;
  };
  let signInputs = requestedSignInputs;

  if (!psbtHex) {
    throw invalidParams('PSBT hex is required');
  }
  if (typeof psbtHex !== 'string') {
    throw invalidParams('PSBT hex must be a string');
  }
  // The intent is the site's claim, checked here with the rest of the request's shape (every
  // signing method validates what it can without the wallet before the grant). A malformed
  // one is the site's error, -32602 with the parser's reason.
  const bitcoinPaymentIntent = isBitcoinPayment
    ? asInvalidParams(() => parseBitcoinPaymentIntent(intent))
    : undefined;
  const marketplaceIntent = !isBitcoinPayment && intent !== undefined
    ? asInvalidParams(() => parseMarketplaceIntent(intent))
    : undefined;
  // Its funding inputs must be proven confirmed once for the whole funding set, which only
  // the linked review does; a lone parent would also hide its sibling alternatives.
  if (marketplaceIntent?.action === 'fund_policy_offer') {
    throw invalidParams('fund_policy_offer must be requested through xcp_signPsbts');
  }
  if (isBitcoinPayment && inscription !== undefined) {
    throw invalidParams('Plain Bitcoin payment requests cannot carry inscription context');
  }
  // Shape-checked here, verified on the approval screen: the context is a claim the site
  // makes about what the commit funds, and every field of it gets recomputed there.
  if (inscription !== undefined && (
    inscription === null || typeof inscription !== 'object'
    || typeof inscription.revealScript !== 'string'
    || typeof inscription.tapInternalKey !== 'string'
    || !/^[0-9a-fA-F]+$/.test(inscription.revealScript)
    || !/^[0-9a-fA-F]{64}$/.test(inscription.tapInternalKey)
  )) {
    throw invalidParams('inscription must carry revealScript and tapInternalKey as hex strings');
  }
  // A Counterparty Taproot commit's reveal. Its message is what signing the commit really
  // authorizes, so it is a Counterparty request, never a plain Bitcoin payment. Shape
  // only here; the review proves the commit output commits to exactly its script. These
  // are the caller's mistakes, so they go back as -32602 with the reason, not masked.
  if (reveal !== undefined) {
    if (isBitcoinPayment) {
      throw new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, 'A Counterparty reveal makes this a Counterparty transaction; request it with xcp_signPsbt');
    }
    if (inscription !== undefined) {
      throw new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, 'Pass either inscription or reveal, not both');
    }
    if (typeof reveal !== 'string' || reveal.length === 0 || reveal.length % 2 !== 0
      || reveal.length > MAX_REVEAL_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(reveal)) {
      throw new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, 'reveal must be the signed reveal transaction as a hex string');
    }
  }
  if (signInputs !== undefined && (
    signInputs === null || typeof signInputs !== 'object' || Array.isArray(signInputs)
  )) {
    throw invalidParams('signInputs must be an address-to-input-indices object');
  }
  if (isBitcoinPayment && (!signInputs || Object.keys(signInputs).length === 0)) {
    throw invalidParams('Plain Bitcoin payment requests require explicit signInputs');
  }
  if (sighashTypes !== undefined) {
    if (!Array.isArray(sighashTypes) || sighashTypes.some(
      value => !(isBitcoinPayment ? [0x01] : [0x00, 0x01, 0x81, 0x83]).includes(value)
    )) {
      throw invalidParams(isBitcoinPayment
        ? 'Plain Bitcoin payment requests support only SIGHASH_ALL'
        : 'Only SIGHASH_ALL, ALL|ANYONECANPAY, and SINGLE|ANYONECANPAY are supported');
    }
  }
  if (isBitcoinPayment && sighashTypes === undefined) {
    throw invalidParams('Plain Bitcoin payment requests require explicit SIGHASH_ALL entries');
  }

  // Check if connected
  if (!await connectionService.hasPermission(origin)) {
    throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
  }

  // Get active address/wallet for the request
  const activeAddress = await walletService.getActiveAddress();
  const activeWallet = await walletService.getActiveWallet();
  if (!activeAddress || !activeWallet) {
    throw walletLocked();
  }

  const psbtDetails = parseSitePsbt(psbtHex);
  // The explicit entries are checked against the PSBT first, so these reasons are the ones a
  // site hears; resolveProviderSignInputs below also covers sighashes embedded in the PSBT.
  if (sighashTypes && hasExcessSighashEntries(sighashTypes, psbtDetails)) {
    throw invalidParams('sighashTypes contains more entries than the PSBT has inputs');
  }
  if (sighashTypes && usesSingleWithoutOutput(sighashTypes, psbtDetails)) {
    throw invalidParams('SIGHASH_SINGLE requires an output at the same index');
  }
  if (activeWallet.type === 'hardware' && signInputs === undefined) {
    throw invalidParams('The active wallet requires PSBT inputs to be selected explicitly');
  }
  signInputs = asInvalidParams(() =>
    resolveProviderSignInputs(psbtDetails, activeAddress.address, signInputs, sighashTypes));
  const requestedInputIndices = signInputs === undefined
    ? undefined
    : Object.values(signInputs).flat();
  const unsupportedAction = unsupportedMarketplaceActionReason(
    providerPsbtSigningCapabilities(activeWallet).psbt,
    marketplaceIntent?.action,
  );
  if (unsupportedAction) throw invalidParams(unsupportedAction);
  asInvalidParams(() => assertProviderPsbtSigningRequest(
    providerPsbtSigningCapabilities(activeWallet).psbt,
    psbtSigningRequestShape(psbtDetails, requestedInputIndices, sighashTypes),
  ));
  if (marketplaceIntent) {
    const headerProblem = psbtHeaderProblem(marketplaceIntent, psbtDetails);
    if (headerProblem) throw invalidParams(headerProblem);
  }
  if (isBitcoinPayment && !hasAuthenticatedFunding(psbtDetails)) {
    throw invalidParams(
      'Plain Bitcoin payment requests must be fully funded with authenticated prevout amounts before review'
    );
  }

  if (signInputs !== undefined) {
    const scope = signerScope(
      activeAddress.address, await loadPairedAddresses(walletService, activeWallet));
    const validation = checkSignInputOwners(signInputs, scope.allowed, psbtDetails);
    if (!validation.valid) throw invalidParams(validation.error ?? 'Invalid signInputs');
    if (scope.usesPairedSigner(signInputs)) {
      await assertPairedAddressGrant(
        connectionService, origin, { walletId: activeWallet.id, address: activeAddress.address });
    }
  }
  if (sighashTypes !== undefined) {
    const requestedInputIndices = signInputs === undefined
      ? Array.from({ length: psbtDetails.inputs.length }, (_, index) => index)
      : Object.values(signInputs).flat();
    const missingInputIndices = missingSighashEntries(requestedInputIndices, sighashTypes);
    if (missingInputIndices.length > 0) {
      throw invalidParams(
        `sighashTypes is indexed by absolute PSBT input index and is missing entries for inputs: ${missingInputIndices.join(', ')}`
      );
    }
  }
  return await runSignFlow({
    origin,
    method,
    params: { psbtHex, signInputs, sighashTypes, inscription, reveal, bitcoinPaymentIntent, marketplaceIntent },
    identity: { walletId: activeWallet.id, address: activeAddress.address },
    pairedAddresses: Object.keys(signInputs ?? {}).some(address => normalizeAddressForComparison(address) !== normalizeAddressForComparison(activeAddress.address)),
    approval: {
      eventPrefix: 'sign-psbt',
      analyticsEvent: 'psbt_signed',
      cancelMessage: 'User cancelled PSBT signing request',
      timeoutMessage: 'PSBT signing request timeout',
      mapResult: (result) => ({ hex: result.signedPsbtHex }),
    },
    create: async (requestId, requestKey) => {
      await beginSignFlow({
        id: requestId,
        origin,
        requestKey,
        kind: 'sign-psbt',
        psbtHex,
        signInputs,
        sighashTypes,
        signingPurpose: isBitcoinPayment ? 'bitcoin-payment' : 'counterparty',
        ...(bitcoinPaymentIntent ? { bitcoinPaymentIntent } : {}),
        ...(marketplaceIntent ? { marketplaceIntent } : {}),
        ...(inscription ? {
          inscription: {
            revealScript: inscription.revealScript!,
            tapInternalKey: inscription.tapInternalKey!,
          },
        } : {}),
        ...(typeof reveal === 'string' ? { reveal: reveal.toLowerCase() } : {}),
        address: activeAddress.address,
        walletId: activeWallet.id,
        timestamp: Date.now(),
      });
    },
    approvalRoute: '#/requests/psbt/approve',
  });
}
