/**
 * TransactionService Proxy - Cross-context communication
 * 
 * Provides type-safe access to TransactionService from popup/content contexts
 */

import { defineProxyService } from '@/utils/proxy';
import { TransactionService } from './TransactionService';

export const [registerTransactionService, getTransactionService] = defineProxyService(
  'TransactionService',
  () => new TransactionService()
);