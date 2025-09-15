/**
 * ApprovalService Proxy - Cross-context communication
 * 
 * Provides type-safe access to ApprovalService from popup/content contexts
 */

import { defineProxyService } from '@/utils/proxy';
import { ApprovalService } from './ApprovalService';

export const [registerApprovalService, getApprovalService] = defineProxyService(
  'ApprovalService',
  () => new ApprovalService()
);