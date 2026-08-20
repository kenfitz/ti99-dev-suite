// Consistency between the code and package.json.
//
// These catch the class of bug where a command is registered but never
// contributed (so it cannot be invoked), or a profile references a setting
// that does not exist (so it silently expands to nothing).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
const { BUILTIN_EMULATORS, classic99CartFilename } = require('../out/emulator/profiles.js');
const { BUILTIN_PROFILES } = require('../out/toolchain/profiles.js');

const settingIds = new Set(
  pkg.contributes.configuration.flatMap(s => Object.keys(s.properties || {})));
const contributed = new Set(pkg.contributes.commands.map(c => c.command));
const source = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
const registered = new Set(
  [...source.matchAll(/register\('([^']+)'/g)].map(m => m[1]));

test('every registered command is contributed in package.json', () => {
  const missing = [...registered].filter(c => !contributed.has(c));
  assert.deepStrictEqual(missing, [], 'registered but not contributed');
});

test('every contributed command is registered in the extension', () => {
  const missing = [...contributed].filter(c => !registered.has(c));
  assert.deepStrictEqual(missing, [], 'contributed but not registered');
});

test('keybindings and menus only reference real commands', () => {
  const refs = [
    ...(pkg.contributes.keybindings || []).map(k => k.command),
    ...Object.values(pkg.contributes.menus || {}).flat().map(m => m.command),
  ].filter(Boolean);
  for (const c of refs) {
    assert.ok(contributed.has(c), `${c} is referenced but not contributed`);
  }
});

test('emulator profiles only reference settings that exist', () => {
  for (const p of BUILTIN_EMULATORS) {
    const text = JSON.stringify([p.executable, p.args, p.preLaunch, p.url]);
    for (const m of text.matchAll(/\$\{config:([^}]+)\}/g)) {
      assert.ok(settingIds.has(m[1]), `${p.id} references unknown setting ${m[1]}`);
    }
    for (const key of p.requires || []) {
      assert.ok(settingIds.has(key), `${p.id} requires unknown setting ${key}`);
    }
  }
});

test('a flag taking a config value declares it in requires', () => {
  // An unresolved argument is dropped, which would turn "-rom <path>" into a
  // bare "-rom" and launch the emulator with no cartridge.
  for (const p of BUILTIN_EMULATORS) {
    const args = p.args || [];
    for (let i = 0; i < args.length - 1; i++) {
      const m = /^\$\{config:([^}]+)\}$/.exec(args[i + 1]);
      if (args[i].startsWith('-') && m) {
        assert.ok((p.requires || []).includes(m[1]),
          `${p.id}: ${args[i]} takes ${m[1]} but does not require it`);
      }
    }
  }
});

test('toolchain profiles declare a command for every capability', () => {
  for (const p of BUILTIN_PROFILES) {
    for (const cap of p.capabilities) {
      if (['assemble', 'link', 'listing', 'symbols'].includes(cap)) continue;
      assert.ok(p.commands[cap], `${p.id} advertises ${cap} with no command`);
    }
  }
});

test('toolchain commands only use variables the coordinator supplies', () => {
  const supplied = new Set([
    'python', 'tool', 'projectRoot', 'buildDir', 'distDir', 'output', 'listing',
    'symbolFile', 'dialectFlag', 'registerFlag', 'cpuFlag', 'cartBase',
    'cartridgeName', 'diskGeometry', 'diskName', 'input', 'fileType',
    'sources', 'includePaths',
  ]);
  for (const p of BUILTIN_PROFILES) {
    for (const [cap, cmd] of Object.entries(p.commands)) {
      for (const m of JSON.stringify([cmd.program, cmd.args]).matchAll(/\$\{([a-zA-Z]+)\}/g)) {
        assert.ok(supplied.has(m[1]), `${p.id}/${cap} uses unsupplied \${${m[1]}}`);
      }
    }
  }
});

