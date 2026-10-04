import { bytesToHex } from '@noble/hashes/utils.js';
import { SigHash, TaprootControlBlock } from '@scure/btc-signer';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { coinLockTerms } from '@/core/bitcoin/coinLocks';
import { type ConsolidationResult, consolidateBareMultisigBatch } from '@/core/bitcoin/consolidateBatch';
import type { ConsolidationData } from '@/core/bitcoin/consolidationApi';
import { shownEnvelopeLeaf } from '@/core/bitcoin/envelopeLeafGuard';
import { signMessage } from '@/core/bitcoin/messageSigner';
import { signPSBT as btcSignPSBT, completePsbtWithInputValues, extractPsbtDetails, finalizePSBT, parsePSBT, resolvePsbtSighashType, validateSignInputs } from '@/core/bitcoin/psbt';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';
import { signTaprootReveal, type TaprootRevealToSign } from '@/core/bitcoin/taprootRevealSigner';
import { assertTransactionMatchesReviewed, parseTransactionForIntegrity } from '@/core/bitcoin/transactionIntegrity';
import { signTransaction as btcSignTransaction } from '@/core/bitcoin/transactionSigner';
import { envelopeLeafHash } from '@/core/counterparty/commitRevealBundle';
import { envelopeLeafKey } from '@/core/counterparty/revealSourceRule';
import { mapVerifiedInputPaths } from '@/core/hardware/inputPaths';
import { getPairedAddressFormats, mnemonicPrivateKeyAt } from '@/core/wallet/addressDeriver';
import { t } from '@/i18n';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { SigningIdentity } from '@/platform/auth/signingIdentity';
import { getTrustedBroadcastPrevout } from '@/platform/provider/recentBroadcasts';
import { assertTrezorSuiteAccess } from '@/platform/suiteAccess';
import { huntInBackground } from '@/platform/zeldHunt';
import type { CoinLock } from '@/types/coinLocks';
import type { HardwareWalletSecret, PairedAddresses, SignPsbtOptions, SignTransactionOptions, Wallet } from '@/types/wallet';

/**
 * The wallet state signing reads, and nothing else. WalletManager supplies it.
 *
 * Every member is read at the moment it is called and nothing is kept, so a lock, a wallet
 * switch or an address change between two awaits is seen by the next read. Key material comes
 * only from `getPrivateKey` and the session's unlocked secret, and only for the call that asked.
 */
export interface SigningWalletState {
  /** The active wallet's ID, or null when none is set. */
  activeWalletId(): string | null;
  getWalletById(id: string): Wallet | undefined;
  getActiveWallet(): Wallet | undefined;
  /** The saved active address; the active wallet's first address stands in when it is absent. */
  lastActiveAddress(): string | undefined;
  getPrivateKey(walletId: string, derivationPath?: string): Promise<{ wif: string; hex: string; compressed: boolean }>;
  getPairedAddresses(): Promise<PairedAddresses>;
  getCoinLocks(address: string): CoinLock[];
}

/**
 * Transaction, PSBT and message signing for the active wallet: software keys, Trezor, paired
 * Legacy/SegWit addresses, the ZELD hunt and bare-multisig consolidation batches.
 *
 * Every request is bound to the session and signing identity it started under
 * (`createSigningGuard`) and rechecks them after each await, before a key is used and before a
 * signature is returned. WalletManager's signing methods delegate here.
 */
export class WalletSigner {
  constructor(private readonly state: SigningWalletState) {}

  /**
   * Get an initialized Trezor adapter for a hardware wallet.
   *
   * Centralizes the common pattern of:
   * 1. Getting hardware wallet secret from session
   * 2. Validating it's a Trezor device
   * 3. Dynamically importing and initializing the adapter
   *
   * @param walletId - The hardware wallet ID
   * @returns Initialized Trezor adapter and DerivationPaths utility
   * @throws Error if wallet is not unlocked or not a Trezor
   */
  private async getInitializedTrezor(walletId: string): Promise<{
    trezor: import('@/core/hardware/trezorAdapter').TrezorAdapter;
    DerivationPaths: typeof import('@/core/hardware/types').DerivationPaths;
    hardwareData: HardwareWalletSecret;
  }> {
    const secret = await sessionManager.getUnlockedSecret(walletId);
    if (!secret) {
      throw new Error("Hardware wallet not unlocked");
    }

    const hardwareData: HardwareWalletSecret = JSON.parse(secret);

    if (hardwareData.deviceType !== 'trezor') {
      throw new Error(`Hardware wallet type '${hardwareData.deviceType}' is not yet supported`);
    }

    await assertTrezorSuiteAccess();
    // Dynamically import to avoid loading @trezor/connect-webextension at startup
    const { getTrezorAdapter } = await import('@/core/hardware/trezorAdapter');
    const { DerivationPaths } = await import('@/core/hardware/types');
    const trezor = getTrezorAdapter();

    await trezor.init();

    return { trezor, DerivationPaths, hardwareData };
  }

