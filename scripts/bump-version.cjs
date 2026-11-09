const fs = require('node:fs');
const path = require('node:path');
const { generateManifest } = require('./build-update-manifest.cjs');

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?$/;

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    type: 'patch',
    version: null,
    dryRun: false,
    rootDir: path.resolve(__dirname, '..')
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--type=')) {
      options.type = arg.slice(7).trim();
    } else if (arg.startsWith('--version=')) {
      options.version = arg.slice(10).trim();
    } else if (arg.startsWith('--root=')) {
      options.rootDir = path.resolve(arg.slice(7).trim());
    }
  }

  return options;
}

function computeNextVersion(currentVersion, { type = 'patch', explicitVersion = null } = {}) {
  if (explicitVersion) {
    const clean = explicitVersion.replace(/^v/, '').trim();
    if (!SEMVER_REGEX.test(clean)) {
      throw new Error(`指定的版本号无效: "${explicitVersion}"，必须符合语义化版本规范 (X.Y.Z)`);
    }
    return clean;
  }

  const match = String(currentVersion || '').match(SEMVER_REGEX);
  if (!match) {
    throw new Error(`当前版本号格式无效: "${currentVersion}"`);
  }

  let major = parseInt(match[1], 10);
  let minor = parseInt(match[2], 10);
  let patch = parseInt(match[3], 10);

  const normalizedType = String(type || 'patch').toLowerCase().trim();
  if (normalizedType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (normalizedType === 'minor') {
    minor += 1;
    patch = 0;
  } else if (normalizedType === 'patch') {
    patch += 1;
  } else {
    throw new Error(`未知的升级类型: "${type}"，仅支持 patch、minor 或 major`);
  }

  return `${major}.${minor}.${patch}`;
}

function bumpVersion({
  rootDir = path.resolve(__dirname, '..'),
  type = 'patch',
  version = null,
  dryRun = false
} = {}) {
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`未找到 package.json: ${pkgPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;
  const edition = pkg.edition || 'lite';
  const nextVersion = computeNextVersion(currentVersion, { type, explicitVersion: version });
  const tagName = `v${nextVersion}-${edition}`;

  const result = {
    previousVersion: currentVersion,
    nextVersion,
    edition,
    tagName,
    dryRun,
    updatedFiles: []
  };

  if (dryRun) {
    return result;
  }

  // 1. package.json
  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  result.updatedFiles.push('package.json');

  // 2. package-lock.json (if present)
  const lockPath = path.join(rootDir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      lock.version = nextVersion;
      if (lock.packages && lock.packages['']) {
        lock.packages[''].version = nextVersion;
      }
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
      result.updatedFiles.push('package-lock.json');
    } catch {
      // Ignore lock parsing failure if malformed
    }
  }

  // 3. src-tauri/tauri.conf.json
  const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(tauriConfPath)) {
    try {
      const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
      tauriConf.version = nextVersion;
      fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
      result.updatedFiles.push('src-tauri/tauri.conf.json');
    } catch {}
  }

  // 4. src-tauri/Cargo.toml
  const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    try {
      let cargo = fs.readFileSync(cargoPath, 'utf8');
      cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${nextVersion}"`);
      fs.writeFileSync(cargoPath, cargo, 'utf8');
      result.updatedFiles.push('src-tauri/Cargo.toml');
    } catch {}
  }

  // 5. index.html (badge display)
  const htmlPath = path.join(rootDir, 'index.html');
  if (fs.existsSync(htmlPath)) {
    try {
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html.replace(/<span id="versionBadge">v[^<]+<\/span>/, `<span id="versionBadge">v${nextVersion}<\/span>`);
      fs.writeFileSync(htmlPath, html, 'utf8');
      result.updatedFiles.push('index.html');
    } catch {}
  }

  // 6. update-manifest.json
  try {
    generateManifest({ rootDir, version: nextVersion });
    result.updatedFiles.push('update-manifest.json');
  } catch (err) {
    console.warn(`[Warning] Could not regenerate update-manifest.json: ${err.message}`);
  }

  // 7. Write to GITHUB_OUTPUT if running inside GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const outputs = [
      `version=${nextVersion}`,
      `previous_version=${currentVersion}`,
      `edition=${edition}`,
      `tag_name=${tagName}`
    ];
    fs.appendFileSync(process.env.GITHUB_OUTPUT, outputs.join('\n') + '\n', 'utf8');
  }

  return result;
}

if (require.main === module) {
  const options = parseArgs();
  try {
    const res = bumpVersion(options);
    if (res.dryRun) {
      console.log(`[DRY RUN] Would bump version from v${res.previousVersion} -> v${res.nextVersion} (Tag: ${res.tagName})`);
    } else {
      console.log(`✓ Successfully bumped version: v${res.previousVersion} -> v${res.nextVersion} (${res.tagName})`);
      console.log(`  Updated files: ${res.updatedFiles.join(', ')}`);
    }
  } catch (err) {
    console.error(`[Error] ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  bumpVersion,
  computeNextVersion,
  parseArgs,
  SEMVER_REGEX
};
