import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddressFormat } from "@/core/bitcoin/address";
import { getPrivateKeyFromMnemonic } from "@/core/bitcoin/privateKey";
import { GIFT_CARD_PATH } from "@/core/wallet/rarePepeWallet";
import { analytics } from "@/platform/fathom";
import ImportMnemonicPage from "../import-mnemonic";

const mockNavigate = vi.fn();
const mockSetHeaderProps = vi.fn();
const mockCreateMnemonicWallet = vi.fn();
const mockCreatePrivateKeyWallet = vi.fn();
const mockVerifyPassword = vi.fn();
const mockDetectGiftCard = vi.fn();
const mockSweepUtxoAddresses = vi.fn();
const mockDetectAddressFormat = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/contexts/header-context", () => ({
  useHeader: () => ({ setHeaderProps: mockSetHeaderProps }),
}));

vi.mock("@/contexts/wallet-context", () => ({
  useWallet: () => ({
    keychainExists: true,
    createMnemonicWallet: mockCreateMnemonicWallet,
    createPrivateKeyWallet: mockCreatePrivateKeyWallet,
    sweepUtxoAddresses: mockSweepUtxoAddresses,
    verifyPassword: mockVerifyPassword,
  }),
}));

vi.mock("@/core/bitcoin/address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/bitcoin/address")>()),
  detectAddressFormat: (mnemonic: string) => mockDetectAddressFormat(mnemonic),
}));

vi.mock("@/core/wallet/rarePepeWallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/wallet/rarePepeWallet")>()),
  detectGiftCard: (mnemonic: string) => mockDetectGiftCard(mnemonic),
}));

vi.mock("@/platform/fathom", () => ({
  analytics: { track: vi.fn() },
}));

// Every word is on the Counterwallet wordlist and the phrase fails the BIP39 checksum, so the
// page classifies it as unambiguously Counterwallet — the only branch that checks for gift cards.
const CW_MNEMONIC = "like just love know never want time out there make look eye";
const BIP39_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PASSWORD = "password123";
const GIFT_CARD_ADDRESS = "1KRatFhAmCNXFYGyqvbBqPqSbAAxHRWkAJ";

function fillPhrase(mnemonic: string) {
  mnemonic.split(" ").forEach((word, index) => {
    fireEvent.change(screen.getByLabelText(`Word ${index + 1}`, { selector: "input" }), {
      target: { value: word },
    });
  });
}

/** Fill the phrase, tick the backup confirmation, and enter a password. */
function completeForm(mnemonic = CW_MNEMONIC) {
  fillPhrase(mnemonic);
  fireEvent.click(screen.getByLabelText("I have saved my secret recovery phrase."));
  enterPassword();
}

function enterPassword() {
  fireEvent.change(screen.getByPlaceholderText("Confirm your password"), {
    target: { value: PASSWORD },
  });
}

