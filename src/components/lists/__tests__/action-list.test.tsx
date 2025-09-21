import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FiUser, FiLock } from 'react-icons/fi';
import { ActionList, type ActionSection } from '../action-list';

// Mock the ActionCard component
vi.mock('@/components/cards/action-card', () => ({
  ActionCard: ({ title, description, onClick, icon, showChevron, className, ariaLabel }: any) => (
    <div
      data-testid={`action-card-${title}`}
      className={`action-card ${className || ''}`}
      onClick={onClick}
      aria-label={ariaLabel || title}
    >
      <div className="title">{title}</div>
      {description && <div className="description">{description}</div>}
      {icon && <div className="icon">{icon}</div>}
      {showChevron !== false && <div className="chevron">→</div>}
    </div>
  )
}));

describe('ActionList', () => {
  const mockOnClickAccount = vi.fn();
  const mockOnClickProfile = vi.fn();
  const mockOnClickSecurity = vi.fn();
  const mockOnClickPrivacy = vi.fn();

  const mockSections: ActionSection[] = [
    {
      title: 'Account',
      items: [
        {
          id: 'profile',
          title: 'Profile Settings',
          description: 'Update your profile information',
          onClick: mockOnClickProfile,
          icon: <FiUser data-testid="profile-icon" />
        },
        {
          id: 'account-settings',
          title: 'Account Settings',
          onClick: mockOnClickAccount,
          showChevron: false
        }
      ]
    },
    {
      title: 'Security',
      items: [
        {
          id: 'security',
          title: 'Security Settings',
          description: 'Change your password and security preferences',
          onClick: mockOnClickSecurity,
          icon: <FiLock data-testid="security-icon" />,
          ariaLabel: 'Security settings page'
        }
      ],
      className: 'security-section'
    },
    {
      items: [
        {
          id: 'privacy',
          title: 'Privacy Settings',
          onClick: mockOnClickPrivacy,
          className: 'privacy-card'
        }
      ]
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all sections and items correctly', () => {
    render(<ActionList sections={mockSections} />);

    // Check section headers
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();

    // Check action items
    expect(screen.getByTestId('action-card-Profile Settings')).toBeInTheDocument();
    expect(screen.getByTestId('action-card-Account Settings')).toBeInTheDocument();
    expect(screen.getByTestId('action-card-Security Settings')).toBeInTheDocument();
    expect(screen.getByTestId('action-card-Privacy Settings')).toBeInTheDocument();
  });

  it('renders section without title (headerless section)', () => {
    render(<ActionList sections={mockSections} />);

    // The third section has no title, but should still render its items
    expect(screen.getByTestId('action-card-Privacy Settings')).toBeInTheDocument();
  });

  it('passes all props correctly to ActionCard components', () => {
    render(<ActionList sections={mockSections} />);

    // Check that title and description are rendered
    expect(screen.getByText('Profile Settings')).toBeInTheDocument();
    expect(screen.getByText('Update your profile information')).toBeInTheDocument();
    expect(screen.getByText('Change your password and security preferences')).toBeInTheDocument();

    // Check that icons are rendered
    expect(screen.getByTestId('profile-icon')).toBeInTheDocument();
    expect(screen.getByTestId('security-icon')).toBeInTheDocument();

    // Check that showChevron prop is respected
    const accountCard = screen.getByTestId('action-card-Account Settings');
    expect(accountCard.querySelector('.chevron')).not.toBeInTheDocument();

    const profileCard = screen.getByTestId('action-card-Profile Settings');
    expect(profileCard.querySelector('.chevron')).toBeInTheDocument();
  });

  it('applies custom className to sections', () => {
    render(<ActionList sections={mockSections} />);

    const securitySection = screen.getByText('Security').parentElement;
    expect(securitySection).toHaveClass('security-section');
  });

  it('applies custom className to action cards', () => {
    render(<ActionList sections={mockSections} />);

    const privacyCard = screen.getByTestId('action-card-Privacy Settings');
    expect(privacyCard).toHaveClass('privacy-card');
  });

  it('calls onClick handlers when action cards are clicked', () => {
    render(<ActionList sections={mockSections} />);

    fireEvent.click(screen.getByTestId('action-card-Profile Settings'));
    expect(mockOnClickProfile).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('action-card-Security Settings'));
    expect(mockOnClickSecurity).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('action-card-Privacy Settings'));
    expect(mockOnClickPrivacy).toHaveBeenCalledTimes(1);
  });

  it('passes ariaLabel correctly', () => {
    render(<ActionList sections={mockSections} />);

    const securityCard = screen.getByTestId('action-card-Security Settings');
    expect(securityCard).toHaveAttribute('aria-label', 'Security settings page');
  });

  it('applies default className when none provided', () => {
    const { container } = render(<ActionList sections={mockSections} />);

    const listContainer = container.firstChild;
    expect(listContainer).toHaveClass('space-y-6');
  });

  it('applies custom className to container', () => {
    const { container } = render(
      <ActionList sections={mockSections} className="custom-container" />
    );

    const listContainer = container.firstChild;
    expect(listContainer).toHaveClass('custom-container');
  });

  it('applies custom section spacing', () => {
    const { container } = render(
      <ActionList sections={mockSections} sectionSpacing="space-y-8" />
    );

    const sectionContainer = container.querySelector('.space-y-8');
    expect(sectionContainer).toBeInTheDocument();
  });

  it('applies custom item spacing', () => {
    render(<ActionList sections={mockSections} itemSpacing="space-y-4" />);

    // Check that sections with items have the custom spacing
    const accountSection = screen.getByText('Account').parentElement;
    const itemContainer = accountSection?.querySelector('.space-y-4');
    expect(itemContainer).toBeInTheDocument();
  });

  it('handles empty sections gracefully', () => {
    const emptySections: ActionSection[] = [
      {
        title: 'Empty Section',
        items: []
      }
    ];

    render(<ActionList sections={emptySections} />);

    expect(screen.getByText('Empty Section')).toBeInTheDocument();
    // No action cards should be rendered
    expect(screen.queryByText('action-card-')).not.toBeInTheDocument();
  });

  it('generates unique keys for sections', () => {
    const sectionsWithoutTitles: ActionSection[] = [
      {
        items: [
          { id: 'item1', title: 'Item 1', onClick: vi.fn() }
        ]
      },
      {
        items: [
          { id: 'item2', title: 'Item 2', onClick: vi.fn() }
        ]
      }
    ];

    // Should not throw errors about duplicate keys
    expect(() => render(<ActionList sections={sectionsWithoutTitles} />)).not.toThrow();
    expect(screen.getByTestId('action-card-Item 1')).toBeInTheDocument();
    expect(screen.getByTestId('action-card-Item 2')).toBeInTheDocument();
  });

  it('has proper semantic structure', () => {
    render(<ActionList sections={mockSections} />);

    // Check that section titles are rendered as h2 headings
    const accountHeading = screen.getByRole('heading', { name: 'Account', level: 2 });
    expect(accountHeading).toBeInTheDocument();

    const securityHeading = screen.getByRole('heading', { name: 'Security', level: 2 });
    expect(securityHeading).toBeInTheDocument();
  });

  it('applies correct section header styles', () => {
    render(<ActionList sections={mockSections} />);

    const accountHeading = screen.getByText('Account');
    expect(accountHeading).toHaveClass('text-sm', 'font-medium', 'text-gray-500', 'px-4', 'mb-2');
  });
});