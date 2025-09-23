/**
 * Quick test script for provider functionality
 * Run this in a browser with the extension installed
 */

async function testProvider() {
  console.log('🧪 Testing XCP Wallet Provider Integration\n');

  // Check if provider exists
  if (typeof window.xcpwallet === 'undefined') {
    console.error('❌ XCP Wallet provider not found!');
    return;
  }

  console.log('✅ Provider detected\n');

  // Test connection
  try {
    console.log('📡 Testing connection...');
    const isConnected = await window.xcpwallet.request({
      method: 'xcp_isConnected'
    });
    console.log(`  Connection status: ${isConnected ? 'Connected' : 'Not connected'}`);

    if (!isConnected) {
      console.log('  Requesting connection...');
      const connected = await window.xcpwallet.request({
        method: 'xcp_connect'
      });
      console.log(`  Connection result: ${connected ? 'Success' : 'Failed'}`);
    }

    // Get accounts
    const accounts = await window.xcpwallet.request({
      method: 'xcp_accounts'
    });
    console.log(`  Connected account: ${accounts[0] || 'None'}\n`);

  } catch (error) {
    console.error(`  Connection test failed: ${error.message}\n`);
  }

  // Test compose methods (will open popup)
  console.log('🎨 Testing compose methods (popup should open)...\n');

  const composeTests = [
    {
      name: 'Send',
      method: 'xcp_composeSend',
      params: {
        destination: 'bc1qtest123456789',
        asset: 'XCP',
        quantity: 100000000,
        memo: 'Test from provider script'
      }
    },
    {
      name: 'Order',
      method: 'xcp_composeOrder',
      params: {
        give_asset: 'XCP',
        give_quantity: 100000000,
        get_asset: 'PEPECASH',
        get_quantity: 1000,
        expiration: 1000
      }
    }
  ];

  for (const test of composeTests) {
    try {
      console.log(`  Testing ${test.name}...`);
      console.log(`  Params: ${JSON.stringify(test.params, null, 2)}`);

      const result = await window.xcpwallet.request({
        method: test.method,
        params: [test.params]
      });

      console.log(`  ✅ ${test.name} successful!`);
      console.log(`  Result: ${JSON.stringify(result, null, 2)}\n`);

    } catch (error) {
      console.log(`  ❌ ${test.name} failed: ${error.message}\n`);
    }
  }

  console.log('🎉 Provider test complete!');
}

// Run the test
testProvider().catch(console.error);