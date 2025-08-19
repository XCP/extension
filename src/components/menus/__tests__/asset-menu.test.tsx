import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AssetMenu } from '../asset-menu';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('AssetMenu', () => {
  const unlockedAsset = {
    asset: 'TESTASSET',
    asset_longname: null,
    supply_normalized: '1000000',
    description: 'Test Asset',
    locked: false
  };

  const lockedAsset = {
    asset: 'LOCKEDASSET',
    asset_longname: null,
    supply_normalized: '1000000',
    description: 'Locked Asset',
    locked: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
      <div onClick={mockOnClick}>
        <MemoryRouter>
          <AssetMenu ownedAsset={unlockedAsset} />
        </MemoryRouter>
      </div>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    // Parent click should not be triggered
    expect(mockOnClick).not.toHaveBeenCalled();
  });
});