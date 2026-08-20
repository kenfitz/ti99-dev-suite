// Extended BASIC evidence, in text source and in tokenized programs.
//
// Evidence is one-directional throughout: an Extended BASIC construct proves
// Extended BASIC, and its absence proves nothing at all.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
    scanSource, scanTokenized, stripContainer, XB_ONLY_TOKENS, XB_ONLY_KEYWORDS,
} = require("../out/actions/evidence.js");

const fixture = n => path.join(__dirname, "fixtures", n);

test("the statement separator proves Extended BASIC", () => {
    const r = scanSource("100 A=1 :: B=2\n");
    assert.ok(r.extendedBasicProven);
    assert.match(r.detail, /statement separator/);
});

test("an Extended BASIC subprogram proves Extended BASIC", () => {
    const r = scanSource("100 CALL SPRITE(#1,42,2,1,1)\n");
    assert.ok(r.extendedBasicProven);
    assert.strictEqual(r.detail, "CALL SPRITE");
});

test("a subprogram both dialects have proves nothing", () => {
    const r = scanSource("100 CALL CLEAR\n110 CALL HCHAR(1,1,42)\n");
    assert.strictEqual(r.extendedBasicProven, false);
});

test("plain TI BASIC yields no evidence", () => {
    const r = scanSource("100 FOR I=1 TO 10\n110 PRINT I\n120 NEXT I\n130 END\n");
    assert.strictEqual(r.extendedBasicProven, false);
});

test("Extended BASIC words inside strings and comments are not evidence", () => {
    // This is why the scan uses the lexer rather than a search.
    const cases = [
        "100 PRINT \"USE CALL SPRITE FOR THIS\"\n",
        "100 REM CALL SPRITE AND :: GO HERE\n",
        "100 DATA CALL SPRITE,SUBEND\n",
    ];
    for (const src of cases) {
        assert.strictEqual(scanSource(src).extendedBasicProven, false,
            "must not be evidence: " + JSON.stringify(src));
    }
});

test("an IMAGE body is not scanned, though IMAGE itself is evidence", () => {
    // IMAGE is an Extended BASIC statement, so this line is proven XB. What
    // matters is what proved it: the keyword, not the :: sitting in the
    // format string, which is content rather than code.
    const r = scanSource("100 IMAGE ## :: ##\n");
    assert.ok(r.extendedBasicProven);
    assert.strictEqual(r.detail, "IMAGE", "the keyword proved it, not the :: in the body");
});

test("a tokenized Extended BASIC program is detected", () => {
    const r = scanTokenized(new Uint8Array(fs.readFileSync(fixture("xb-sep.prg"))));
    assert.ok(r.extendedBasicProven);
});

test("a tokenized CALL SPRITE is found in the name payload", () => {
    // The subprogram name is an unquoted-string payload, so it is only found
    // by reading the payload that follows a CALL token.
    const r = scanTokenized(new Uint8Array(fs.readFileSync(fixture("xb-sprite.prg"))));
    assert.ok(r.extendedBasicProven);
    assert.strictEqual(r.detail, "CALL SPRITE");
});

test("a flat byte scan would misreport TI BASIC, the token walk does not", () => {
    // GOTO 130 encodes the line number as >00 >82, and >82 is the :: token.
    // This is the concrete reason the requirement forbids scanning bytes.
    const bytes = new Uint8Array(fs.readFileSync(fixture("tib-goto.prg")));
    const flatWouldSay = [...bytes].some(b => XB_ONLY_TOKENS.has(b));
    assert.ok(flatWouldSay, "a flat scan really does see an XB token value here");
    assert.strictEqual(scanTokenized(bytes).extendedBasicProven, false,
        "walking the stream and skipping payloads gets it right");
});

test("a TIFILES header is stripped before parsing", () => {
    const raw = new Uint8Array(fs.readFileSync(fixture("xb-tifiles.prg")));
    assert.strictEqual(raw[0], 0x07, "fixture really is TIFILES-wrapped");
    assert.strictEqual(stripContainer(raw).length, raw.length - 128);
    assert.ok(scanTokenized(raw).extendedBasicProven,
        "the program inside is Extended BASIC");
});

test("a bare image without a container is still parsed", () => {
    const raw = new Uint8Array(fs.readFileSync(fixture("xb-sep.prg")));
    assert.strictEqual(stripContainer(raw).length, raw.length, "nothing to strip");
});

test("rubbish input is rejected rather than guessed at", () => {
    assert.strictEqual(scanTokenized(new Uint8Array([1, 2, 3])).extendedBasicProven, false);
    assert.strictEqual(scanTokenized(new Uint8Array(0)).extendedBasicProven, false);
});

test("the token table and the keyword list agree", () => {
    // Two lists that must not drift apart: every XB-only keyword we recognise
    // in text should have a token value we recognise in a program.
    const tokenNames = new Set([...XB_ONLY_TOKENS.values()].map(v => v.toUpperCase()));
    for (const word of XB_ONLY_KEYWORDS) {
        assert.ok(tokenNames.has(word),
            word + " is XB-only in source but has no XB-only token value");
    }
});
