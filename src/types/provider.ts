/**
 * Provider domain types
 *
 * Types for dApp provider integration, approval workflows,
 * and connection management.
 */

/**
 * A queued approval request from a dApp.
 */
export interface ApprovalRequest {
  id: string;
  origin: string;
  method: string;
  params: any;
  timestamp: number;
  /** Only connections are approved this way; signing has its own flow in signFlow.ts. */
  type: 'connection';
  metadata?: {
    domain?: string;
    title?: string;
    description?: string;
    warning?: boolean;
  };
}

/**
 * Options for creating an approval request.
 */
export interface ApprovalRequestOptions {
  id: string;
  origin: string;
  method: string;
  params: any[];
  type: 'connection';
  metadata: {
    domain: string;
    title: string;
    description: string;
    warning?: boolean;
  };
}

/**
 * Result of an approval request.
 */
export interface ApprovalResult {
  approved: boolean;
  updatedParams?: any;
}
