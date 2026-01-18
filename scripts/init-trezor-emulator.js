#!/usr/bin/env node
/**
 * Initialize Trezor emulator for testing
 *
 * This script connects to the trezor-user-env WebSocket controller
 * and starts the emulator with a known test seed.
 *
 * Usage: node scripts/init-trezor-emulator.js
 */

import WebSocket from 'ws';

const CONTROLLER_URL = 'ws://localhost:9001';
const TEST_MNEMONIC = 'all all all all all all all all all all all all';

async function sendCommand(ws, command) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substring(7);
    const message = JSON.stringify({ ...command, id });

    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for response to ${command.type}`));
    }, 30000);

    const handler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          ws.off('message', handler);
          if (response.success === false) {
            reject(new Error(response.error || 'Command failed'));
          } else {
            resolve(response);
          }
        }
      } catch (e) {
        // Ignore parse errors for other messages
      }
    };

    ws.on('message', handler);
    ws.send(message);
    console.log(`-> ${command.type}`);
  });
}

async function main() {
  console.log('Connecting to Trezor emulator controller...');

  const ws = new WebSocket(CONTROLLER_URL);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });

  console.log('Connected!');

  // Wait for welcome message
  await new Promise((resolve) => {
    ws.once('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log(`Firmware versions available: ${Object.keys(msg.firmwares || {}).join(', ')}`);
      resolve();
    });
  });

  try {
    // Start the emulator (Trezor Model T)
    console.log('\nStarting emulator (T2T1 - Trezor Model T)...');
    const startResult = await sendCommand(ws, {
      type: 'emulator-start',
      model: 'T2T1',
      wipe: true,
    });
    console.log(`<- ${startResult.response}`);

    // Wait a moment for emulator to initialize
    await new Promise((r) => setTimeout(r, 2000));

    // Start the bridge
    console.log('\nStarting Trezor bridge...');
    const bridgeResult = await sendCommand(ws, {
      type: 'bridge-start',
    });
    console.log(`<- ${bridgeResult.response}`);

    // Setup the device with test mnemonic
    console.log('\nSetting up device with test mnemonic...');
    const setupResult = await sendCommand(ws, {
      type: 'emulator-setup',
      mnemonic: TEST_MNEMONIC,
      pin: '',
      passphrase_protection: false,
      label: 'Test Trezor',
      needs_backup: false,
    });
    console.log(`<- ${setupResult.response}`);

    // Verify with background check
    console.log('\nVerifying setup...');
    const statusResult = await sendCommand(ws, {
      type: 'background-check',
    });
    console.log(`Bridge status: ${statusResult.bridge_status}`);
    console.log(`Emulator status: ${statusResult.emulator_status}`);

    console.log('\n✓ Trezor emulator initialized successfully!');
    console.log(`  Mnemonic: ${TEST_MNEMONIC}`);
    console.log('  Bridge URL: http://localhost:21325');
    console.log('  WebSocket: ws://localhost:21326');

    ws.close();
    process.exit(0);
  } catch (error) {
    console.error(`\n✗ Error: ${error.message}`);
    ws.close();
    process.exit(1);
  }
}

main();