  /** Bind in-flight signing to the session and active identity captured before any awaited work. */
  private createSigningGuard(expectedIdentity?: SigningIdentity): () => void {
    const generation = sessionManager.getSessionGeneration();
    const wallet = this.state.getActiveWallet();
    const activeAddress = wallet?.addresses.find(
      address => address.address === this.state.lastActiveAddress()
    ) ?? wallet?.addresses[0];
    if (!wallet || !activeAddress) throw new Error('No active signing identity');
    const identity = { walletId: wallet.id, address: activeAddress.address };
    if (expectedIdentity && (
      expectedIdentity.walletId !== identity.walletId
      || normalizeAddressForComparison(expectedIdentity.address) !== normalizeAddressForComparison(identity.address)
    )) {
      throw new Error('The signing identity changed after this request was approved.');
    }
    const assertStillAuthorized = () => {
      sessionManager.assertSessionGeneration(generation);
      const currentWallet = this.state.getActiveWallet();
      const currentAddress = currentWallet?.addresses.find(
        address => address.address === this.state.lastActiveAddress()
      ) ?? currentWallet?.addresses[0];
      if (currentWallet?.id !== identity.walletId || currentAddress?.address !== identity.address) {
        throw new Error('The signing identity changed after this request was approved.');
      }
    };
    assertStillAuthorized();
    return assertStillAuthorized;
  }

  /** Recheck lock permissions whenever the signing session is checked. */
  private createCoinGuard(
    tx: ReturnType<typeof parseTransactionForIntegrity>,
    signInputs: Record<string, number[]>,
    approved: readonly CoinLock[] = [],
  ): () => void {
    const inputs = Object.entries(signInputs).map(([address, indices]) => ({
      address,
      outpoints: new Set(indices.filter(index => Number.isInteger(index) && index >= 0 && index < tx.inputsLength).map(index => {
        const input = tx.getInput(index);
        return `${bytesToHex(input.txid ?? new Uint8Array())}:${input.index}`;
      })),
    }));
    const allowed = new Set(approved.filter(lock => !lock.unlocked).map(coinLockTerms));
    return () => {
      for (const { address, outpoints } of inputs) {
        for (const lock of this.state.getCoinLocks(address)) {
          if (!lock.unlocked && outpoints.has(lock.outpoint) && !allowed.has(coinLockTerms(lock))) {
            throw new Error(t('coin_lock_signing_changed'));
          }
        }
      }
    };
  }

  private createRawSigningGuard(rawTxHex: string, address: string, expectedIdentity?: SigningIdentity, approved?: CoinLock[]): () => void {
    const identity = this.createSigningGuard(expectedIdentity);
    const tx = parseTransactionForIntegrity(rawTxHex);
    const addresses = new Set([address, ...(this.state.getActiveWallet()?.addresses.map(item => item.address) ?? [])]);
    const indices = Array.from({ length: tx.inputsLength }, (_, index) => index);
    const coins = this.createCoinGuard(tx, Object.fromEntries([...addresses].map(owner => [owner, indices])), approved);
    const guard = () => { identity(); coins(); };
    guard();
    return guard;
  }

