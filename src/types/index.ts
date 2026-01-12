/**
 * Centralized type exports
 *
 * Import types from here for cleaner imports:
 *   import type { Wallet, Address } from '@/types';
 *   import type { ApprovalRequest } from '@/types';
 */

// Wallet domain
export type { Address, Wallet } from './wallet';

// Provider domain
export type {
  ApprovalRequest,
  ApprovalRequestOptions,
  ApprovalResult,
} from './provider';
