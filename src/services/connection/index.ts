/**
 * Connection Service - dApp connection and permission management
 */

export { ConnectionService } from './ConnectionService';
export { registerConnectionService, getConnectionService } from './connectionProxy';
export type { ConnectionStatus, ConnectionPermissionRequest } from './ConnectionService';