  /** Sign the reviewed raw transaction; a hardware PSBT must describe those exact same bytes. */
  public async signTransaction(
    rawTxHex: string,
    sourceAddress: string,
    options?: SignTransactionOptions,
    expectedIdentity?: SigningIdentity,
  ): Promise<string> {
    const assertStillAuthorized = this.createRawSigningGuard(rawTxHex, sourceAddress, expectedIdentity, options?.approvedCoinLocks);
    const { psbtHex, inputValues, lockScripts } = options ?? {};
    const activeWalletId = this.state.activeWalletId();
    if (!activeWalletId) throw new Error("No active wallet set");
    const wallet = this.state.getWalletById(activeWalletId);
    if (!wallet) throw new Error("Wallet not found");

    const targetAddress = wallet.addresses.find(addr => addr.address === sourceAddress);
    if (!targetAddress) throw new Error("Source address not found in wallet");

    // Hardware wallet signing path
    if (wallet.type === 'hardware') {
      if (!psbtHex) {
        throw new Error("Hardware wallet signing requires a PSBT. The transaction cannot be signed without PSBT data.");
      }

      // Treat amounts/scripts shipped beside the PSBT as hints only. Resolve the raw parent
      // transaction for every input, bind the outpoint to it, and use those independently
      // verified values for both device display and signing.
      const verified = await verifyPsbtPrevouts(psbtHex, {
        resolveTrustedPrevout: getTrustedBroadcastPrevout,
      });
      const verifiedValues = verified.prevouts.map((prevout) => Number(prevout.amount));
      const verifiedScripts = verified.prevouts.map((prevout) => bytesToHex(prevout.script));
      if (
        inputValues
        && (
          inputValues.length !== verifiedValues.length
          || inputValues.some((value, index) => value !== verifiedValues[index])
        )
      ) {
        throw new Error('Counterparty input values do not match the real previous outputs');
      }
      if (
        lockScripts
        && (
          lockScripts.length !== verifiedScripts.length
          || lockScripts.some((script, index) => script.toLowerCase() !== verifiedScripts[index])
        )
      ) {
        throw new Error('Counterparty lock scripts do not match the real previous outputs');
      }
      const completedPsbtHex = completePsbtWithInputValues(
        verified.hex,
        verifiedValues,
        verifiedScripts,
      );

      const reviewed = parseTransactionForIntegrity(rawTxHex);
      assertTransactionMatchesReviewed(parsePSBT(completedPsbtHex), reviewed);

      const { trezor, DerivationPaths } = await this.getInitializedTrezor(wallet.id);
      // Device init awaits; a lock during it empties the address list, so check the session
      // before mapping paths from that list.
      assertStillAuthorized();
      const inputPaths = mapVerifiedInputPaths(
        verified.prevouts,
        wallet.addresses,
        (path) => DerivationPaths.stringToPath(path),
      );

      // Sign PSBT with hardware wallet - returns fully signed raw tx
      assertStillAuthorized();
      const result = await trezor.signPsbt({
        psbtHex: completedPsbtHex,
        inputPaths,
      });

      assertStillAuthorized();
      assertTransactionMatchesReviewed(parseTransactionForIntegrity(result.signedTxHex), reviewed);
      return result.signedTxHex;
    }

    // Software wallet signing path (mnemonic or private key)
    // Pass input values and lock scripts when available to avoid fetching previous transactions
    const privateKeyResult = await this.state.getPrivateKey(wallet.id, targetAddress.path);
    assertStillAuthorized();
    const signedTxHex = await btcSignTransaction(
      rawTxHex,
      wallet,
      targetAddress,
      privateKeyResult.hex,
      privateKeyResult.compressed,
      inputValues,
      lockScripts,
      getTrustedBroadcastPrevout,
      assertStillAuthorized,
      options?.zeldHuntSeconds ?? 0,
      huntInBackground,
    );
    assertStillAuthorized();
    return signedTxHex;
  }

  /**
   * Sign a Taproot-encoded compose: the commit, then its reveal with the source key.
   *
   * Core 11.5 returns an unsigned reveal the wallet signs with the source key. Both signatures are
   * made here, in one request under one signing guard, so a lock, wallet switch or address change
   * at any point stops both: nothing is returned unless both were signed under the identity the
   * request started with. The commit is signed exactly as `signTransaction` signs it (no ZELD
   * nonce: the reveal spends its txid); the reveal is signed only if it spends output 0 of that
   * signed commit and passes `signTaprootReveal`'s checks against that output.
   *
   * Software wallets only: a hardware wallet never asks for Taproot encoding.
   */
  public async signCommitAndReveal(
    rawTxHex: string,
    sourceAddress: string,
    reveal: TaprootRevealToSign,
    options?: Omit<SignTransactionOptions, 'zeldHuntSeconds'>,
    expectedIdentity?: SigningIdentity,
  ): Promise<{ signedTxHex: string; signedRevealHex: string }> {
    const assertStillAuthorized = this.createRawSigningGuard(rawTxHex, sourceAddress, expectedIdentity, options?.approvedCoinLocks);
    const activeWalletId = this.state.activeWalletId();
    if (!activeWalletId) throw new Error("No active wallet set");
    const wallet = this.state.getWalletById(activeWalletId);
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.type === 'hardware') {
      throw new Error('A hardware wallet does not sign Taproot reveals');
    }
    const targetAddress = wallet.addresses.find(addr => addr.address === sourceAddress);
    if (!targetAddress) throw new Error("Source address not found in wallet");