describe("ImportMnemonicPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyPassword.mockResolvedValue(true);
    mockCreateMnemonicWallet.mockResolvedValue({ id: "wallet-1" });
    mockSweepUtxoAddresses.mockResolvedValue([]);
    mockCreatePrivateKeyWallet.mockResolvedValue({});
    mockDetectGiftCard.mockResolvedValue({ status: "none" });
    mockDetectAddressFormat.mockResolvedValue(AddressFormat.P2TR);
  });

  it("imports an ordinary Counterwallet phrase without asking about gift cards", async () => {
    render(<ImportMnemonicPage />);
    completeForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mockCreateMnemonicWallet).toHaveBeenCalledWith(
        CW_MNEMONIC,
        PASSWORD,
        undefined,
        AddressFormat.Counterwallet
      );
    });
    expect(screen.queryByText(/Rare Pepe Wallet gift card/)).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith("/index");
  });

  it("spends one check on a phrase, not one per keystroke", async () => {
    render(<ImportMnemonicPage />);
    fillPhrase(CW_MNEMONIC);

    // "them" and "then" are both on the Counterwallet wordlist, so typing towards "there" passes
    // through complete, checkable phrases the user has not finished writing.
    const lastWord = screen.getByLabelText("Word 12", { selector: "input" });
    for (const value of ["them", "then", "there"]) {
      fireEvent.change(lastWord, { target: { value } });
    }

    await waitFor(() => expect(mockDetectGiftCard).toHaveBeenCalled());
    expect(mockDetectGiftCard).toHaveBeenCalledTimes(1);
    expect(mockDetectGiftCard).toHaveBeenCalledWith(
      CW_MNEMONIC.split(" ").slice(0, 11).concat("there").join(" ")
    );
  });

  it("does not touch the wallet state on an import that cannot have a UTXO address", async () => {
    render(<ImportMnemonicPage />);
    completeForm(BIP39_MNEMONIC);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/index"));
    // The lookup returns nothing for a non-Counterwallet format, but calling it still drags a
    // state refresh through the import — which is what emptied the address on the index page.
    expect(mockSweepUtxoAddresses).not.toHaveBeenCalled();
  });

  it("looks for UTXO addresses on the wallet it just made, without holding it up", async () => {
    render(<ImportMnemonicPage />);
    completeForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(mockSweepUtxoAddresses).toHaveBeenCalledWith("wallet-1"));
    // The wallet is shown first. Waiting on the lookup delayed the import behind a network call
    // and let its state refresh land mid-import, which emptied the address on the page it opens.
    expect(mockNavigate).toHaveBeenCalledBefore(mockSweepUtxoAddresses);
  });

  it("does not report a finished import as failed when the UTXO lookup throws", async () => {
    mockSweepUtxoAddresses.mockRejectedValue(new Error("network down"));
    render(<ImportMnemonicPage />);
    completeForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // The wallet was created before the lookup ran, so the import has succeeded either way.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/index"));
    await waitFor(() => expect(mockSweepUtxoAddresses).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never runs the gift card check on a BIP39 phrase", async () => {
    render(<ImportMnemonicPage />);
    completeForm(BIP39_MNEMONIC);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(mockCreateMnemonicWallet).toHaveBeenCalled());
    expect(mockDetectGiftCard).not.toHaveBeenCalled();
  });

  describe("when the phrase is a gift card", () => {
    beforeEach(() => {
      mockDetectGiftCard.mockResolvedValue({ status: "found", value: GIFT_CARD_ADDRESS });
    });

    it("says so before anything is imported, and does not offer to make a wallet of it", async () => {
      render(<ImportMnemonicPage />);
      fillPhrase(CW_MNEMONIC);

      expect(await screen.findByText(/Rare Pepe Wallet gift card/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import Gift Card" })).toBeInTheDocument();
      // The words belong to whoever handed the card over, so a wallet built on them would be
      // theirs to spend from. That reading is not offered next to the safe one.
      expect(screen.queryByRole("button", { name: /Import as Wallet/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
      expect(mockCreateMnemonicWallet).not.toHaveBeenCalled();
      expect(mockCreatePrivateKeyWallet).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("warns that the card's own address is not private either", async () => {
      render(<ImportMnemonicPage />);
      fillPhrase(CW_MNEMONIC);

      expect(
        await screen.findByText(/still spend from the card itself/)
      ).toBeInTheDocument();
    });

    it("does not ask the holder to confirm they saved a phrase that is not theirs", async () => {
      render(<ImportMnemonicPage />);
      fillPhrase(CW_MNEMONIC);

      await screen.findByText(/Rare Pepe Wallet gift card/);
      expect(
        screen.queryByLabelText("I have saved my secret recovery phrase.")
      ).not.toBeInTheDocument();

      // And the import still goes through on the password alone.
      await screen.findByPlaceholderText("Confirm your password");
      enterPassword();
      fireEvent.click(screen.getByRole("button", { name: "Import Gift Card" }));
      await waitFor(() => expect(mockCreatePrivateKeyWallet).toHaveBeenCalled());
    });

    it("imports the gift card address as a private key wallet, keeping no phrase", async () => {
      render(<ImportMnemonicPage />);
      fillPhrase(CW_MNEMONIC);
      await screen.findByPlaceholderText("Confirm your password");
      enterPassword();
      fireEvent.click(screen.getByRole("button", { name: "Import Gift Card" }));

      const expectedKey = getPrivateKeyFromMnemonic(
        CW_MNEMONIC,
        GIFT_CARD_PATH,
        AddressFormat.Counterwallet
      );

      await waitFor(() => {
        expect(mockCreatePrivateKeyWallet).toHaveBeenCalledWith(
          expectedKey,
          PASSWORD,
          "Gift Card",
          AddressFormat.P2PKH
        );
      });
      expect(mockCreateMnemonicWallet).not.toHaveBeenCalled();
      expect(analytics.track).toHaveBeenCalledWith("gift_card_imported");
      expect(mockNavigate).toHaveBeenCalledWith("/index");
    });

    it("offers no way at all to import the phrase as a wallet", async () => {
      render(<ImportMnemonicPage />);
      fillPhrase(CW_MNEMONIC);
      await screen.findByText(/Rare Pepe Wallet gift card/);

      // Not as a button, not as an opt-out, not behind the backup confirmation. The words belong
      // to whoever handed the card over, so every address a wallet derived from them would be
      // theirs to spend from.
      expect(screen.queryByRole("button", { name: /wallet/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /my own words/i })).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("I have saved my secret recovery phrase.")
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Import Gift Card" })).toHaveLength(1);
    });

    it("says why there is nothing to choose", async () => {
      render(<ImportMnemonicPage />);
      fillPhrase(CW_MNEMONIC);

      expect(
        await screen.findByText(/not imported as a wallet/)
      ).toBeInTheDocument();
    });

    it("drops the finding when the phrase is edited", async () => {
      render(<ImportMnemonicPage />);
      fillPhrase(CW_MNEMONIC);
      await screen.findByText(/Rare Pepe Wallet gift card/);

      fireEvent.change(screen.getByLabelText("Word 1", { selector: "input" }), {
        target: { value: "love" },
      });

      await waitFor(() => {
        expect(screen.queryByText(/Rare Pepe Wallet gift card/)).not.toBeInTheDocument();
      });
    });
  });

  it("says so, without blocking the import, when the check cannot reach the network", async () => {
    mockDetectGiftCard.mockResolvedValue({ status: "unavailable" });
    render(<ImportMnemonicPage />);
    completeForm();

    expect(await screen.findByText(/Couldn't check whether this phrase/)).toBeInTheDocument();
    expect(mockCreateMnemonicWallet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mockCreateMnemonicWallet).toHaveBeenCalledWith(
        CW_MNEMONIC,
        PASSWORD,
        undefined,
        AddressFormat.Counterwallet
      );
    });
  });
});
