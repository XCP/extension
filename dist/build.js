import { execSync } from 'child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { join } from 'path';
import { readdir, stat } from 'fs/promises';
import archiver from 'archiver';
import crypto from 'crypto';
import { writeFile, readFile } from 'fs/promises';

// Get version from package.json
const packageJson = JSON.parse(await readFile('package.json', 'utf-8'));
const version = packageJson.version;

const rootDir = process.cwd();
const distDir = join(rootDir, 'dist');
const outputDir = join(rootDir, '.output');

async function getDirectorySize(dir) {
  let size = 0;
  const files = await readdir(dir, { withFileTypes: true });

  for (const file of files) {
    const path = join(dir, file.name);
    if (file.isDirectory()) {
      size += await getDirectorySize(path);
    } else {
      const stats = await stat(path);
      size += stats.size;
    }
  }

  return size;
}

async function createZip(sourceDir, outputFile) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputFile);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    output.on('close', () => {
      console.log(`  ✓ Created ${outputFile} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function generateChecksum(filePath) {
  const fileBuffer = await readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

async function build() {
  console.log('🚀 Starting distribution build process...\n');

  // Clean dist directory but preserve build.js
  if (existsSync(distDir)) {
    console.log('  Cleaning existing dist directory...');
    const files = await readdir(distDir);
    for (const file of files) {
      if (file !== 'build.js') {
        const filePath = join(distDir, file);
        rmSync(filePath, { recursive: true, force: true });
      }
    }
  } else {
    mkdirSync(distDir, { recursive: true });
  }

  // Build for Chrome
  console.log('\n📦 Building Chrome extension...');
  execSync('npm run build', { stdio: 'inherit' });

  const chromeBuildDir = join(outputDir, 'chrome-mv3');
  if (!existsSync(chromeBuildDir)) {
    console.error('  ✗ Chrome build directory not found!');
    process.exit(1);
  }

  const chromeZip = join(distDir, `xcp-wallet-chrome-${version}.zip`);
  await createZip(chromeBuildDir, chromeZip);

  // Build for Firefox
  console.log('\n📦 Building Firefox extension...');
  execSync('npm run build:firefox', { stdio: 'inherit' });

  const firefoxBuildDir = join(outputDir, 'firefox-mv3');
  if (!existsSync(firefoxBuildDir)) {
    // Firefox MV3 might not be available, try MV2
    const firefoxMV2Dir = join(outputDir, 'firefox-mv2');
    if (existsSync(firefoxMV2Dir)) {
      await createZip(firefoxMV2Dir, join(distDir, `xcp-wallet-firefox-${version}.zip`));
    } else {
      console.error('  ✗ Firefox build directory not found!');
      process.exit(1);
    }
  } else {
    const firefoxZip = join(distDir, `xcp-wallet-firefox-${version}.zip`);
    await createZip(firefoxBuildDir, firefoxZip);
  }

  // Generate checksums
  console.log('\n🔒 Generating checksums for verification...');
  const checksums = {};

  for (const file of [`xcp-wallet-chrome-${version}.zip`, `xcp-wallet-firefox-${version}.zip`]) {
    const filePath = join(distDir, file);
    if (existsSync(filePath)) {
      const checksum = await generateChecksum(filePath);
      checksums[file] = checksum;
      console.log(`  ✓ ${file}: ${checksum}`);
    }
  }

  // Write checksums to file
  const checksumContent = Object.entries(checksums)
    .map(([file, hash]) => `${hash}  ${file}`)
    .join('\n');

  await writeFile(join(distDir, 'checksums.sha256'), checksumContent);
  console.log('  ✓ Checksums saved to checksums.sha256');

  // Generate README with checksums and verification
  const readmeContent = `# XCP Wallet Distribution v${version}

## Downloads

- **Chrome Extension**: \`xcp-wallet-chrome-${version}.zip\`
- **Firefox Extension**: \`xcp-wallet-firefox-${version}.zip\`

## SHA256 Checksums

\`\`\`
${checksumContent}
\`\`\`

## Verification

### Verify SHA256 Checksums

**Linux/Mac:**
\`\`\`bash
sha256sum xcp-wallet-*.zip
\`\`\`

**Windows:**
\`\`\`cmd
certUtil -hashfile xcp-wallet-chrome-${version}.zip SHA256
certUtil -hashfile xcp-wallet-firefox-${version}.zip SHA256
\`\`\`

Compare the output with the checksums listed above.

### Build Reproducibility

To verify the build yourself:

\`\`\`bash
git clone https://github.com/XCP/extension.git
cd extension
git checkout v${version}
npm install
npm run dist
\`\`\`

Then compare your locally generated checksums with the ones above.

## Installation

### Chrome/Chromium Browsers
1. Open Chrome and navigate to \`chrome://extensions/\`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" or drag the ZIP file
4. Select the extracted extension directory

### Firefox
1. Open Firefox and navigate to \`about:debugging\`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the ZIP file or manifest file from extracted directory

---
*Generated on: ${new Date().toISOString()}*
`;

  await writeFile(join(distDir, 'README.md'), readmeContent);
  console.log('  ✓ README.md created with checksums and verification');

  console.log('\n✅ Distribution build complete!');
  console.log(`\n📁 Output directory: ${distDir}`);
  console.log(`   - xcp-wallet-chrome-${version}.zip`);
  console.log(`   - xcp-wallet-firefox-${version}.zip`);
  console.log('   - checksums.sha256');
  console.log('   - README.md');
}

build().catch((error) => {
  console.error('\n❌ Build failed:', error);
  process.exit(1);
});