import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PhishingWarning } from '../phishing-warning';

// Mock dependencies
vi.mock('@/utils/security/phishingDetection', () => ({
  analyzePhishingRisk: vi.fn()
}));

vi.mock('@/utils/fathom', () => ({
  trackEvent: vi.fn()
}));

vi.mock('react-icons/fa', () => ({
  FaExclamationTriangle: ({ className }: any) => <div data-testid="warning-icon" className={className} />,
  FaShieldAlt: ({ className }: any) => <div data-testid="shield-icon" className={className} />,
  FaTimes: ({ className }: any) => <div data-testid="close-icon" className={className} />
}));

import { analyzePhishingRisk } from '@/utils/security/phishingDetection';
import { trackEvent } from '@/utils/fathom';

describe('PhishingWarning', () => {
  const mockAnalyzePhishingRisk = analyzePhishingRisk as any;
  const mockTrackEvent = trackEvent as any;
  
  const defaultProps = {
    origin: 'https://suspicious-site.com',
    isOpen: true,
    onAccept: vi.fn(),
    onReject: vi.fn()
  };

  const mockAnalysis = {
    riskLevel: 'high',
    reasons: ['Suspicious domain', 'Similar to known phishing site'],
    suggestions: ['Verify the URL carefully'],
    trustedAlternative: 'trusted-site.com'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzePhishingRisk.mockReturnValue(mockAnalysis);
    mockTrackEvent.mockResolvedValue(undefined);
  });

  it('should not render when isOpen is false', () => {
    render(<PhishingWarning {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Security Warning')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    expect(screen.getByText('Security Warning')).toBeInTheDocument();
  });

  it('should display the hostname', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    expect(screen.getByText('suspicious-site.com', { exact: false })).toBeInTheDocument();
  });

  it('should display risk level badge', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    expect(screen.getByText('Risk Level: HIGH')).toBeInTheDocument();
  });

  it('should display critical risk level with appropriate styling', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      riskLevel: 'critical'
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    const badge = screen.getByText('Risk Level: CRITICAL');
    expect(badge).toHaveClass('text-red-600');
    expect(badge).toHaveClass('bg-red-50');
  });

  it('should display medium risk level with appropriate styling', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      riskLevel: 'medium'
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    const badge = screen.getByText('Risk Level: MEDIUM');
    expect(badge).toHaveClass('text-orange-500');
    expect(badge).toHaveClass('bg-orange-50');
  });

  it('should display low risk level with appropriate styling', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      riskLevel: 'low'
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    const badge = screen.getByText('Risk Level: LOW');
    expect(badge).toHaveClass('text-yellow-500');
    expect(badge).toHaveClass('bg-yellow-50');
  });

  it('should display trusted alternative when available', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    expect(screen.getByText('Did you mean to visit:')).toBeInTheDocument();
    expect(screen.getByText('trusted-site.com')).toBeInTheDocument();
  });

  it('should not display trusted alternative when not available', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      trustedAlternative: null
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    expect(screen.queryByText('Did you mean to visit:')).not.toBeInTheDocument();
  });

  it('should display first two reasons by default', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      reasons: ['Reason 1', 'Reason 2', 'Reason 3', 'Reason 4']
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    expect(screen.getByText('Reason 1')).toBeInTheDocument();
    expect(screen.getByText('Reason 2')).toBeInTheDocument();
    expect(screen.queryByText('Reason 3')).not.toBeInTheDocument();
  });

  it('should show "Show more" button when there are more than 2 reasons', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      reasons: ['Reason 1', 'Reason 2', 'Reason 3', 'Reason 4']
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    expect(screen.getByText('Show 2 more reason(s)')).toBeInTheDocument();
  });

  it('should expand to show all reasons when "Show more" is clicked', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      reasons: ['Reason 1', 'Reason 2', 'Reason 3', 'Reason 4']
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Show 2 more reason(s)'));
    
    expect(screen.getByText('Reason 3')).toBeInTheDocument();
    expect(screen.getByText('Reason 4')).toBeInTheDocument();
  });

  it('should show suggestions in detailed view', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      reasons: ['Reason 1', 'Reason 2', 'Reason 3'],
      suggestions: ['Check URL', 'Verify certificate']
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Show 1 more reason(s)'));
    
    expect(screen.getByText('Suggestions:')).toBeInTheDocument();
    expect(screen.getByText('Check URL')).toBeInTheDocument();
    expect(screen.getByText('Verify certificate')).toBeInTheDocument();
  });

  it('should collapse details when "Show less" is clicked', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      reasons: ['Reason 1', 'Reason 2', 'Reason 3']
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Show 1 more reason(s)'));
    expect(screen.getByText('Reason 3')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Show less'));
    expect(screen.queryByText('Reason 3')).not.toBeInTheDocument();
  });

  it('should display warning messages', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    // Look for the warning section with partial text matching
    expect(screen.getByText(/Warning:/)).toBeInTheDocument();
    
    // Look for warning items within the list (they have bullet points)
    expect(screen.getByText(/Theft of your wallet funds/)).toBeInTheDocument();
    expect(screen.getByText(/Exposure of transaction history/)).toBeInTheDocument();
    expect(screen.getByText(/Malicious transaction approvals/)).toBeInTheDocument();
    expect(screen.getByText(/Identity and privacy compromise/)).toBeInTheDocument();
  });

  it('should call onReject when close button is clicked', () => {
    const onReject = vi.fn();
    render(<PhishingWarning {...defaultProps} onReject={onReject} />);
    
    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);
    
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('should call onReject when "Stay Safe" button is clicked', async () => {
    const onReject = vi.fn();
    render(<PhishingWarning {...defaultProps} onReject={onReject} />);
    
    const staySafeButton = screen.getByText('Stay Safe');
    fireEvent.click(staySafeButton);
    
    await waitFor(() => {
      expect(onReject).toHaveBeenCalledTimes(1);
    });
  });

  it('should track rejection event', async () => {
    render(<PhishingWarning {...defaultProps} />);
    
    const staySafeButton = screen.getByText('Stay Safe');
    fireEvent.click(staySafeButton);
    
    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith('phishing_warning_rejected');
    });
  });

  it('should call onAccept when "Proceed Anyway" button is clicked', async () => {
    const onAccept = vi.fn();
    render(<PhishingWarning {...defaultProps} onAccept={onAccept} />);
    
    const proceedButton = screen.getByText('Proceed Anyway');
    fireEvent.click(proceedButton);
    
    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
  });

  it('should track acceptance event', async () => {
    render(<PhishingWarning {...defaultProps} />);
    
    const proceedButton = screen.getByText('Proceed Anyway');
    fireEvent.click(proceedButton);
    
    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith('phishing_warning_accepted');
    });
  });

  it('should display appropriate icon for high/critical risk', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      riskLevel: 'critical'
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    const warningIcon = screen.getAllByTestId('warning-icon')[0];
    expect(warningIcon).toHaveClass('text-red-500');
  });

  it('should display shield icon for medium/low risk', () => {
    mockAnalyzePhishingRisk.mockReturnValue({
      ...mockAnalysis,
      riskLevel: 'medium'
    });
    
    render(<PhishingWarning {...defaultProps} />);
    
    const shieldIcon = screen.getAllByTestId('shield-icon')[0];
    expect(shieldIcon).toHaveClass('text-orange-500');
  });

  it('should have correct button icons', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    // Find buttons by their text content
    const staySafeButton = screen.getByRole('button', { name: /stay safe/i });
    const proceedButton = screen.getByRole('button', { name: /proceed anyway/i });
    
    // Check that they exist (buttons with icons)
    expect(staySafeButton).toBeInTheDocument();
    expect(proceedButton).toBeInTheDocument();
    
    // Shield and warning icons should both be in the document
    const shieldIcons = screen.getAllByTestId('shield-icon');
    const warningIcons = screen.getAllByTestId('warning-icon');
    
    // There should be at least one of each type (header icon + button icon)
    expect(shieldIcons.length).toBeGreaterThan(0);
    expect(warningIcons.length).toBeGreaterThan(0);
  });

  it('should display footer message', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    expect(screen.getByText('This warning helps protect you from phishing attacks. Always verify URLs carefully.')).toBeInTheDocument();
  });

  it('should analyze risk on mount', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    expect(mockAnalyzePhishingRisk).toHaveBeenCalledWith('https://suspicious-site.com');
  });

  it('should handle URLs without protocol', () => {
    mockAnalyzePhishingRisk.mockReturnValue(mockAnalysis);
    
    render(<PhishingWarning {...defaultProps} origin="suspicious-site.com" />);
    
    // Should handle gracefully even though URL constructor might fail
    expect(screen.getByText('Security Warning')).toBeInTheDocument();
  });

  it('should render Dialog backdrop', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    // Find the backdrop by its class (but without escaping the slash)
    const backdrops = document.querySelectorAll('.fixed.inset-0');
    
    // Find the one with bg-black/30 class
    let backdrop = null;
    backdrops.forEach(el => {
      if (el.classList.contains('bg-black/30')) {
        backdrop = el;
      }
    });
    
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  });

  it('should center dialog panel', () => {
    render(<PhishingWarning {...defaultProps} />);
    
    // Find the container with centering classes
    const containers = document.querySelectorAll('.fixed.inset-0');
    
    // Find the one with flex centering classes
    let dialogContainer = null;
    containers.forEach(el => {
      if (el.classList.contains('flex') && 
          el.classList.contains('items-center') && 
          el.classList.contains('justify-center')) {
        dialogContainer = el;
      }
    });
    
    expect(dialogContainer).toBeInTheDocument();
  });
});