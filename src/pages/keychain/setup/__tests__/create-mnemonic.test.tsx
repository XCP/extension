import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateMnemonicPage from "../create-mnemonic";

const mockNavigate = vi.fn();
const mockSetHeaderProps = vi.fn();
const mockCreateMnemonicWallet = vi.fn();
const mockVerifyPassword = vi.fn();
const mockGenerateNewMnemonic = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/contexts/header-context", () => ({
  useHeader: () => ({
    setHeaderProps: mockSetHeaderProps,
  }),
}));

vi.mock("@/contexts/wallet-context", () => ({
  useWallet: () => ({
    keychainExists: false,
    createMnemonicWallet: mockCreateMnemonicWallet,
    verifyPassword: mockVerifyPassword,
  }),
}));

vi.mock("@/utils/blockchain/bitcoin/privateKey", () => ({
  generateNewMnemonic: () => mockGenerateNewMnemonic(),
}));

vi.mock("@/utils/fathom", () => ({
  analytics: {
    track: vi.fn(),
  },
}));

function getDisplayedMnemonic(): string {
  return screen
    .getAllByRole("listitem")
    .map((item) => item.textContent?.replace(/^\d+\.\s*/, "").trim())
    .join(" ");
}

describe("CreateMnemonicPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the wallet with the recovery phrase shown to the user", async () => {
    const savedMnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const secondMnemonic = "legal winner thank year wave sausage worth useful legal winner thank yellow";
    mockGenerateNewMnemonic
      .mockReturnValueOnce(savedMnemonic)
      .mockReturnValueOnce(secondMnemonic);

    render(<CreateMnemonicPage />);

    fireEvent.click(screen.getByRole("button", { name: "Reveal recovery phrase" }));
    const displayedMnemonic = getDisplayedMnemonic();

    fireEvent.click(screen.getByLabelText(/I have saved my secret recovery phrase/i));
    fireEvent.change(screen.getByPlaceholderText("Create a password"), {
      target: { value: "TestPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mockCreateMnemonicWallet).toHaveBeenCalledWith(displayedMnemonic, "TestPassword123!");
    });
  });
});
