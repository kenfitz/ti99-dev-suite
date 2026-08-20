// Project configuration: validation and distribution-target resolution.
const test = require('node:test');
const assert = require('node:assert');

const {
  DEFAULT_PROJECT, validate, resolveTarget, targetIds, findTarget, defaultUnresolvedPolicy,
} = require('../out/config/project.js');

const base = () => JSON.parse(JSON.stringify(DEFAULT_PROJECT));

test('the default project validates', () => {
  assert.deepStrictEqual(validate(base()), []);
});

test('a cartridge project needs a cartridge name', () => {
  const cfg = base();
  delete cfg.cartridge;
  const issues = validate(cfg);
  assert.ok(issues.some(i => i.field === 'cartridge.name' && i.severity === 'error'));
});

test('a disk volume name is checked against TI filename rules', () => {
  const cfg = { ...base(), type: 'disk', disk: { geometry: 'sssd', volumeName: 'NOT A NAME', files: [] } };
  assert.ok(validate(cfg).some(i => i.field === 'disk.volumeName'));
});

test('a project without targets resolves to itself', () => {
  const cfg = base();
  assert.strictEqual(resolveTarget(cfg), cfg);
  assert.deepStrictEqual(targetIds(cfg), []);
});

test('a target overrides only what it names', () => {
  const cfg = {
    ...base(),
    distDir: 'dist',
    targets: [{ id: 'ea', type: 'ea3-object', entrySource: 'src/targets/ea.a99', distDir: 'dist/ea' }],
  };
  const r = resolveTarget(cfg, 'ea');
  assert.strictEqual(r.type, 'ea3-object');
  assert.strictEqual(r.distDir, 'dist/ea');
  assert.strictEqual(r.buildDir, cfg.buildDir, 'inherits what it does not override');
  assert.strictEqual(r.syntaxDialect, cfg.syntaxDialect);
  // entrySource without sources makes the entry the source list
  assert.deepStrictEqual(r.sources, ['src/targets/ea.a99']);
  // a resolved target is a plain config, so it cannot be resolved twice
  assert.strictEqual(r.targets, undefined);
});

test('no target id resolves to the first target', () => {
  const cfg = { ...base(), targets: [{ id: 'a' }, { id: 'b' }] };
  assert.strictEqual(findTarget(cfg, 'b').id, 'b');
  assert.deepStrictEqual(targetIds(cfg), ['a', 'b']);
});

test('an unknown target is an error, not a silent fallback', () => {
  const cfg = { ...base(), targets: [{ id: 'cart' }] };
  assert.throws(() => resolveTarget(cfg, 'nope'), /Unknown target 'nope'/);
});

test('assembler options merge rather than replace', () => {
  const cfg = { ...base(), targets: [{ id: 't', assembler: { unresolvedReferencePolicy: 'information' } }] };
  const r = resolveTarget(cfg, 't');
  assert.strictEqual(r.assembler.unresolvedReferencePolicy, 'information');
  assert.deepStrictEqual(r.assembler.extraArgs, [], 'extraArgs survives the merge');
});

test('targets sharing a distDir are flagged', () => {
  const cfg = {
    ...base(),
    targets: [{ id: 'a', distDir: 'dist' }, { id: 'b', distDir: 'dist' }],
  };
  assert.ok(validate(cfg).some(i => /overwrite each other/.test(i.message)));
});

test('duplicate target ids are an error', () => {
  const cfg = { ...base(), targets: [{ id: 'x' }, { id: 'x' }] };
  assert.ok(validate(cfg).some(i => /Duplicate target id/.test(i.message)));
});

test('every target is validated, not just the base', () => {
  const cfg = {
    ...base(),
    targets: [{ id: 'bad', type: 'disk', disk: { geometry: 'sssd', volumeName: '', files: [] } }],
  };
  assert.ok(validate(cfg).some(i => i.field.startsWith('targets.bad.')));
});

test('E/A option 3 tolerates unresolved references by default', () => {
  assert.strictEqual(defaultUnresolvedPolicy('ea3-object'), 'information');
  assert.strictEqual(defaultUnresolvedPolicy('cartridge-rpk'), 'warning');
});
