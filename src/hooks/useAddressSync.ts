import { useState, useCallback, useEffect, useRef } from 'react';
import api from '@/utils/fetch';

interface SyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'error';
  message?: string;
  progress?: number;
  estimatedSeconds?: number;
  summary?: {
    total_utxos: number;
    claimable_utxos: number;
    claimable_value_sats: number;
    last_indexed_at?: string;
  };
}

interface UseAddressSyncOptions {
  onComplete?: (summary: SyncStatus['summary']) => void;
  onError?: (error: string) => void;
  pollInterval?: number; // milliseconds
}

export function useAddressSync(
  address: string | undefined,
  options: UseAddressSyncOptions = {}
) {
  const { 
    onComplete, 
    onError, 
    pollInterval = 2000 // Poll every 2 seconds by default
  } = options;
  
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ status: 'idle' });
  const [isStale, setIsStale] = useState(false);
  const syncIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);
  
  // Check if data is stale (e.g., last sync > 1 hour ago)
  const checkDataFreshness = useCallback(async () => {
    if (!address) return;
    
    try {
      // First try to get consolidation data
      const response = await api.get(
        `https://app.xcp.io/api/v1/address/${address}/consolidation`
      );
      
      // Check if we got an indexing response (202)
      if (response.status === 202) {
        setIsStale(true);
        return;
      }
      
      // Check if data exists and when it was last updated
      const data = response;
      if (!data.utxos || data.utxos.length === 0) {
        // No data yet, probably needs indexing
        setIsStale(true);
      } else if (data.last_indexed_at) {
        // Check if data is older than 1 hour
        const lastIndexed = new Date(data.last_indexed_at);
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        setIsStale(lastIndexed < hourAgo);
      } else {
        // Has data but no timestamp, consider it potentially stale
        setIsStale(true);
      }
    } catch (error) {
      // If we get 202, data is being indexed
      if (api.isApiError(error) && error.response?.status === 202) {
        setIsStale(true);
        // Auto-trigger sync since it's already started
        setSyncStatus({
          status: 'syncing',
          message: error.response.data.message || 'Indexing in progress',
          progress: 10
        });
      }
    }
  }, [address]);
  
  // Poll for sync status
  const pollStatus = useCallback(async (syncId: string) => {
    try {
      const response = await api.get(
        `https://app.xcp.io/api/v1/sync/${syncId}/status`
      );

      const data = response;
      
      if (data.status === 'completed') {
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        
        setSyncStatus({
          status: 'completed',
          message: 'Sync completed successfully',
          progress: 100,
          summary: data.summary
        });
        
        // Call completion handler
        if (onComplete && data.summary) {
          onComplete(data.summary);
        }
        
        // Clear stale flag
        setIsStale(false);
        
        // Clear sync ID
        syncIdRef.current = null;
      } else {
        // Update progress
        setSyncStatus({
          status: 'syncing',
          message: data.message,
          progress: data.progress,
          estimatedSeconds: data.estimated_seconds
        });
      }
    } catch (error) {
      console.error('Error polling sync status:', error);
      
      // Don't stop polling on transient errors
      // But increment error count and stop after too many
    }
  }, [onComplete]);
  
  // Trigger sync
  const triggerSync = useCallback(async () => {
    if (!address) {
      onError?.('No address provided');
      return;
    }
    
    // Clear any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    setSyncStatus({
      status: 'syncing',
      message: 'Starting sync...',
      progress: 0
    });
    
    try {
      const response = await api.post(
        `https://app.xcp.io/api/v1/address/${address}/sync`
      );

      const { sync_id, message, estimated_seconds } = response;
      
      // Store sync ID
      syncIdRef.current = sync_id;
      
      // Update status
      setSyncStatus({
        status: 'syncing',
        message,
        progress: 10,
        estimatedSeconds: estimated_seconds
      });
      
      // Start polling
      pollIntervalRef.current = setInterval(() => {
        if (syncIdRef.current) {
          pollStatus(syncIdRef.current);
        }
      }, pollInterval);
      
      // Do initial poll immediately
      pollStatus(sync_id);
      
    } catch (error) {
      console.error('Error triggering sync:', error);
      
      setSyncStatus({
        status: 'error',
        message: api.isApiError(error)
          ? error.response?.data?.error || 'Failed to start sync'
          : 'Failed to start sync'
      });
      
      if (onError) {
        onError(syncStatus.message || 'Sync failed');
      }
    }
  }, [address, pollInterval, pollStatus, onError]);
  
  // Auto-check freshness on mount and address change
  useEffect(() => {
    checkDataFreshness();
  }, [address, checkDataFreshness]);
  
  return {
    syncStatus,
    isStale,
    triggerSync,
    isSyncing: syncStatus.status === 'syncing',
    isComplete: syncStatus.status === 'completed',
    hasError: syncStatus.status === 'error'
  };
}