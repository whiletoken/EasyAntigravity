const fs = require('node:fs');
const path = require('node:path');
const { sha256Hex } = require('../features/updater');
const { DICT_FILES } = require('../features/i18n');

const root = path.resolve(__dirname, '..');
const defaultBaseUrl = process.env.EASYAG_MANIFEST_BASE_URL || 'https://raw.githubusercontent.com/whiletoken/EasyAntigravity/main/';
const defaultDictVersion = process.env.EASYAG_DICT_VERSION || `${new Date().toISOString().slice(0, 10)}-hotfix1`;

function readLfBuffer(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  return Buffer.from(text, 'utf8');
}

const runtimeFiles = [
  'server.js',
  'index.html',
  'core/events.js',
  'core/session.js',
  'core/settings.js',
  'core/storage.js',
  'features/context-monitor.js',
  'features/context-widget.js',
  'features/conversation-context.js',
  'features/i18n.js',
  'features/proxy.js',
  'features/updater.js',
  'adapters/desktop/cdp.js',
  'adapters/desktop/discovery.js',
  'adapters/desktop/index.js',
  'adapters/desktop/language-service.js',
  'adapters/desktop/language-service-discovery.js',
  'adapters/desktop/renderer.js',
  'desktop/api.js',
  'desktop/application.js',
  'desktop/host.js',
  'ui/api.js',
  'ui/launcher.css',
  'ui/launcher.js'
];

function generateManifest({
  rootDir = root,
  version,
  dictVersion = defaultDictVersion,
  baseUrl = defaultBaseUrl,
  useRelative = !process.env.EASYAG_MANIFEST_ABSOLUTE_URLS
} = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const currentVersion = version || pkg.version;
  const dicts = {};
  for (const name of DICT_FILES) {
    const file = path.join(rootDir, 'dicts', name);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      const canonical = JSON.stringify(parsed, null, 2) + '\n';
      fs.writeFileSync(file, canonical, 'utf8');
      const buf = Buffer.from(canonical, 'utf8');
      dicts[name] = {
        url: useRelative ? `dicts/${name}` : new URL('dicts/' + name, baseUrl).toString(),
        sha256: sha256Hex(buf)
      };
    }
  }

  const files = {};
  for (const rel of runtimeFiles) {
    const full = path.join(rootDir, rel);
    if (fs.existsSync(full)) {
      files[rel] = {
        url: useRelative ? rel : new URL(rel, baseUrl).toString(),
        sha256: sha256Hex(readLfBuffer(full))
      };
    }
  }

  const manifest = {
    edition: pkg.edition || 'lite',
    version: currentVersion,
    dictVersion,
    dicts,
    runtime: {
      version: currentVersion,
      files
    }
  };

  const outFile = path.join(rootDir, 'update-manifest.json');
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

if (require.main === module) {
  const manifest = generateManifest();
  console.log(`Generated update-manifest.json (v${manifest.version}, dictVersion=${manifest.dictVersion}, ${Object.keys(manifest.dicts).length} dicts, ${Object.keys(manifest.runtime.files).length} runtime modules)`);
}

module.exports = { generateManifest, runtimeFiles };