    const privateKeyResult = await this.state.getPrivateKey(wallet.id, targetAddress.path);
    assertStillAuthorized();
    const signedTxHex = await btcSignTransaction(
      rawTxHex,
      wallet,
      targetAddress,
      privateKeyResult.hex,
      privateKeyResult.compressed,
      options?.inputValues,
      options?.lockScripts,
      getTrustedBroadcastPrevout,
      assertStillAuthorized,
      0,
    );
    assertStillAuthorized();

    // The reveal spends output 0 of the commit as signed; read that output from the signed bytes.
    const commit = parseTransactionForIntegrity(signedTxHex);
    const commitOutput = commit.outputsLength > 0 ? commit.getOutput(0) : undefined;
    const revealInput = parseTransactionForIntegrity(reveal.revealHex).getInput(0);
    if (!commitOutput?.script || commitOutput.amount === undefined || !revealInput?.txid
      || revealInput.index !== 0 || bytesToHex(revealInput.txid) !== commit.id) {
      throw new Error('The reveal does not spend the signed commit transaction.');
    }
    const signedRevealHex = signTaprootReveal(
      reveal,
      { scriptHex: bytesToHex(commitOutput.script), value: commitOutput.amount },
      sourceAddress,
      privateKeyResult.hex,
    );
    assertStillAuthorized();
    return { signedTxHex, signedRevealHex };
  }

  /**
   * Sign a site's `commit-and-reveal` bundle (`commitRevealBundle.ts`): the commit PSBT, then the
   * reveal PSBT's input 0 with the source key.
   *
   * Core 11.5 returns an unsigned reveal the wallet signs with the source key. The commit is signed
   * exactly as any provider PSBT is (`signPsbt`: prevouts re-read from their parents, the envelope
   * leaf guard in force). It must then finalize to the txid the reveal spends, or nothing more is
   * signed. The reveal is not signed by the PSBT signer at all: its unsigned transaction goes to
   * `signTaprootReveal`, which holds it to Core's source-signature rule against commit output 0 as
   * signed, and the signature is written back as the input's `tapScriptSig`. One signing guard spans
   * both, so a lock, wallet switch or address change at any point returns nothing.
   *
   * Software wallets only.
   *
   * @returns the signed commit PSBT and the signed reveal PSBT, neither finalized
   */
  public async signCommitAndRevealPsbts(
    commit: { psbtHex: string; signInputs: Record<string, number[]>; sighashTypes: number[]; approvedCoinLocks?: CoinLock[] },
    revealPsbtHex: string,
    sourceAddress: string,
    expectedIdentity?: SigningIdentity,
    revealSighash: number = SigHash.DEFAULT,
  ): Promise<[string, string]> {
    const identityGuard = this.createSigningGuard(expectedIdentity);
    const coinGuard = this.createCoinGuard(parsePSBT(commit.psbtHex), commit.signInputs, commit.approvedCoinLocks);
    const assertStillAuthorized = () => { identityGuard(); coinGuard(); };
    assertStillAuthorized();
    if (revealSighash !== SigHash.DEFAULT && revealSighash !== SigHash.ALL) {
      throw new Error('The reveal is signed with SIGHASH_DEFAULT or SIGHASH_ALL only.');
    }
    const activeWalletId = this.state.activeWalletId();
    if (!activeWalletId) throw new Error("No active wallet set");
    const wallet = this.state.getWalletById(activeWalletId);
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.type === 'hardware') {
      throw new Error('A hardware wallet does not sign Taproot reveals');
    }
    const targetAddress = wallet.addresses.find(address =>
      normalizeAddressForComparison(address.address) === normalizeAddressForComparison(sourceAddress));
    if (!targetAddress) throw new Error("Source address not found in wallet");

    // What the reveal asks to be signed, read before any signature exists.
    const revealPsbt = parsePSBT(revealPsbtHex);
    const revealInput = revealPsbt.inputsLength === 1 ? revealPsbt.getInput(0) : undefined;
    const leaves = revealInput?.tapLeafScript ?? [];
    if (!revealInput?.txid || revealInput.index !== 0 || leaves.length !== 1) {
      throw new Error('The reveal must spend commit output 0 through its one envelope leaf.');
    }
    const [control, scriptWithVersion] = leaves[0]!;
    const reveal: TaprootRevealToSign = {
      revealHex: bytesToHex(revealPsbt.unsignedTx),
      envelopeScriptHex: bytesToHex(scriptWithVersion.subarray(0, -1)),
      controlBlockHex: bytesToHex(TaprootControlBlock.encode(control)),
    };

    const signedCommitPsbt = await this.signPsbt(commit.psbtHex, commit.signInputs, commit.sighashTypes, expectedIdentity,
      commit.approvedCoinLocks ? { approvedCoinLocks: commit.approvedCoinLocks } : undefined);
    assertStillAuthorized();
    const reviewedCommit = parsePSBT(commit.psbtHex);
    if (bytesToHex(parsePSBT(signedCommitPsbt).unsignedTx) !== bytesToHex(reviewedCommit.unsignedTx)) {
      throw new Error('The commit signer changed the reviewed transaction.');
    }
    // The reveal spends output 0 of the commit as it will be broadcast; read that output from the
    // finalized bytes, and require their txid to be the one the reveal names.
    const commitTx = parseTransactionForIntegrity(finalizePSBT(signedCommitPsbt));
    const commitOutput = commitTx.outputsLength > 0 ? commitTx.getOutput(0) : undefined;
    if (commitTx.id !== reviewedCommit.id || bytesToHex(revealInput.txid) !== commitTx.id
      || !commitOutput?.script || commitOutput.amount === undefined) {
      throw new Error('The reveal does not spend the signed commit transaction.');
    }
    const prevout = revealInput.witnessUtxo;
    if (!prevout || bytesToHex(prevout.script) !== bytesToHex(commitOutput.script) || prevout.amount !== commitOutput.amount) {
      throw new Error('The reveal describes a different commit output than the one signed.');
    }

    const privateKeyResult = await this.state.getPrivateKey(wallet.id, targetAddress.path);
    assertStillAuthorized();
    const signedRevealHex = signTaprootReveal(
      reveal,
      { scriptHex: bytesToHex(commitOutput.script), value: commitOutput.amount },
      targetAddress.address,
      privateKeyResult.hex,
      { sighash: revealSighash, siteInternalKey: true },
    );
    assertStillAuthorized();

    // The signature goes back into the PSBT as a script-path partial signature on the envelope leaf,
    // and must finalize to exactly the reveal signTaprootReveal produced.
    const witness = parseTransactionForIntegrity(signedRevealHex).getInput(0).finalScriptWitness;
    const signature = witness?.[0];
    const leafKey = envelopeLeafKey(scriptWithVersion.subarray(0, -1));
    if (!signature || signature.length !== (revealSighash === SigHash.DEFAULT ? 64 : 65) || !leafKey.ok) {
      throw new Error('The reveal signature could not be read.');
    }
    revealPsbt.updateInput(0, {
      ...(revealSighash === SigHash.DEFAULT ? {} : { sighashType: revealSighash }),
      tapScriptSig: [[{ pubKey: leafKey.key, leafHash: envelopeLeafHash(reveal.envelopeScriptHex) }, signature]],
    }, true);
    const signedRevealPsbt = bytesToHex(revealPsbt.toPSBT());
    if (finalizePSBT(signedRevealPsbt) !== signedRevealHex) {
      throw new Error('The signed reveal does not finalize to the reveal that was signed.');
    }
    assertStillAuthorized();
    return [signedCommitPsbt, signedRevealPsbt];
  }

  /**
   * Build and sign one bare-multisig consolidation batch with the key of `sourceAddress`, which
   * must belong to the active wallet. A private-key wallet signs with its one key; a mnemonic
   * wallet with the key at the address's path. The batch signs in chunks with yields between
   * them, and the guard is rechecked after each, so a lock or switch mid-batch stops it.
   */
  public async signConsolidationBatch(
    sourceAddress: string,
    batchData: ConsolidationData,
    feeRateSatPerVByte: number,
    destinationAddress?: string,
  ): Promise<ConsolidationResult> {
    const wallet = this.state.getActiveWallet();
    const address = wallet?.addresses.find(candidate => candidate.address === sourceAddress);
    if (!wallet || !address) {
      throw new Error('Source address is not part of the active wallet');
    }
    const assertStillAuthorized = this.createSigningGuard();
    const privateKeyResult = wallet.type === 'privateKey'
      ? await this.state.getPrivateKey(wallet.id)
      : await this.state.getPrivateKey(wallet.id, address.path);
    assertStillAuthorized();
    const result = await consolidateBareMultisigBatch(
      privateKeyResult.hex,
      sourceAddress,
      batchData,
      feeRateSatPerVByte,
      destinationAddress,
      assertStillAuthorized,
    );
    assertStillAuthorized();
    return result;
  }

  /**
   * Sign a message with the wallet's private key.
   *
   * For software wallets, signs locally with the private key.
   * For hardware wallets, signs via the hardware device.
   *
   * @param message - Message to sign
   * @param address - Address to sign with
   * @returns Signature and signing address
   */
  public async signMessage(message: string, address: string, expectedIdentity?: SigningIdentity): Promise<{ signature: string; address: string }> {
    const assertStillAuthorized = this.createSigningGuard(expectedIdentity);
    const activeWalletId = this.state.activeWalletId();
    if (!activeWalletId) throw new Error("No active wallet set");
    const wallet = this.state.getWalletById(activeWalletId);
    if (!wallet) throw new Error("Wallet not found");

    const normalizedAddress = normalizeAddressForComparison(address);
    const paired = wallet.type === 'mnemonic' && getPairedAddressFormats(wallet.addressFormat)
      ? await this.state.getPairedAddresses()
      : null;
    const pairedTarget = paired
      ? [paired.legacy, paired.segwit].find(
          candidate => normalizeAddressForComparison(candidate.address) === normalizedAddress
        )
      : undefined;
    const targetAddress = wallet.addresses.find(
      candidate => normalizeAddressForComparison(candidate.address) === normalizedAddress
    ) ?? pairedTarget;
    if (!targetAddress) throw new Error("Address not found in wallet");
    const targetFormat = pairedTarget?.format ?? wallet.addressFormat;

    // Hardware wallet signing path
    if (wallet.type === 'hardware') {
      // Trezor does not support message signing for Taproot (P2TR) addresses
      // Check both wallet format and address prefix (bc1p = Taproot)
      if (targetFormat === AddressFormat.P2TR || address.startsWith('bc1p')) {
        throw new Error(
          "Trezor does not support message signing for Taproot (P2TR) addresses. " +
          "This is a hardware limitation. To sign messages, use a wallet with a different address type (e.g., Native SegWit bc1q...)."
        );
      }

      const { trezor, DerivationPaths } = await this.getInitializedTrezor(wallet.id);

      // Convert derivation path string to number array
      const pathArray = DerivationPaths.stringToPath(targetAddress.path);

      // Sign message with hardware wallet
      assertStillAuthorized();
      const result = await trezor.signMessage({
        message,
        path: pathArray,
      });

      assertStillAuthorized();
      return {
        signature: result.signature,
        address: result.address,
      };
    }

    // Software wallet signing path
    const privateKeyResult = await this.state.getPrivateKey(wallet.id, targetAddress.path);

    // Use the signMessage function
    assertStillAuthorized();
    const result = await signMessage(message, privateKeyResult.hex, targetFormat, privateKeyResult.compressed);
    assertStillAuthorized();
    return result;
  }

  /**
   * Sign a PSBT (Partially Signed Bitcoin Transaction)
   *
   * This method is used by the web provider API (window.bitcoin.signPsbt) for external dApps.
   * It returns a signed PSBT hex (not finalized) that can be combined with other signatures.
   *
   * Trezor provider signing is supported for explicit Native SegWit SIGHASH_ALL inputs. Any
   * unselected input must already carry a verifiable Native SegWit SIGHASH_ALL signature. Exact-offer
   * acceptance does not qualify: the market serves it with the buyer's input unsigned.
   *
   * @param psbtHex - PSBT in hex format
   * @param signInputs - Optional map of address → input indices to sign
   * @param sighashTypes - Optional sighash types per input index
   * @returns Signed PSBT hex (not finalized)
   */
  public async signPsbt(
    psbtHex: string,
    signInputs?: Record<string, number[]>,
    sighashTypes?: number[],
    expectedIdentity?: SigningIdentity,
    options?: SignPsbtOptions,
  ): Promise<string> {
    const identityGuard = this.createSigningGuard(expectedIdentity);
    const lockTx = parsePSBT(psbtHex);
    const active = this.state.lastActiveAddress() ?? this.state.getActiveWallet()?.addresses[0]?.address;
    const coinGuard = this.createCoinGuard(lockTx,
      signInputs && Object.keys(signInputs).length > 0 ? signInputs
        : active ? { [active]: Array.from({ length: lockTx.inputsLength }, (_, index) => index) } : {},
      options?.approvedCoinLocks);
    const assertStillAuthorized = () => { identityGuard(); coinGuard(); };
    assertStillAuthorized();
    const activeWalletId = this.state.activeWalletId();
    if (!activeWalletId) throw new Error("No active wallet set");
    const wallet = this.state.getWalletById(activeWalletId);
    if (!wallet) throw new Error("Wallet not found");
    // Earlier items of the same approved bundle, which a later item spends before broadcast.
    const packageTransactions = options?.packageTransactions
      ? new Map(Object.entries(options.packageTransactions).map(([txid, raw]) => [txid.toLowerCase(), raw]))
      : undefined;

    if (wallet.type === 'hardware') {
      if (!signInputs || Object.keys(signInputs).length === 0) {
        throw new Error('Hardware wallet PSBT signing requires explicit signInputs');
      }

      const psbtDetails = extractPsbtDetails(psbtHex);
      const walletAddresses = wallet.addresses.map(address => address.address);
      const selection = validateSignInputs(signInputs, walletAddresses, psbtDetails.inputs.length);
      if (!selection.valid) throw new Error(selection.error);
      const requestedIndices = new Set(Object.values(signInputs).flat());
      for (let inputIndex = 0; inputIndex < psbtDetails.inputs.length; inputIndex++) {
        const input = psbtDetails.inputs[inputIndex]!;
        const selected = requestedIndices.has(inputIndex);
        if (!selected && !input.hasSignatures) {
          throw new Error(`Trezor requires external input ${inputIndex} to be pre-signed`);
        }
        // An explicit request entry describes what the wallet should add. It must never hide the
        // sighash already embedded in an unselected external signature.
        const effectiveSighash = selected
          ? resolvePsbtSighashType(sighashTypes?.[inputIndex], input.sighashType)
          : resolvePsbtSighashType(undefined, input.sighashType);
        if (effectiveSighash !== 0x01) {
          throw new Error(selected
            ? 'Trezor provider signing supports only ordinary SIGHASH_ALL transactions'
            : `Trezor can preserve only SIGHASH_ALL external inputs; input ${inputIndex} uses 0x${effectiveSighash.toString(16)}`);
        }
      }

      // The device displays every input's amount, including presigned external inputs.
      // Resolve every parent and bind the requested signer to that authenticated prevout.
      const verified = await verifyPsbtPrevouts(psbtHex, {
        resolveTrustedPrevout: getTrustedBroadcastPrevout,
        ...(packageTransactions ? { packageTransactions } : {}),
      });
      assertStillAuthorized();
      const ownership = validateSignInputs(signInputs, walletAddresses, psbtDetails.inputs.length,
        verified.prevouts.map(prevout => prevout.address));
      if (!ownership.valid) throw new Error(ownership.error);
      const completedPsbtHex = completePsbtWithInputValues(verified.hex,
        verified.prevouts.map(prevout => Number(prevout.amount)),
        verified.prevouts.map(prevout => bytesToHex(prevout.script)));
      const { trezor, DerivationPaths } = await this.getInitializedTrezor(wallet.id);
      // Device init awaits; a lock during it empties the address list, so check the session
      // before mapping paths from that list.
      assertStillAuthorized();
      const inputPaths = mapVerifiedInputPaths(
        verified.prevouts.filter(prevout => requestedIndices.has(prevout.index)),
        wallet.addresses,
        path => DerivationPaths.stringToPath(path),
      );
      assertStillAuthorized();
      const result = await trezor.signPsbt({
        psbtHex: completedPsbtHex,
        inputPaths,
        sighashTypes,
        resultFormat: 'signed_psbt',
      });
      assertStillAuthorized();
      if (!result.signedPsbtHex) throw new Error('Hardware wallet did not return a signed PSBT');
      return result.signedPsbtHex;
    }

    // The PSBT may contain witnessUtxo metadata supplied by an untrusted dApp. Validate every
    // input against its actual parent transaction before selecting keys or producing signatures.
    const requestedInputIndices = signInputs && Object.keys(signInputs).length > 0
      ? Object.values(signInputs).flat()
      : undefined;
    const verified = await verifyPsbtPrevouts(psbtHex, {
      resolveTrustedPrevout: getTrustedBroadcastPrevout,
      ...(requestedInputIndices ? { inputIndices: requestedInputIndices } : {}),
      ...(packageTransactions ? { packageTransactions } : {}),
    });
    // Prevout verification awaits the network. A lock or identity change during it must stop
    // this request here, as it does on the hardware path, before any key is selected.
    assertStillAuthorized();
    psbtHex = verified.hex;
    // The one tapleaf whose message the approval shows, read from these bytes exactly as the
    // approval read it. The signer refuses every other script path naming its key.
    const shownLeaf = shownEnvelopeLeaf(extractPsbtDetails(psbtHex));
    const signingOptions = shownLeaf ? { shownEnvelopeLeaf: shownLeaf } : {};

    // If signInputs is provided, sign only the specified inputs
    // Otherwise, sign all inputs we can (using the active address)
    if (signInputs && Object.keys(signInputs).length > 0) {
      let signedPsbtHex = psbtHex;

      const paired = wallet.type === 'mnemonic' && getPairedAddressFormats(wallet.addressFormat)
        ? await this.state.getPairedAddresses()
        : null;
      for (const [address, inputIndices] of Object.entries(signInputs)) {
        const normalizedAddress = normalizeAddressForComparison(address);
        const pairedTarget = paired
          ? [paired.legacy, paired.segwit].find(
              addr => normalizeAddressForComparison(addr.address) === normalizedAddress
            )
          : undefined;
        const targetAddress = wallet.addresses.find(
          addr => normalizeAddressForComparison(addr.address) === normalizedAddress
        ) ?? pairedTarget;
        if (!targetAddress) {
          throw new Error(`Address ${address} not found in wallet`);
        }

        const targetFormat = pairedTarget?.format ?? wallet.addressFormat;
        const secret = await sessionManager.getUnlockedSecret(wallet.id);
        if (!secret) throw new Error('Wallet is locked');
        // A paired address is always a mnemonic key, which is compressed.
        const key = targetFormat === wallet.addressFormat
          ? await this.state.getPrivateKey(wallet.id, targetAddress.path)
          : {
              hex: mnemonicPrivateKeyAt(secret, targetFormat, targetAddress.path, sessionManager.unlockedHdNodeCache(wallet.id, secret)),
              compressed: true,
            };
        assertStillAuthorized();
        signedPsbtHex = btcSignPSBT(
          signedPsbtHex,
          key.hex,
          inputIndices,
          targetFormat,
          sighashTypes,
          key.compressed,
          signingOptions,
        );
      }

      return signedPsbtHex;
    } else {
      // Preserve legacy best-effort signing, but only with the connected active address.
      const activeAddress = wallet.addresses.find(
        address => address.address === this.state.lastActiveAddress()
      ) ?? wallet.addresses[0];
      if (!activeAddress) {
        throw new Error("No addresses in wallet");
      }

      const privateKeyResult = await this.state.getPrivateKey(wallet.id, activeAddress.path);
      assertStillAuthorized();
      return btcSignPSBT(
        psbtHex,
        privateKeyResult.hex,
        [], // Empty array means try all inputs
        wallet.addressFormat,
        sighashTypes,
        privateKeyResult.compressed,
        signingOptions,
      );
    }
  }
}
