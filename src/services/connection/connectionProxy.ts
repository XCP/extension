/**
 * ConnectionService Proxy - Cross-context communication
 * 
 * Provides type-safe access to ConnectionService from popup/content contexts
 */

import { defineProxyService } from '@webext-core/proxy-service';
import { ConnectionService } from './ConnectionService';

export const [registerConnectionService, getConnectionService] = defineProxyService(
  'ConnectionService',
  () => new ConnectionService()
);