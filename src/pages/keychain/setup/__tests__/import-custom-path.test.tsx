import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddressFormat } from "@/core/bitcoin/address";
import { getPrivateKeyFromMnemonic } from "@/core/bitcoin/privateKey";
import { analytics } from "@/platform/fathom";
import ImportCustomPathPage from "../import-custom-path";

const mockNavigate = vi.fn();
const mockSetHeaderProps = vi.fn();
const mockCreatePrivateKeyWallet = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/contexts/header-context", () => ({
  useHeader: () => ({
    setHeaderProps: mockSetHeaderProps,
  }),
}));

vi.mock("@/contexts/wallet-context", () => ({
  useWallet: () => ({
    createPrivateKeyWallet: mockCreatePrivateKeyWallet,
  }),
}));

vi.mock("@/platform/fathom", () => ({
  analytics: {
    track: vi.fn(),
  },
}));

const MNEMONIC = "like just love know never want time out there make look eye";
const BIP39_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function fillMnemonic(mnemonic: string) {
  mnemonic.split(" ").forEach((word, index) => {
    fireEvent.change(screen.getByLabelText(`Word ${index + 1}`, { selector: "input" }), {
      target: { value: word },
    });
  });
}

function continueButton() {
  return screen.getByRole("button", { name: "Continue" });
}

describe("ImportCustomPathPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePrivateKeyWallet.mockResolvedValue({});
  });

  it("derives the Electrum seed at the selected Bech32 path and imports it like a private key wallet", async () => {
    render(<ImportCustomPathPage />);

    fillMnemonic(MNEMONIC);
    fireEvent.change(screen.getByLabelText("Change"), { target: { value: "1" } });
    fireEvent.click(continueButton());

    const expectedKey = getPrivateKeyFromMnemonic(
      MNEMONIC,
      "m/0'/1/0",
      AddressFormat.CounterwalletSegwit
    );

    await waitFor(() => {
      expect(mockCreatePrivateKeyWallet).toHaveBeenCalledWith(
        expectedKey,
        "",
        undefined,
        AddressFormat.P2WPKH
      );
    });
    expect(analytics.track).toHaveBeenCalledWith("private_key_imported");
    expect(mockNavigate).toHaveBeenCalledWith("/index");
  });

  it("imports a Legacy address from the same Electrum path", async () => {
    const user = userEvent.setup();
    render(<ImportCustomPathPage />);

    fillMnemonic(MNEMONIC);

    const listbox = screen.getByRole("button", { name: "Derivation Path" });
    await user.click(listbox);
    await user.click(await screen.findByText("Legacy"));

    fireEvent.change(screen.getByLabelText("Address index"), { target: { value: "5" } });
    fireEvent.click(continueButton());

    const expectedKey = getPrivateKeyFromMnemonic(
      MNEMONIC,
      "m/0'/0/5",
      AddressFormat.Counterwallet
    );

    await waitFor(() => {
      expect(mockCreatePrivateKeyWallet).toHaveBeenCalledWith(
        expectedKey,
        "",
        undefined,
        AddressFormat.P2PKH
      );
    });
  });

  it("rejects a phrase that is not a Counterwallet mnemonic", async () => {
    render(<ImportCustomPathPage />);

    fillMnemonic(BIP39_MNEMONIC);
    fireEvent.click(continueButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid recovery phrase. Please check each word carefully."
      );
    });
    expect(mockCreatePrivateKeyWallet).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("rejects words that are not on the Counterwallet wordlist", async () => {
    render(<ImportCustomPathPage />);

    fillMnemonic("zzzz zzzz zzzz zzzz zzzz zzzz zzzz zzzz zzzz zzzz zzzz zzzz");
    fireEvent.click(continueButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid recovery phrase. Please check each word carefully."
      );
    });
    expect(mockCreatePrivateKeyWallet).not.toHaveBeenCalled();
  });

  it("disables Continue when a path segment is empty", () => {
    render(<ImportCustomPathPage />);

    fillMnemonic(MNEMONIC);
    expect(continueButton()).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Change"), { target: { value: "" } });
    expect(continueButton()).toBeDisabled();

    fireEvent.click(continueButton());
    expect(mockCreatePrivateKeyWallet).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Change"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Address index"), { target: { value: "" } });
    expect(continueButton()).toBeDisabled();
  });

  it("shows a specific error when that private key is already imported", async () => {
    mockCreatePrivateKeyWallet.mockRejectedValue(
      new Error("A wallet with this private key already exists.")
    );
    render(<ImportCustomPathPage />);

    fillMnemonic(MNEMONIC);
    fireEvent.click(continueButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This private key has already been imported."
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("surfaces other import failures on the alert", async () => {
    mockCreatePrivateKeyWallet.mockRejectedValue(new Error("Keychain is locked"));
    render(<ImportCustomPathPage />);

    fillMnemonic(MNEMONIC);
    fireEvent.click(continueButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Failed to import custom path. Keychain is locked"
      );
    });
  });
});
