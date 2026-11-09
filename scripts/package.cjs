#!/usr/bin/env node
/**
 * EasyAntigravity Cross-Platform Packaging & Build Script
 * 
 * Automates:
 * 1. Environment validation (Node >= 22, Rust toolchain, Cargo path discovery)
 * 2. Backend resources bundling and Node runtime preparation
 * 3. Pre-flight tests and lifecycle verification
 * 4. Tauri native application compilation
 * 5. Platform-specific assembly, Hardened Runtime / JIT codesigning, and portable packaging
 * 6. Package integrity self-test, SHA-256 generation, and GitHub Actions output integration
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execSync, execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tauriConf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue = null) {
  const prefix = `--${name}=`;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith(prefix)) return args[i].slice(prefix.length);
  }
  return defaultValue;
}
const hasFlag = (name) => args.includes(`--${name}`);

if (hasFlag('help') || hasFlag('h')) {
  console.log(`
EasyAntigravity Build & Package Tool

Usage:
  node scripts/package.cjs [options]
  npm run package [-- options]

Options:
  --target=<triple>     Rust target triple (defaults to host platform)
  --skip-tests          Skip running npm checks and pre-build unit tests
  --skip-build          Skip tauri build (re-package existing release binary)
  --skip-runtime        Skip backend & node runtime staging
  --build-args=<args>   Extra arguments passed to tauri build
  --clean               Clean dist-tauri output directory before packaging
  --help, -h            Show this help message
`);
  process.exit(0);
}

// 1. Target and platform mapping
const targetMap = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu'
};

const hostKey = `${process.platform}-${process.arch}`;
const defaultTarget = targetMap[hostKey] || (process.platform === 'win32' ? 'x86_64-pc-windows-msvc' : 'x86_64-apple-darwin');
const target = getArg('target', defaultTarget);

const isWindows = target.includes('windows');
const isDarwin = target.includes('apple-darwin');
const isArm64 = target.includes('aarch64');
const archLabel = isWindows ? 'windows-x64' : (isArm64 ? 'macos-arm64-beta' : 'macos-x64-beta');

const productName = tauriConf.productName || 'EasyAntigravity';
const version = pkg.version || '4.0.4';
const edition = pkg.edition || 'lite';
const artifactName = `${productName}-${version}-${edition}-${archLabel}`;
const zipName = `${artifactName}.zip`;

console.log('='.repeat(60));
console.log(`EasyAntigravity Packager: ${productName} v${version} (${edition})`);
console.log(`Target: ${target} [${archLabel}]`);
console.log('='.repeat(60));

// Ensure ~/.cargo/bin is in PATH if not already present
const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
if (fs.existsSync(cargoBin) && !process.env.PATH.split(path.delimiter).includes(cargoBin)) {
  process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH}`;
  console.log(`[Env] Injected ${cargoBin} into PATH`);
}

// Helper to run commands
function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env: process.env, ...opts });
}

// Helper for SHA-256 calculation
function getSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function ensureNodeLicense(destinationPath) {
  if (fs.existsSync(destinationPath)) return;
  console.log('[Runtime] Fetching Node.js LICENSE...');
  const licenseUrl = `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`;
  try {
    const res = await fetch(licenseUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    fs.writeFileSync(destinationPath, text, 'utf8');
    console.log('[Runtime] Downloaded Node.js LICENSE successfully.');
  } catch (err) {
    console.warn(`[Runtime] Notice: Could not fetch remote LICENSE (${err.message}). Using fallback attribution.`);
    const fallback = `Node.js is licensed under the MIT license.\nVersion: ${process.version}\nhttps://github.com/nodejs/node\n`;
    fs.writeFileSync(destinationPath, fallback, 'utf8');
  }
}

async function main() {
  const distDir = path.join(root, 'dist-tauri');
  if (hasFlag('clean')) {
    console.log('[Clean] Removing dist-tauri directory...');
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // 2. Pre-flight tests
  if (!hasFlag('skip-tests')) {
    console.log('\n[Check] Running module checks and foundation tests...');
    run('node scripts/check.cjs');
    run('npm test');
  }

  // 3. Prepare backend resources and self-contained node binary
  if (!hasFlag('skip-runtime')) {
    console.log('\n[Runtime] Preparing backend resources and runtime binary...');
    run(`node scripts/prepare-tauri.cjs ${target}`);
    const licenseFile = path.join(root, 'src-tauri', 'backend', 'NODE-LICENSE.txt');
    await ensureNodeLicense(licenseFile);

    // Test packaged backend lifecycle
    console.log('\n[Lifecycle] Testing packaged backend without developer dependencies...');
    const binExt = isWindows ? '.exe' : '';
    const nodeBinary = path.join(root, 'src-tauri', 'binaries', `easyag-node-${target}${binExt}`);
    const serverScript = path.join(root, 'src-tauri', 'backend', 'server.js');
    
    if (fs.existsSync(nodeBinary) && fs.existsSync(serverScript)) {
      execSync('node test/tauri-lifecycle.test.cjs', {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          EASYAG_TEST_NODE: nodeBinary,
          EASYAG_TEST_SERVER: serverScript
        }
      });
    }
  }

  // 4. Tauri native build
  if (!hasFlag('skip-build')) {
    console.log('\n[Build] Compiling native Tauri application...');
    const defaultBundleArgs = isDarwin ? '--bundles app' : (isWindows ? '--no-bundle' : '');
    const userBundleArgs = getArg('build-args', defaultBundleArgs);
    const bundleFlag = userBundleArgs ? ` ${userBundleArgs}` : '';
    run(`npx --yes @tauri-apps/cli@2 build --target ${target}${bundleFlag}`);
  }

  // 5. Assemble package and create archive
  const zipPath = path.join(distDir, zipName);
  const verifyDir = path.join(distDir, 'verify');

  if (isWindows) {
    console.log('\n[Package] Assembling Windows portable distribution...');
    const stage = path.join(distDir, artifactName);
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });

    const releaseDir = path.join(root, 'src-tauri', 'target', target, 'release');
    fs.copyFileSync(path.join(releaseDir, 'easyantigravity.exe'), path.join(stage, 'EasyAntigravity.exe'));
    fs.copyFileSync(path.join(root, 'src-tauri', 'binaries', `easyag-node-${target}.exe`), path.join(stage, 'easyag-node.exe'));
    fs.cpSync(path.join(root, 'src-tauri', 'backend'), path.join(stage, 'backend'), { recursive: true });

    // Copy runtime DLLs from release dir
    if (fs.existsSync(releaseDir)) {
      for (const file of fs.readdirSync(releaseDir)) {
        if (file.toLowerCase().endsWith('.dll')) {
          fs.copyFileSync(path.join(releaseDir, file), path.join(stage, file));
        }
      }
    }

    // Include LICENSE and documentation
    fs.copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
    const portableDoc = path.join(root, 'docs', 'PORTABLE.md');
    if (fs.existsSync(portableDoc)) {
      fs.copyFileSync(portableDoc, path.join(stage, 'PORTABLE.md'));
    }

    // Compress to ZIP
    console.log(`[Package] Creating ZIP archive: ${zipPath}`);
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -LiteralPath '${stage}' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' });
    } else {
      // Cross-compiling / bundling from Unix
      execSync(`cd "${distDir}" && zip -qr "${zipName}" "${artifactName}"`, { stdio: 'inherit' });
    }

    // Integrity Verification
    console.log('[Verify] Validating portable ZIP contents...');
    fs.rmSync(verifyDir, { recursive: true, force: true });
    fs.mkdirSync(verifyDir, { recursive: true });
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${verifyDir}' -Force"`, { stdio: 'inherit' });
    } else {
      execSync(`unzip -q "${zipPath}" -d "${verifyDir}"`, { stdio: 'inherit' });
    }

    const extracted = path.join(verifyDir, artifactName);
    const requiredFiles = [
      'EasyAntigravity.exe',
      'easyag-node.exe',
      'backend/server.js',
      'backend/index.html',
      'backend/dicts/common.json',
      'backend/dicts/ui_v2.json',
      'backend/package.json',
      'backend/node_modules/ws/package.json',
      'backend/NODE-LICENSE.txt'
    ];
    for (const req of requiredFiles) {
      if (!fs.existsSync(path.join(extracted, req))) {
        throw new Error(`Missing portable file: ${req}`);
      }
    }

    // Run lifecycle test on extracted package if on Windows
    if (process.platform === 'win32') {
      console.log('[Verify] Testing lifecycle on extracted portable build...');
      execSync('node test/tauri-lifecycle.test.cjs', {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          EASYAG_TEST_NODE: path.join(extracted, 'easyag-node.exe'),
          EASYAG_TEST_SERVER: path.join(extracted, 'backend', 'server.js')
        }
      });
    }
    fs.rmSync(verifyDir, { recursive: true, force: true });

  } else if (isDarwin) {
    console.log('\n[Package] Assembling and signing macOS App Bundle...');
    const appPath = path.join(root, 'src-tauri', 'target', target, 'release', 'bundle', 'macos', 'EasyAntigravity.app');
    if (!fs.existsSync(appPath)) {
      throw new Error(`App bundle not found at: ${appPath}`);
    }

    // Verify bundle internal structure
    if (!fs.existsSync(path.join(appPath, 'Contents', 'Resources', 'backend', 'server.js')) ||
        !fs.existsSync(path.join(appPath, 'Contents', 'Resources', 'backend', 'node_modules', 'ws', 'package.json')) ||
        !fs.existsSync(path.join(appPath, 'Contents', 'MacOS', 'easyag-node'))) {
      throw new Error('Incomplete files inside EasyAntigravity.app bundle');
    }

    const entPath = path.join(root, 'src-tauri', 'Entitlements.plist');
    const easyagNode = path.join(appPath, 'Contents', 'MacOS', 'easyag-node');

    // 1. Codesign easyag-node with runtime and JIT entitlements
    console.log('[Codesign] Signing easyag-node with JIT entitlements...');
    execSync(`codesign --force --options runtime --sign - --entitlements "${entPath}" "${easyagNode}"`, { stdio: 'inherit' });

    // 2. Codesign entire EasyAntigravity.app
    console.log('[Codesign] Signing EasyAntigravity.app bundle with runtime entitlements...');
    execSync(`codesign --force --options runtime --deep --sign - --entitlements "${entPath}" "${appPath}"`, { stdio: 'inherit' });

    // 3. Strict signature verification
    console.log('[Codesign] Verifying codesign integrity...');
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });

    // 4. Test V8 JIT
    console.log('[Verify] Verifying V8 initialization on packaged easyag-node...');
    execSync(`"${easyagNode}" -e "console.log('easyag-node JIT OK, V8:', process.versions.v8)"`, { stdio: 'inherit' });

    // 5. Create distribution ZIP using ditto to preserve macOS metadata and symlinks
    console.log(`[Package] Creating distribution ZIP: ${zipPath}`);
    fs.rmSync(zipPath, { force: true });
    execSync(`ditto -c -k --sequesterRsrc --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' });

    // 6. Test ZIP file integrity
    console.log('[Verify] Testing ZIP archive integrity...');
    execSync(`unzip -t "${zipPath}" > /dev/null`, { stdio: 'inherit' });

    // 7. Test extracting and verifying permissions
    fs.rmSync(verifyDir, { recursive: true, force: true });
    fs.mkdirSync(verifyDir, { recursive: true });
    execSync(`ditto -x -k "${zipPath}" "${verifyDir}/"`, { stdio: 'inherit' });

    const extractedApp = path.join(verifyDir, 'EasyAntigravity.app');
    if (!fs.existsSync(extractedApp) ||
        !fs.existsSync(path.join(extractedApp, 'Contents', 'MacOS', 'EasyAntigravity')) ||
        !fs.existsSync(path.join(extractedApp, 'Contents', 'MacOS', 'easyag-node')) ||
        !fs.existsSync(path.join(extractedApp, 'Contents', 'Resources', 'backend', 'server.js'))) {
      throw new Error('Extracted macOS package verification failed');
    }

    // 8. Run lifecycle test on extracted app
    console.log('[Verify] Testing lifecycle on extracted macOS app...');
    execSync('node test/tauri-lifecycle.test.cjs', {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        EASYAG_TEST_NODE: path.join(extractedApp, 'Contents', 'MacOS', 'easyag-node'),
        EASYAG_TEST_SERVER: path.join(extractedApp, 'Contents', 'Resources', 'backend', 'server.js')
      }
    });
    fs.rmSync(verifyDir, { recursive: true, force: true });
  }

  // 6. Generate SHA-256 and checksum files
  const sha256 = getSha256(zipPath);
  const sha256File = `${zipPath}.sha256`;
  fs.writeFileSync(sha256File, `${sha256}  ${zipName}\n`, 'utf8');

  // Also write legacy checksum name for Windows if applicable
  if (isWindows) {
    fs.writeFileSync(path.join(distDir, `${artifactName}.sha256`), `${sha256}  ${zipName}\n`, 'utf8');
  }

  const stat = fs.statSync(zipPath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('PACKAGING COMPLETED SUCCESSFULLY!');
  console.log(`Package:  ${zipPath}`);
  console.log(`Size:     ${sizeMb} MB`);
  console.log(`SHA-256:  ${sha256}`);
  console.log('='.repeat(60) + '\n');

  // 7. Export outputs for GitHub Actions if running inside workflow
  if (process.env.GITHUB_OUTPUT) {
    const outputs = [
      `artifact_name=${artifactName}`,
      `zip_path=${zipPath}`,
      `zip_name=${zipName}`,
      `sha256=${sha256}`,
      `version=${version}`,
      `edition=${edition}`
    ];
    fs.appendFileSync(process.env.GITHUB_OUTPUT, outputs.join('\n') + '\n', 'utf8');
    console.log('[CI] Exported outputs to GITHUB_OUTPUT:');
    console.log(outputs.map(o => `  ${o}`).join('\n'));
  }
}

main().catch(err => {
  console.error('\n[Packaging Error]:', err.message);
  process.exit(1);
});
