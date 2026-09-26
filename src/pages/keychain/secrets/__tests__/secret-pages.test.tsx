/**
 * The reveal screens hand the password to the background with the request for the secret, and show
 * what comes back. They never check the password themselves, and a wrong one reveals nothing and
 * switches no wallet.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShowPassphrasePage from "../show-passphrase";
import ShowPrivateKeyPage from "../show-private-key";

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const WIF = "KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d";
const PASSWORD = "synthetic-password";

const { params, wallet } = vi.hoisted(() => ({
  params: { value: {} as Record<string, string | undefined> },
  wallet: {
    revealSecret: vi.fn(),
    selectWallet: vi.fn(async () => {}),
    wallets: [] as { id: string; type: string }[],
  },
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => params.value,
}));
vi.mock("@/contexts/header-context", () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock("@/contexts/wallet-context", () => ({ useWallet: () => wallet }));
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn(), isCopied: () => false }) }));

function submit(buttonName: string) {
  fireEvent.change(screen.getByPlaceholderText("Enter your password"), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
}

describe("recovery phrase screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params.value = { walletId: "wallet-1" };
  });

  it("shows the phrase the background returns for the password, then selects the wallet", async () => {
    wallet.revealSecret.mockResolvedValue(MNEMONIC);
    render(<ShowPassphrasePage />);
    submit("Show Recovery Phrase");

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(12));
    expect(wallet.revealSecret).toHaveBeenCalledWith({ walletId: "wallet-1", password: PASSWORD, kind: "mnemonic" });
    expect(wallet.selectWallet).toHaveBeenCalledWith("wallet-1");
  });

  it("reveals nothing and switches nothing for a wrong password", async () => {
    wallet.revealSecret.mockResolvedValue(null);
    render(<ShowPassphrasePage />);
    submit("Show Recovery Phrase");

    await screen.findByText("Incorrect password.");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(wallet.selectWallet).not.toHaveBeenCalled();
  });

  it("reveals nothing when the background refuses", async () => {
    wallet.revealSecret.mockRejectedValue(new Error("Too many failed attempts"));
    render(<ShowPassphrasePage />);
    submit("Show Recovery Phrase");

    await screen.findByText("Incorrect password or failed to reveal recovery phrase.");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(wallet.selectWallet).not.toHaveBeenCalled();
  });
});

describe("private key screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.wallets = [{ id: "mnemonic-1", type: "mnemonic" }, { id: "key-1", type: "privateKey" }];
  });

  it("asks for the key at the address path of a mnemonic wallet", async () => {
    params.value = { walletId: "mnemonic-1", addressPath: "m/84'/0'/0'/0/0" };
    wallet.revealSecret.mockResolvedValue(WIF);
    render(<ShowPrivateKeyPage />);
    submit("Show Private Key");

    await screen.findByText(WIF);
    expect(wallet.revealSecret).toHaveBeenCalledWith({
      walletId: "mnemonic-1", password: PASSWORD, kind: "privateKey", path: "m/84'/0'/0'/0/0",
    });
    expect(wallet.selectWallet).toHaveBeenCalledWith("mnemonic-1");
  });

  it("asks for a private-key wallet's own key without a path", async () => {
    params.value = { walletId: "key-1" };
    wallet.revealSecret.mockResolvedValue(WIF);
    render(<ShowPrivateKeyPage />);
    submit("Show Private Key");

    await screen.findByText(WIF);
    expect(wallet.revealSecret).toHaveBeenCalledWith({ walletId: "key-1", password: PASSWORD, kind: "privateKey" });
  });

  it("says the path is missing only when the background got past the password", async () => {
    params.value = { walletId: "mnemonic-1" };
    wallet.revealSecret.mockResolvedValueOnce(null);
    render(<ShowPrivateKeyPage />);
    submit("Show Private Key");
    await screen.findByText("Incorrect password.");

    wallet.revealSecret.mockRejectedValueOnce(new Error("The address derivation path is missing"));
    submit("Show Private Key");
    await screen.findByText("Address derivation path is missing.");
    expect(screen.queryByText(WIF)).toBeNull();
    expect(wallet.selectWallet).not.toHaveBeenCalled();
  });
});
