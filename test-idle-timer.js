// Paste this in the extension's background service worker console to test the idle timer

// Set 10-second idle timer for testing
chrome.storage.local.get(null, (data) => {
  console.log('Current storage:', data);

  // Find the settings record
  const records = data.records || [];
  const settingsRecord = records.find(r => r.id === 'keychain-settings');

  if (settingsRecord) {
    // Update the settings with 10-second timer
    settingsRecord.autoLockTimer = '10s';
    settingsRecord.autoLockTimeout = 10000; // 10 seconds in milliseconds

    // Save back to storage
    chrome.storage.local.set({ records }, () => {
      console.log('✅ Idle timer set to 10 seconds for testing');
      console.log('Updated settings:', settingsRecord);
      console.log('Now leave the wallet idle for 10 seconds to test auto-lock');
    });
  } else {
    console.error('❌ Settings record not found. Make sure wallet is initialized.');
  }
});