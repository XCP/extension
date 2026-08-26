import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddressFormat } from "@/core/bitcoin/address";
import { getPrivateKeyFromMnemonic } from "@/core/bitcoin/privateKey";
import { GIFT_CARD_PATH } from "@/core/wallet/rarePepeWalletDiscovery";
import { analytics } from "@/platform/fathom";
import ImportMnemonicPage from "../import-mnemonic";

const mockNavigate = vi.fn();
const mockSetHeaderProps = vi.fn();
const mockCreateMnemonicWallet = vi.fn();
const mockCreatePrivateKeyWallet = vi.fn();
const mockVerifyPassword = vi.fn();
const mockDetectGiftCard = vi.fn();
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
    verifyPassword: mockVerifyPassword,
  }),
}));

vi.mock("@/core/bitcoin/address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/bitcoin/address")>()),
  detectAddressFormat: (mnemonic: string) => mockDetectAddressFormat(mnemonic),
}));

vi.mock("@/core/wallet/rarePepeWalletDiscovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/wallet/rarePepeWalletDiscovery")>()),
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
  fireEvent.change(screen.getByPlaceholderText("Confirm your password"), {
    target: { value: PASSWORD },
  });
}

describe("ImportMnemonicPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyPassword.mockResolvedValue(true);
    mockCreateMnemonicWallet.mockResolvedValue({});
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

    it("says so before anything is imported, and offers both readings", async () => {
      render(<ImportMnemonicPage />);
      completeForm();

      expect(await screen.findByText(/Rare Pepe Wallet gift card/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import Gift Card" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import as Wallet Instead" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
      expect(mockCreateMnemonicWallet).not.toHaveBeenCalled();
      expect(mockCreatePrivateKeyWallet).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("imports the 500th address as a private key wallet, keeping no phrase", async () => {
      render(<ImportMnemonicPage />);
      completeForm();
      fireEvent.click(await screen.findByRole("button", { name: "Import Gift Card" }));

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

    it("still lets the phrase be imported as an ordinary wallet", async () => {
      render(<ImportMnemonicPage />);
      completeForm();
      fireEvent.click(await screen.findByRole("button", { name: "Import as Wallet Instead" }));

      await waitFor(() => {
        expect(mockCreateMnemonicWallet).toHaveBeenCalledWith(
          CW_MNEMONIC,
          PASSWORD,
          undefined,
          AddressFormat.Counterwallet
        );
      });
      expect(mockCreatePrivateKeyWallet).not.toHaveBeenCalled();
    });

    it("drops the finding when the phrase is edited", async () => {
      render(<ImportMnemonicPage />);
      completeForm();
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
