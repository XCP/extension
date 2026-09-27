import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asDisplayUnits } from '@/core/numeric';
import { AssetMenu } from './asset-menu';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

let latestIssuance: Record<string, unknown> | null = null;
vi.mock('@/hooks/useAssetLatestIssuance', () => ({
  useAssetLatestIssuance: () => ({ isLoading: false, error: null, data: latestIssuance }),
}));

describe('AssetMenu', () => {
  const unlockedAsset = {
    asset: 'TESTASSET',
    asset_longname: null,
    supply_normalized: asDisplayUnits('1000000'),
    description: 'Test Asset',
    locked: false
  };

  const lockedAsset = {
    asset: 'LOCKEDASSET',
    asset_longname: null,
    supply_normalized: asDisplayUnits('1000000'),
    description: 'Locked Asset',
    locked: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    latestIssuance = null;
  });

  const openMenu = (ownedAsset: Parameters<typeof AssetMenu>[0]['ownedAsset']) => {
    render(
      <MemoryRouter>
        <AssetMenu ownedAsset={ownedAsset} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button'));
  };

  // Core refuses these the same way the asset page already hides them (`issuance.validate`).
  describe('offers only what core accepts', () => {
    it('hides Change Description once the description is locked', async () => {
      openMenu({ ...unlockedAsset, description_locked: true });

      await waitFor(() => expect(screen.getByText('Transfer Ownership')).toBeInTheDocument());
      expect(screen.getByText('Issue Supply')).toBeInTheDocument();
      expect(screen.queryByText('Change Description')).not.toBeInTheDocument();
    });

    it('hides Change Description when the latest issuance locked it', async () => {
      latestIssuance = { locked: false, description_locked: true, fair_minting: false };
      openMenu(unlockedAsset);

      await waitFor(() => expect(screen.getByText('Transfer Ownership')).toBeInTheDocument());
      expect(screen.queryByText('Change Description')).not.toBeInTheDocument();
    });

    it('offers nothing to reissue while a fairminter is live', async () => {
      latestIssuance = { locked: false, description_locked: false, fair_minting: true };
      openMenu(unlockedAsset);

      await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
      for (const label of ['Issue Supply', 'Lock Supply', 'Change Description', 'Transfer Ownership']) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
    });
  });

  it('should render menu button', () => {
    render(
      <MemoryRouter>
        <AssetMenu ownedAsset={unlockedAsset} />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    expect(menuButton).toBeInTheDocument();
  });

  it('should show all options for unlocked asset', async () => {
    render(
      <MemoryRouter>
        <AssetMenu ownedAsset={unlockedAsset} />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Issue Supply')).toBeInTheDocument();
      expect(screen.getByText('Lock Supply')).toBeInTheDocument();
      expect(screen.getByText('Change Description')).toBeInTheDocument();
      expect(screen.getByText('Transfer Ownership')).toBeInTheDocument();
    });
  });

  it('should show limited options for locked asset', async () => {
    render(
      <MemoryRouter>
        <AssetMenu ownedAsset={lockedAsset} />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.queryByText('Issue Supply')).not.toBeInTheDocument();
      expect(screen.queryByText('Lock Supply')).not.toBeInTheDocument();
      expect(screen.getByText('Change Description')).toBeInTheDocument();
      expect(screen.getByText('Transfer Ownership')).toBeInTheDocument();
    });
  });

  it('should navigate to issue supply page when clicked', async () => {
    render(
      <MemoryRouter>
        <AssetMenu ownedAsset={unlockedAsset} />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const issueButton = screen.getByText('Issue Supply');
      fireEvent.click(issueButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/compose/issuance/issue-supply/TESTASSET');
  });

  it('should navigate to lock supply page when clicked', async () => {
    render(
      <MemoryRouter>
        <AssetMenu ownedAsset={unlockedAsset} />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const lockButton = screen.getByText('Lock Supply');
      fireEvent.click(lockButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/compose/issuance/lock-supply/TESTASSET');
  });

  it('should navigate to update description page when clicked', async () => {
    render(
      <MemoryRouter>
        <AssetMenu ownedAsset={lockedAsset} />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const updateButton = screen.getByText('Change Description');
      fireEvent.click(updateButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/compose/issuance/update-description/LOCKEDASSET');
  });

  it('should navigate to transfer ownership page when clicked', async () => {
    render(
      <MemoryRouter>
        <AssetMenu ownedAsset={lockedAsset} />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const transferButton = screen.getByText('Transfer Ownership');
      fireEvent.click(transferButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/compose/issuance/transfer-ownership/LOCKEDASSET');
  });

  it('should stop event propagation when menu is clicked', () => {
    const mockOnClick = vi.fn();
    
    render(
      <div role="presentation" onClick={mockOnClick}>
        <MemoryRouter>
          <AssetMenu ownedAsset={unlockedAsset} />
        </MemoryRouter>
      </div>
    );

    // Find the menu container div instead of the button
    const menuContainer = screen.getByRole('button').closest('div[class*="relative"]');
    if (menuContainer) {
      fireEvent.click(menuContainer);
    }

    // Parent click should not be triggered
    expect(mockOnClick).not.toHaveBeenCalled();
  });
});