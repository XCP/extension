/**
 * ConnectionService Proxy - Cross-context communication
 * 
 * Provides type-safe access to ConnectionService from popup/content contexts
 */

import { defineProxyService } from '@/utils/proxy';
import { ConnectionService } from './ConnectionService';

export const [registerConnectionService, getConnectionService] = defineProxyService(
  'ConnectionService',
  () => new ConnectionService()
);