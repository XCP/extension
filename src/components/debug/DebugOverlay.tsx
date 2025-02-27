import React, { useState, useEffect } from 'react';
import { useIdleTimer } from 'react-idle-timer';
import { useWallet } from '@/contexts/wallet-context';
import { useSettings } from '@/contexts/settings-context';
import { FaBug, FaTimes, FaSync, FaLock, FaKey } from 'react-icons/fa';

// Local storage key for debug overlay state
const DEBUG_OVERLAY_EXPANDED_KEY = 'debug-overlay-expanded';

/**
 * Debug overlay component that displays wallet status and time until auto-lock
 */
export function DebugOverlay() {
  const { walletLocked, activeWallet, lockAll, unlockWallet, setLastActiveTime } = useWallet();
  const { settings } = useSettings();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    // Initialize from localStorage if available
    const savedState = localStorage.getItem(DEBUG_OVERLAY_EXPANDED_KEY);
    return savedState ? JSON.parse(savedState) : false;
  });
  const [actualLockStatus, setActualLockStatus] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [showPasswordInput, setShowPasswordInput] = useState<boolean>(false);

  // Use the idle timer to get the remaining time
  const { getRemainingTime, reset: resetIdleTimer } = useIdleTimer({
    timeout: settings.autoLockTimeout,
    throttle: 500
  });

  // Update the time remaining every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(Math.floor(getRemainingTime() / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [getRemainingTime]);

  // Save expanded state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(DEBUG_OVERLAY_EXPANDED_KEY, JSON.stringify(isExpanded));
  }, [isExpanded]);

  // Check actual wallet authorization status
  const checkActualLockStatus = async () => {
    if (!activeWallet) {
      setActualLockStatus(true); // No active wallet means effectively locked
      return;
    }

    setIsRefreshing(true);
    try {
      // A more reliable way to check if the wallet is locked
      // Try to get the private key for the first address
      // This will throw an error if the wallet is locked
      try {
        // We're not actually using the private key, just checking if we can access it
        // This is the same operation that happens during signing
        await unlockWallet(activeWallet.id, ''); // This will fail if wallet is locked, which is what we want
        setActualLockStatus(false); // If we get here, wallet is unlocked
      } catch (error) {
        // If we get an error that doesn't mention "incorrect password", it means the wallet is locked
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('incorrect password')) {
          // This means the wallet is unlocked but we provided a wrong password
          setActualLockStatus(false);
        } else {
          // Any other error means the wallet is locked
          setActualLockStatus(true);
        }
      }
    } catch (error) {
      console.error('Failed to check wallet status:', error);
      setActualLockStatus(null);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Format the time remaining as mm:ss
  const formatTimeRemaining = () => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format the timeout setting as minutes
  const formatTimeoutSetting = () => {
    return `${Math.floor(settings.autoLockTimeout / 60000)}m`;
  };

  // Toggle the expanded state
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      // Check actual lock status when expanding
      checkActualLockStatus();
    }
  };

  // Handle authorization attempt
  const handleUnlock = async () => {
    if (!activeWallet || !password) return;
    
    setIsRefreshing(true);
    try {
      await unlockWallet(activeWallet.id, password);
      setActualLockStatus(false);
      setLastActiveTime(); // Update the last active time
      resetIdleTimer(); // Reset the idle timer
      setShowPasswordInput(false);
      setPassword('');
    } catch (error) {
      console.error('Failed to authorize wallet:', error);
      alert('Failed to authorize wallet. Check your password.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle lock
  const handleLock = async () => {
    setIsRefreshing(true);
    try {
      await lockAll();
      setActualLockStatus(true);
    } catch (error) {
      console.error('Failed to lock wallet:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get status display text
  const getStatusText = (isLocked: boolean) => {
    return isLocked ? 'NEEDS AUTH' : 'AUTHORIZED';
  };

  return (
    <div className="fixed bottom-0 left-0 z-50 m-2">
      {isExpanded ? (
        <div className="p-2 text-xs font-mono bg-black bg-opacity-75 text-white rounded shadow">
          <div className="flex justify-between items-center mb-1">
            <span className="font-bold">Debug Info</span>
            <div className="flex gap-2">
              <button 
                onClick={checkActualLockStatus}
                className={`text-gray-400 hover:text-white transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
                aria-label="Refresh wallet status"
                disabled={isRefreshing}
              >
                <FaSync />
              </button>
              <button 
                onClick={toggleExpanded}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Close debug overlay"
              >
                <FaTimes />
              </button>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex justify-between gap-4">
              <span>UI Status:</span>
              <span className={walletLocked ? 'text-red-400' : 'text-green-400'}>
                {getStatusText(walletLocked)}
              </span>
            </div>
            {actualLockStatus !== null && (
              <div className="flex justify-between gap-4">
                <span>Actual Status:</span>
                <span className={actualLockStatus ? 'text-red-400' : 'text-green-400'}>
                  {getStatusText(actualLockStatus)}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span>Session expires:</span>
              <span className={timeRemaining < 30 ? 'text-red-400' : 'text-yellow-400'}>
                {formatTimeRemaining()}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Session length:</span>
              <span className="text-blue-400">{formatTimeoutSetting()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Active Wallet:</span>
              <span className="text-blue-400">{activeWallet?.id.substring(0, 8) || 'None'}</span>
            </div>
            
            {/* Wallet control buttons */}
            <div className="mt-2 flex justify-between">
              {actualLockStatus ? (
                <button
                  onClick={() => setShowPasswordInput(!showPasswordInput)}
                  className="text-xs bg-green-800 hover:bg-green-700 text-white px-2 py-1 rounded flex items-center gap-1"
                  disabled={!activeWallet || isRefreshing}
                >
                  <FaKey size={10} /> Authorize
                </button>
              ) : (
                <button
                  onClick={handleLock}
                  className="text-xs bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded flex items-center gap-1"
                  disabled={isRefreshing}
                >
                  <FaLock size={10} /> Lock
                </button>
              )}
              <button
                onClick={() => { setLastActiveTime(); resetIdleTimer(); }}
                className="text-xs bg-blue-800 hover:bg-blue-700 text-white px-2 py-1 rounded"
                disabled={isRefreshing}
              >
                Reset Timer
              </button>
            </div>
            
            {/* Password input for authorization */}
            {showPasswordInput && (
              <div className="mt-2">
                <input
                  type="password"
                  id="debug-password"
                  name="debug-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full p-1 text-xs bg-gray-800 border border-gray-700 rounded text-white"
                />
                <button
                  onClick={handleUnlock}
                  className="mt-1 w-full text-xs bg-green-800 hover:bg-green-700 text-white px-2 py-1 rounded"
                  disabled={!password || isRefreshing}
                >
                  {isRefreshing ? 'Authorizing...' : 'Authorize'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={toggleExpanded}
          className="p-2 bg-black bg-opacity-75 text-gray-400 hover:text-white rounded shadow transition-colors"
          aria-label="Show debug overlay"
        >
          <FaBug />
        </button>
      )}
    </div>
  );
} 