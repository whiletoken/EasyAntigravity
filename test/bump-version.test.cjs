const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bumpVersion, computeNextVersion } = require('../scripts/bump-version.cjs');

test('computeNextVersion increments patch, minor and major correctly', () => {
  assert.equal(computeNextVersion('4.0.4', { type: 'patch' }), '4.0.5');
  assert.equal(computeNextVersion('4.0.4', { type: 'minor' }), '4.1.0');
  assert.equal(computeNextVersion('4.0.4', { type: 'major' }), '5.0.0');
  assert.equal(computeNextVersion('4.0.4', { explicitVersion: '4.2.0' }), '4.2.0');
  assert.equal(computeNextVersion('4.0.4', { explicitVersion: 'v4.2.0' }), '4.2.0');

  assert.throws(() => computeNextVersion('invalid-ver'), /当前版本号格式无效/);
  assert.throws(() => computeNextVersion('4.0.4', { type: 'something' }), /未知的升级类型/);
  assert.throws(() => computeNextVersion('4.0.4', { explicitVersion: 'abc' }), /指定的版本号无效/);
});

test('bumpVersion updates package.json, package-lock.json, Cargo.toml, tauri.conf.json, index.html and update-manifest', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'easyag-bump-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  // Prepare mock root structure
  fs.mkdirSync(path.join(temp, 'src-tauri'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'dicts'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'dicts/ui_v2.json'), '{"hello": "world"}\n');
  fs.writeFileSync(path.join(temp, 'dicts/common.json'), '{"ok": "确认"}\n');
  fs.writeFileSync(path.join(temp, 'server.js'), '// server\n');
  fs.writeFileSync(path.join(temp, 'index.html'), '<div class="brand"><span id="versionBadge">v4.0.4</span></div>\n');

  fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({
    name: 'easyantigravity',
    version: '4.0.4',
    edition: 'lite'
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(temp, 'package-lock.json'), JSON.stringify({
    name: 'easyantigravity',
    version: '4.0.4',
    packages: {
      '': { version: '4.0.4' }
    }
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(temp, 'src-tauri/tauri.conf.json'), JSON.stringify({
    productName: 'EasyAntigravity',
    version: '4.0.4'
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(temp, 'src-tauri/Cargo.toml'), '[package]\nname = "easyantigravity"\nversion = "4.0.4"\nedition = "2021"\n');

  // Dry run first
  const dry = bumpVersion({ rootDir: temp, type: 'patch', dryRun: true });
  assert.equal(dry.previousVersion, '4.0.4');
  assert.equal(dry.nextVersion, '4.0.5');
  assert.equal(dry.tagName, 'v4.0.5-lite');
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'package.json'), 'utf8')).version, '4.0.4');

  // Actual bump
  const res = bumpVersion({ rootDir: temp, type: 'patch' });
  assert.equal(res.previousVersion, '4.0.4');
  assert.equal(res.nextVersion, '4.0.5');
  assert.equal(res.tagName, 'v4.0.5-lite');

  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'package.json'), 'utf8')).version, '4.0.5');
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'package-lock.json'), 'utf8')).version, '4.0.5');
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'package-lock.json'), 'utf8')).packages[''].version, '4.0.5');
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'src-tauri/tauri.conf.json'), 'utf8')).version, '4.0.5');
  assert.match(fs.readFileSync(path.join(temp, 'src-tauri/Cargo.toml'), 'utf8'), /version = "4\.0\.5"/);
  assert.match(fs.readFileSync(path.join(temp, 'index.html'), 'utf8'), /<span id="versionBadge">v4\.0\.5<\/span>/);

  // Check manifest generated in temp dir
  const manifest = JSON.parse(fs.readFileSync(path.join(temp, 'update-manifest.json'), 'utf8'));
  assert.equal(manifest.version, '4.0.5');
  assert.equal(manifest.runtime.version, '4.0.5');
  assert.equal(manifest.edition, 'lite');
});
