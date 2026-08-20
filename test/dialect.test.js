// Dialect detection and hazard scanning.
//
// These run against the compiled output in out/, so `npm run compile` must
// have happened first; `npm test` does that for you.
const test = require('node:test');
const assert = require('node:assert');

const { detectDialect, DIALECTS } = require('../out/lang/dialect.js');
const { findDialectHazards, splitLine } = require('../out/lang/formatter.js');

const hazards = src => findDialectHazards(src).map(h => h.line + 1);

test('a single blank before a comment is a hazard', () => {
  assert.deepStrictEqual(hazards('       LI   R1,>10 * comment\n'), [1]);
});

test('two or more blanks before a comment are not', () => {
  assert.deepStrictEqual(hazards('       LI   R1,>10  * comment\n'), []);
});

test('a tab before a comment is not a hazard', () => {
  // xas99 extended syntax accepts a tab as a field separator.
  assert.deepStrictEqual(hazards('       LI   R1,>10\t* comment\n'), []);
});

test('indirect addressing is not a comment, labelled or not', () => {
  // The old regex guard consumed the label instead of the mnemonic, so a
  // labelled line was flagged while the identical unlabelled one was not.
  assert.deepStrictEqual(hazards('       MOVB *R1+,@VDPWD       * write\n'), []);
  assert.deepStrictEqual(hazards('VMBWLP MOVB *R1+,@VDPWD       * write\n'), []);
});

test('a star inside a semicolon comment is not a hazard', () => {
  assert.deepStrictEqual(hazards('       DATA >0054,>38FE       ;  42 >2A *\n'), []);
});

test('indirect addressing does not mask a real hazard on the same line', () => {
  // Previously the guard was line-scoped, so any *Rn suppressed the whole
  // line - a false negative, the direction that costs a broken build.
  assert.deepStrictEqual(hazards('       MOV  @GENREL,*R8+ * put monster in table\n'), [1]);
});

test('detectDialect agrees with the field parser', () => {
  const src = [
    '       LI   R1,>10 * one',
    'LBL    MOVB *R1+,@VDPWD       * not a hazard',
    '       DATA >1  ; not a hazard',
    '       LI   R2,>20 * two',
    '',
  ].join('\n');
  const d = detectDialect(src);
  assert.strictEqual(d.dialect, 'ea');
  assert.strictEqual(hazards(src).length, 2);
  assert.match(d.reason, /^2 line\(s\)/);
});

test('a clean source gets no fabricated hazard count', () => {
  const src = '       LI   R1,>10  * fine\n       RT\n';
  const d = detectDialect(src);
  assert.strictEqual(hazards(src).length, 0);
  assert.doesNotMatch(d.reason, /line\(s\) separate/);
});

test('splitLine keeps quoted text out of the comment field', () => {
  const f = splitLine("MSG    TEXT 'HELLO * WORLD'  * real comment", 'ea');
  assert.strictEqual(f.label, 'MSG');
  assert.strictEqual(f.opcode, 'TEXT');
  assert.strictEqual(f.operand, "'HELLO * WORLD'");
  assert.match(f.comment, /real comment/);
});

test('every dialect has an assembler flag and a comment rule', () => {
  for (const [id, info] of Object.entries(DIALECTS)) {
    assert.strictEqual(info.id, id);
    assert.ok(typeof info.assemblerFlag === 'string', `${id} flag`);
    assert.ok(info.commentRule && info.commentRule.length, `${id} commentRule`);
  }
});
