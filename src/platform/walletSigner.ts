import { bytesToHex } from '@noble/hashes/utils.js';
import { AddressFormat, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { signMessage } from '@/core/bitcoin/messageSigner';
import { signPSBT as btcSignPSBT, completePsbtWithInputValues, extractPsbtDetails, parsePSBT, resolvePsbtSighashType, validateSignInputs } from '@/core/bitcoin/psbt';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';
import { assertTransactionMatchesReviewed, parseTransactionForIntegrity } from '@/core/bitcoin/transactionIntegrity';
import { signTransaction as btcSignTransaction } from '@/core/bitcoin/transactionSigner';
import { mapVerifiedInputPaths } from '@/core/hardware/inputPaths';
import { getPairedAddressFormats, mnemonicPrivateKeyAt } from '@/core/wallet/addressDeriver';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { SigningIdentity } from '@/platform/auth/signingIdentity';
import { getTrustedBroadcastPrevout } from '@/platform/provider/recentBroadcasts';
import { assertTrezorSuiteAccess } from '@/platform/suiteAccess';
import { huntInBackground } from '@/platform/zeldHunt';
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
}

/**
 * Transaction, PSBT and message signing for the active wallet: software keys, Trezor, paired
 * Legacy/SegWit addresses and the ZELD hunt.
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

  /** Sign the reviewed raw transaction; a hardware PSBT must describe those exact same bytes. */
  public async signTransaction(
    rawTxHex: string,
    sourceAddress: string,
    options?: SignTransactionOptions,
    expectedIdentity?: SigningIdentity,
  ): Promise<string> {
    const assertStillAuthorized = this.createSigningGuard(expectedIdentity);
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
    const assertStillAuthorized = this.createSigningGuard(expectedIdentity);
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
      );
    }
  }
}
