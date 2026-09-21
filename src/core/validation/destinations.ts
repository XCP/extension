/**
 * Validation utilities for destination addresses and multi-destination inputs
 */

import { validateBitcoinAddress } from '@/core/validation/bitcoin';

export interface Destination {
  id: number;
  address: string;
}

export interface DestinationValidationResult {
  errors: { [id: number]: string };
  duplicates: Set<string>;
  isValid: boolean;
}

/**
 * Validate an array of destinations for errors and duplicates
 */
export function validateDestinations(destinations: Destination[]): DestinationValidationResult {
  const errors: { [id: number]: string } = {};
  const addressCounts = new Map<string, number>();
  const duplicates = new Set<string>();
  
  // Count occurrences and validate each destination
  destinations.forEach(dest => {
    if (!dest.address) return;
    
    const lowerAddress = dest.address.toLowerCase();
    
    // Count occurrences
    const count = (addressCounts.get(lowerAddress) || 0) + 1;
    addressCounts.set(lowerAddress, count);
    
    // Track duplicates
    if (count > 1) {
      duplicates.add(lowerAddress);
    }
    
    // Validate address format
    const validation = validateBitcoinAddress(dest.address);
    if (!validation.isValid) {
      errors[dest.id] = validation.error || 'Invalid Bitcoin address';
    } else if (count > 1) {
      errors[dest.id] = 'Duplicate address';
    }
  });
  
  // Check if all destinations have addresses
  const hasAllAddresses = destinations.every(dest => dest.address);
  const hasErrors = Object.keys(errors).length > 0;
  
  return {
    errors,
    duplicates,
    isValid: !hasErrors && hasAllAddresses
  };
}

/**
 * Check if destinations are ready for submission
 */
export function areDestinationsComplete(destinations: Destination[]): boolean {
  return destinations.length > 0 && 
         destinations.every(dest => dest.address && dest.address.trim() !== '');
}

/**
 * Hard protocol limit on the number of MPMA destinations in one transaction.
 */
export const MAX_DESTINATIONS = 1000;

/**
 * Count at which the UI starts warning that the limit is close.
 */
export const DESTINATION_WARNING_THRESHOLD = 900;

/**
 * Where a destination count sits relative to the protocol limit.
 * 'approaching' only warns; 'at-limit' blocks adding more destinations.
 */
export type DestinationLimitState = 'ok' | 'approaching' | 'at-limit';

/**
 * Classify a destination count against the protocol limit.
 */
export function getDestinationLimitState(count: number): DestinationLimitState {
  if (count >= MAX_DESTINATIONS) {
    return 'at-limit';
  }

  if (count >= DESTINATION_WARNING_THRESHOLD) {
    return 'approaching';
  }

  return 'ok';
}

/**
 * Validate destination count limits
 */
export function validateDestinationCount(count: number): { isValid: boolean; error?: string } {
  if (count < 1) {
    return { isValid: false, error: 'At least one destination is required' };
  }

  if (count > MAX_DESTINATIONS) {
    return { isValid: false, error: `Maximum ${MAX_DESTINATIONS} destinations allowed` };
  }

  return { isValid: true };
}

/**
 * Parse multi-line paste input into destinations
 */
export function parseMultiLineDestinations(text: string): string[] {
  return text
    .split(/[\n\r]+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Check if MPMA (Multi-Party Multi-Asset) is supported
 */
export function isMPMASupported(asset: string): boolean {
  // BTC doesn't support MPMA
  return asset !== 'BTC';
}