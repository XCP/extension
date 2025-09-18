/**
 * Blockchain Service Proxy
 *
 * Provides a bridge for using BlockchainService across different extension contexts
 * (background, popup, content scripts) using the standard proxy pattern.
 *
 * This follows the same pattern as all other services in the extension.
 */

import { defineProxyService } from '@/utils/proxy';
import { BlockchainService } from './BlockchainService';

// Create and export the proxy service
export const [registerBlockchainService, getBlockchainService] = defineProxyService(
  'BlockchainService',
  () => new BlockchainService()
);