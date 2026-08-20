// The project template. A break here only shows up when someone creates a
// project, which is the worst moment to discover it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { validate, targetIds, resolveTarget } = require('../out/config/project.js');
const { BUILTIN_EMULATORS } = require('../out/emulator/profiles.js');
const { BUILTIN_PROFILES } = require('../out/toolchain/profiles.js');

const root = path.join(__dirname, '..');
const tpl = path.join(root, 'templates', 'multi-target');
const VALUES = { NAME: 'hello', STEM: 'hello', TINAME: 'HELLO', XBNAME: 'HELLOX',
                 MENUNAME: 'HELLO WORLD', MENULEN: '11', DIALECT: 'xdt99' };

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})(tpl);

const substitute = s => Object.entries(VALUES)
  .reduce((acc, [k, v]) => acc.split('{{' + k + '}}').join(v), s);

test('the template ships the files a project needs', () => {
  const rel = files.map(f => path.relative(tpl, f).split(path.sep).join('/')).sort();
  for (const need of ['ti99.json', 'README.md', '.gitignore', 'boot/LOAD.b99',
                      'src/main.a99', 'src/targets/cart.a99', 'src/targets/ea.a99',
                      'src/targets/disk-xb.a99']) {
    assert.ok(rel.includes(need), 'template is missing ' + need);
  }
});

test('every placeholder in the template has a value', () => {
  const missing = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\{\{([A-Z_]+)\}\}/g)) {
      if (!(m[1] in VALUES)) missing.add(m[1] + ' in ' + path.basename(f));
    }
  }
  assert.deepStrictEqual([...missing], [], 'placeholders with no value');
});

test('nothing is left unsubstituted', () => {
  for (const f of files) {
    const out = substitute(fs.readFileSync(f, 'utf8'));
    assert.ok(!out.includes('{{'), path.basename(f) + ' still has a placeholder');
  }
});

test('the generated ti99.json is valid', () => {
  const cfg = JSON.parse(substitute(fs.readFileSync(path.join(tpl, 'ti99.json'), 'utf8')));
  assert.deepStrictEqual(validate(cfg), [], 'template project does not validate');
  assert.deepStrictEqual(targetIds(cfg), ['cart', 'ea', 'disk-xb']);
});

test('every template target names a real profile and real capabilities', () => {
  const cfg = JSON.parse(substitute(fs.readFileSync(path.join(tpl, 'ti99.json'), 'utf8')));
  const xdt = BUILTIN_PROFILES.find(p => p.id === 'xdt99');
  for (const id of targetIds(cfg)) {
    const r = resolveTarget(cfg, id);
    const emu = BUILTIN_EMULATORS.find(e => e.id === r.emulatorProfile);
    assert.ok(emu, id + ' names unknown emulator profile ' + r.emulatorProfile);
    for (const cap of r.outputs) {
      assert.ok(xdt.commands[cap], id + ' wants ' + cap + ', which xdt99 cannot build');
    }
    // the emulator must be able to run something the target produces
    assert.ok(emu.accepts.some(a => r.outputs.includes(a)),
      id + ': ' + emu.id + ' runs ' + emu.accepts.join('/') + ' but the target builds ' + r.outputs.join('/'));
  }
});

test('the sources every target names exist in the template', () => {
  const cfg = JSON.parse(substitute(fs.readFileSync(path.join(tpl, 'ti99.json'), 'utf8')));
  for (const id of targetIds(cfg)) {
    const r = resolveTarget(cfg, id);
    assert.ok(fs.existsSync(path.join(tpl, r.entrySource)), id + ': missing ' + r.entrySource);
    if (r.basicSource) {
      assert.ok(fs.existsSync(path.join(tpl, r.basicSource)), id + ': missing ' + r.basicSource);
    }
  }
});

test('the shared body carries no loader-specific directives', () => {
  const body = fs.readFileSync(path.join(tpl, 'src', 'main.a99'), 'utf8');
  assert.doesNotMatch(body, /^\s+AORG\b/m, 'main.a99 must stay relocatable');
  assert.doesNotMatch(body, /^\s+DEF\b/m, 'DEF belongs in the target wrappers');
  assert.match(body, /^MAIN\s/m, 'main.a99 must define MAIN');
  assert.match(body, /HELLO WORLD!/, 'the starter should print something');
});

test('each wrapper copies the shared body exactly once', () => {
  for (const t of ['cart', 'ea', 'disk-xb']) {
    const src = fs.readFileSync(path.join(tpl, 'src', 'targets', t + '.a99'), 'utf8');
    const copies = [...src.matchAll(/^\s+COPY\s+"\.\.\/main\.a99"/gm)];
    assert.strictEqual(copies.length, 1, t + '.a99 should COPY ../main.a99 once');
  }
});

test('the XB loader links the name the disk actually holds', () => {
  const cfg = JSON.parse(substitute(fs.readFileSync(path.join(tpl, 'ti99.json'), 'utf8')));
  const xb = resolveTarget(cfg, 'disk-xb');
  const loader = substitute(fs.readFileSync(path.join(tpl, 'boot', 'LOAD.b99'), 'utf8'));
  const loaded = /CALL LOAD\("DSK1\.([A-Z0-9]+)"\)/.exec(loader);
  assert.ok(loaded, 'the loader should CALL LOAD a file');
  const onDisk = xb.disk.files.map(f => f.tiName);
  assert.ok(onDisk.includes(loaded[1]),
    'loader reads DSK1.' + loaded[1] + ' but the disk holds ' + onDisk.join(', '));
  const linked = /CALL LINK\("([A-Z0-9]+)"\)/.exec(loader);
  assert.ok(linked, 'the loader should CALL LINK an entry point');
  const wrapper = fs.readFileSync(path.join(tpl, 'src', 'targets', 'disk-xb.a99'), 'utf8');
  const defLine = wrapper.split('\n').find(l => /^\s+DEF\s/.test(l)) || '';
  const exported = defLine.replace(/^\s*DEF\s+/, '').split(/[\s,]+/).filter(Boolean);
  assert.ok(exported.includes(linked[1]),
    'loader CALL LINKs ' + linked[1] + ', but the wrapper exports ' + exported.join(', '));
});