test('Classic99 cartridge names carry the type letter it matches on', () => {
  assert.strictEqual(classic99CartFilename('SNAKE', 'none'), 'SNAKEC.BIN');
  assert.strictEqual(classic99CartFilename('TI SNAKE', 'none'), 'TISNAKEC.BIN');
  assert.match(classic99CartFilename('a-very-long-program-name', 'none'), /^[A-Z0-9_]{1,9}C\.BIN$/);
  assert.strictEqual(classic99CartFilename('X', 'grom'), 'XG.BIN');
});

test('the packaged icon exists and package.json points at it', () => {
  assert.ok(pkg.icon, 'no icon declared');
  assert.ok(fs.existsSync(path.join(root, pkg.icon)), `${pkg.icon} is missing`);
});

test('marketplace metadata is present', () => {
  for (const field of ['name', 'displayName', 'description', 'version',
                       'publisher', 'license', 'icon', 'categories', 'keywords']) {
    assert.ok(pkg[field], `package.json is missing ${field}`);
  }
  assert.ok(pkg.engines && pkg.engines.vscode, 'engines.vscode is required');
  assert.ok(/^https:\/\/github\.com\//.test(pkg.repository.url), 'repository url');
  assert.ok(!/YOUR-GITHUB-USER|your-publisher-id/.test(JSON.stringify(pkg)),
    'package.json still contains a placeholder');
});

test('the licence names a copyright holder', () => {
  const text = fs.readFileSync(path.join(root, 'LICENSE.txt'), 'utf8');
  assert.match(text, /^MIT License/);
  assert.doesNotMatch(text, /<YOUR NAME>/, 'licence still has a placeholder');
  assert.match(text, /Copyright \(c\) \d{4} .+/);
});

test('project settings are read with a resource scope', () => {
  // getConfiguration() without a resource cannot see a folder-level
  // .vscode/settings.json in a multi-root workspace, so a per-project
  // toolchain or emulator setup silently does not exist. Language features
  // scope to the document; everything project-shaped must scope to the
  // project folder.
  const files = [
    'src/emulator/launcher.ts',
    'src/toolchain/discovery.ts',
    'src/build/coordinator.ts',
  ];
  const offenders = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    text.split('\n').forEach((line, i) => {
      const m = /getConfiguration\(([^)]*)\)/.exec(line);
      if (!m) return;
      // A scope is a second argument, or the only one when the section is
      // omitted as getConfiguration(undefined, scope).
      const scoped = m[1].split(',').length >= 2;
      if (!scoped) offenders.push(f + ':' + (i + 1) + '  getConfiguration(' + m[1].trim() + ')');
    });
  }
  assert.deepStrictEqual(offenders, [], 'unscoped configuration reads');
});

test('settings are declared at a scope that allows per-folder values', () => {
  // VS Code's default scope is "window", and a window-scoped setting is
  // ignored in a folder-level .vscode/settings.json - the settings editor
  // greys it out. Reading it with a resource scope does not help, because the
  // value was never applied. Anything a project may configure for itself must
  // therefore be declared "resource" or "machine-overridable".
  const PER_FOLDER = new Set(['resource', 'machine-overridable', 'language-overridable']);
  const bad = [];
  for (const section of pkg.contributes.configuration) {
    for (const [key, prop] of Object.entries(section.properties || {})) {
      if (!PER_FOLDER.has(prop.scope)) {
        bad.push(key + ' has scope ' + JSON.stringify(prop.scope || '(default: window)'));
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'settings that cannot be set per folder');
});

test('every setting a profile requires is settable per folder', () => {
  const byKey = new Map();
  for (const section of pkg.contributes.configuration) {
    for (const [key, prop] of Object.entries(section.properties || {})) byKey.set(key, prop);
  }
  const PER_FOLDER = new Set(['resource', 'machine-overridable', 'language-overridable']);
  for (const p of BUILTIN_EMULATORS) {
    for (const key of p.requires || []) {
      const prop = byKey.get(key);
      assert.ok(prop, p.id + ' requires unknown setting ' + key);
      assert.ok(PER_FOLDER.has(prop.scope),
        p.id + ' requires ' + key + ', which cannot be set per folder (scope ' + prop.scope + ')');
    }
  }
});
