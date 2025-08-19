/**
 * Phishing Detection Utilities
 * 
 * Provides domain verification using trusted and blocked domain lists.
 * Helps protect users from known phishing sites targeting Web3 users.
 */

import { trackEvent } from '@/utils/fathom';

// Trusted domains - these are known legitimate sites
const TRUSTED_DOMAINS = new Set([
  'xcp.io',
  'xcpdex.com',
  'xcpfolio.com',
  'counterparty.io',
  'xchain.io',
  'tokenscan.io',
  'horizon.market',
  'unspendablelabs.com'
]);

// Known phishing domains - this list can be updated dynamically
const BLOCKED_DOMAINS = new Set([
  'xcpf0lio.com',
  // Add more known phishing domains here
]);

export interface PhishingAnalysis {
  isSuspicious: boolean;
  isBlocked: boolean;
  isTrusted: boolean;
  riskLevel: 'trusted' | 'unknown' | 'blocked' | 'critical' | 'high' | 'medium' | 'low';
  message?: string;
  trustedAlternative?: string | null;
  reasons?: string[];
  suggestions?: string[];
}

/**
 * Extract hostname from a URL string
 */
function extractHostname(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Analyze domain for phishing risk using domain lists
 */
export function analyzePhishingRisk(origin: string): PhishingAnalysis {
  const hostname = extractHostname(origin);
  
  if (!hostname) {
    return {
      isSuspicious: true,
      isBlocked: false,
      isTrusted: false,
      riskLevel: 'unknown',
      message: 'Invalid URL format - unable to verify domain safety'
    };
  }
  
  // Check if domain is explicitly trusted
  if (TRUSTED_DOMAINS.has(hostname)) {
    return {
      isSuspicious: false,
      isBlocked: false,
      isTrusted: true,
      riskLevel: 'trusted',
      message: 'This is a verified trusted domain'
    };
  }
  
  // Check if domain is explicitly blocked
  if (BLOCKED_DOMAINS.has(hostname)) {
    return {
      isSuspicious: true,
      isBlocked: true,
      isTrusted: false,
      riskLevel: 'blocked',
      message: 'Warning: This domain is on the phishing blocklist. Do not connect to this site.'
    };
  }
  
  // Unknown domain - not explicitly trusted or blocked
  return {
    isSuspicious: false,
    isBlocked: false,
    isTrusted: false,
    riskLevel: 'unknown',
    message: 'This domain is not on the trusted list. Verify the URL carefully before connecting.'
  };
}

/**
 * Update the trusted domains list
 */
export function updateTrustedDomains(domains: string[]): void {
  domains.forEach(domain => {
    const normalized = domain.toLowerCase().trim();
    if (normalized) {
      TRUSTED_DOMAINS.add(normalized);
    }
  });
}

/**
 * Update the blocked domains list
 */
export function updateBlockedDomains(domains: string[]): void {
  domains.forEach(domain => {
    const normalized = domain.toLowerCase().trim();
    if (normalized) {
      BLOCKED_DOMAINS.add(normalized);
    }
  });
}

/**
 * Get current trusted domains
 */
export function getTrustedDomains(): string[] {
  return Array.from(TRUSTED_DOMAINS).sort();
}

/**
 * Get current blocked domains
 */
export function getBlockedDomains(): string[] {
  return Array.from(BLOCKED_DOMAINS).sort();
}

/**
 * Remove domain from trusted list
 */
export function removeTrustedDomain(domain: string): boolean {
  return TRUSTED_DOMAINS.delete(domain.toLowerCase().trim());
}

/**
 * Remove domain from blocked list
 */
export function removeBlockedDomain(domain: string): boolean {
  return BLOCKED_DOMAINS.delete(domain.toLowerCase().trim());
}

/**
 * Check if connection should be blocked
 */
export async function shouldBlockConnection(origin: string): Promise<boolean> {
  const analysis = analyzePhishingRisk(origin);
  
  // Track phishing detection events
  if (analysis.isBlocked) {
    await trackEvent('phishing_blocked');
  }
  
  return analysis.isBlocked;
}

/**
 * Get warning message for domains
 */
export function getPhishingWarning(origin: string): string | null {
  const analysis = analyzePhishingRisk(origin);
  
  if (analysis.isBlocked) {
    return `⚠️ SECURITY WARNING\n\nThis domain is on the phishing blocklist.\nDo not connect to this site or enter any sensitive information.\n\nIf you believe this is an error, please verify the URL carefully.`;
  }
  
  if (analysis.riskLevel === 'unknown') {
    return `⚠️ Unknown Domain\n\nThis domain is not on our trusted list.\nPlease verify the URL carefully before connecting.\n\nCommon trusted domains include:\n${Array.from(TRUSTED_DOMAINS).slice(0, 5).join(', ')}`;
  }
  
  return null;
}

/**
 * Load domain lists from remote source (for future use)
 * This could fetch updated lists from a CDN or API endpoint
 */
export async function loadDomainLists(endpoint?: string): Promise<void> {
  if (!endpoint) return;
  
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return;
    
    const data = await response.json();
    
    if (data.trusted && Array.isArray(data.trusted)) {
      updateTrustedDomains(data.trusted);
    }
    
    if (data.blocked && Array.isArray(data.blocked)) {
      updateBlockedDomains(data.blocked);
    }
  } catch (error) {
    console.error('Failed to load domain lists:', error);
  }
}