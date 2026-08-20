// The BASIC built-in metadata table.
//
// These tests exist because the table is the single source of truth: a wrong
// dialect here becomes a program that tokenizes, loads, and fails at RUN.
const test = require('node:test');
const assert = require('node:assert');

const {
  SUBPROGRAMS, COLORS, colorByBasicNumber, allBuiltins,
  builtinsFor, findBuiltin, findInOtherDialect,
} = require('../out/lang/basic/metadata.js');

const DIALECTS = ['ti-basic', 'ti-extended-basic'];

test('every entry is complete', () => {
  for (const b of allBuiltins()) {
    assert.ok(b.name && b.name === b.name.toUpperCase(), 'name upper-case: ' + b.name);
    assert.ok(b.kind, b.name + ' has no kind');
    assert.ok(Array.isArray(b.dialects) && b.dialects.length, b.name + ' has no dialect');
    for (const d of b.dialects) assert.ok(DIALECTS.includes(d), b.name + ' bad dialect ' + d);
    assert.ok(b.category, b.name + ' has no category');
    assert.ok(b.syntax, b.name + ' has no syntax');
    assert.ok(b.description, b.name + ' has no description');
    assert.ok(b.reference, b.name + ' cites no source');
  }
});

test('no built-in is listed twice', () => {
  const seen = new Set(), dupes = [];
  for (const b of allBuiltins()) {
    const key = b.kind + ':' + b.name;
    if (seen.has(key)) dupes.push(key);
    seen.add(key);
  }
  assert.deepStrictEqual(dupes, []);
});

test('TI BASIC has exactly the ten documented subprograms', () => {
  // The User's Reference Guide lists these and no others. Anything else in
  // TI BASIC is an Extended BASIC construct and must be diagnosed as one.
  const expected = ['CHAR','CLEAR','COLOR','GCHAR','HCHAR','JOYST','KEY','SCREEN','SOUND','VCHAR'];
  const actual = builtinsFor('ti-basic').filter(b => b.kind === 'subprogram')
    .map(b => b.name).sort();
  assert.deepStrictEqual(actual, expected);
});

test('everything TI BASIC has, Extended BASIC also has', () => {
  // Extended BASIC is a superset for subprograms; a TI BASIC program that uses
  // only these should build for either dialect.
  for (const b of builtinsFor('ti-basic')) {
    assert.ok(b.dialects.includes('ti-extended-basic'),
      b.name + ' is in TI BASIC but not Extended BASIC');
  }
});

test('sprite subprograms are Extended BASIC only', () => {
  for (const name of ['SPRITE','MOTION','LOCATE','POSITION','PATTERN','MAGNIFY',
                      'COINC','DISTANCE','DELSPRITE']) {
    const b = findBuiltin(name, 'ti-extended-basic');
    assert.ok(b, name + ' is missing from the table');
    assert.deepStrictEqual(b.dialects, ['ti-extended-basic'], name + ' dialect');
    assert.strictEqual(findBuiltin(name, 'ti-basic'), undefined, name + ' must not be TI BASIC');
  }
});

test('a wrong-dialect built-in is reported as wrong-dialect, not unknown', () => {
  const s = findInOtherDialect('SPRITE', 'ti-basic');
  assert.ok(s, 'CALL SPRITE in TI BASIC should be recognised');
  assert.ok(s.dialects.includes('ti-extended-basic'));
  assert.strictEqual(findInOtherDialect('CLEAR', 'ti-basic'), undefined,
    'CALL CLEAR is valid in TI BASIC and must not be flagged');
});

test('parameter ranges are sane', () => {
  for (const b of allBuiltins()) {
    for (const p of b.params || []) {
      assert.ok(p.name && p.type, b.name + ' has an incomplete parameter');
      if (p.min !== undefined && p.max !== undefined) {
        assert.ok(p.min <= p.max, b.name + '.' + p.name + ' has min above max');
      }
    }
  }
});

test('the colour table matches the Editor/Assembler manual', () => {
  assert.strictEqual(COLORS.length, 16);
  // BASIC numbers colours 1 to 16; the manual gives VDP codes 0 to F.
  COLORS.forEach((c, i) => {
    assert.strictEqual(c.basic, i + 1, 'BASIC number out of sequence');
    assert.strictEqual(c.vdp, i, 'VDP code out of sequence');
    assert.ok(c.name, 'colour ' + c.basic + ' has no name');
  });
  assert.strictEqual(colorByBasicNumber(1).name, 'Transparent');
  assert.strictEqual(colorByBasicNumber(2).name, 'Black');
  assert.strictEqual(colorByBasicNumber(16).name, 'White');
  // Confirmed by observation: CALL SCREEN(2) produces a black screen.
  assert.strictEqual(colorByBasicNumber(2).vdp, 0x1);
});

test('colour parameters use the BASIC range, not the VDP range', () => {
  for (const b of allBuiltins()) {
    for (const p of b.params || []) {
      if (/colour|color/i.test(p.name)) {
        assert.strictEqual(p.min, 1, b.name + '.' + p.name + ' should start at 1');
        assert.strictEqual(p.max, 16, b.name + '.' + p.name + ' should end at 16');
      }
    }
  }
});

test('unconfirmed entries are marked, not silently asserted', () => {
  // Not a failure: it is a worklist. Every entry here needs a documentation
  // pass before its details are shown to a user without qualification.
  const pending = allBuiltins().filter(b => b.confirm).map(b => b.name);
  assert.ok(pending.length <= SUBPROGRAMS.length, 'sanity');
  for (const b of allBuiltins()) {
    if (b.confirm) assert.ok(b.reference, b.name + ' is unconfirmed and cites no source to check');
  }
});
