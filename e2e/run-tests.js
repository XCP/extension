#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Running Extension E2E Tests with improved setup...\n');

// Use the new playwright config
const configPath = join(__dirname, '..', 'playwright.config.v2.ts');

// Run tests with the new config
const testProcess = spawn('npx', [
  'playwright',
  'test',
  '--config',
  configPath,
  ...process.argv.slice(2) // Pass through any additional arguments
], {
  stdio: 'inherit',
  shell: true
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Tests completed successfully!');
  } else {
    console.log(`\n❌ Tests failed with code ${code}`);
  }
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('Failed to run tests:', error);
  process.exit(1);
});