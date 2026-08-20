// The BASIC lexer.
//
// The cases that matter are the context-sensitive ones: what follows DATA,
// REM, IMAGE and CALL is not lexed like ordinary code, and a lexer that gets
// those wrong corrupts the program rather than merely mis-colouring it.
const test = require("node:test");
const assert = require("node:assert");
const { Lexer, lexAll, RESERVED } = require("../out/lang/basic/lexer.js");
const fs = require("node:fs");
const path = require("node:path");

const XB = { allowStatementSeparator: true, labels: false };
const TIB = { allowStatementSeparator: false, labels: false };
const LABELS = { allowStatementSeparator: true, labels: true };

const kinds = (text, opts) => lexAll(text, opts || XB)
    .filter(t => t.kind !== "eol").map(t => t.kind);
const texts = (text, opts) => lexAll(text, opts || XB)
    .filter(t => t.kind !== "eol").map(t => t.text);

test("numbers, identifiers and keywords are distinguished", () => {
    assert.deepStrictEqual(kinds("100 LET A=5"),
        ["number", "keyword", "identifier", "operator", "number"]);
});

test("string variables keep their dollar sign", () => {
    assert.deepStrictEqual(texts("A$=B$"), ["A$", "=", "B$"]);
    assert.deepStrictEqual(kinds("A$=B$"), ["identifier", "operator", "identifier"]);
});

test("scientific notation is one token, subtraction is not", () => {
    assert.deepStrictEqual(texts("1E-3"), ["1E-3"]);
    assert.deepStrictEqual(texts("A-3"), ["A", "-", "3"]);
    assert.deepStrictEqual(texts(".5"), [".5"]);
    assert.deepStrictEqual(texts("1.5E9"), ["1.5E9"]);
});

test("two-character operators are single tokens", () => {
    assert.deepStrictEqual(texts("IF A<=B THEN 10"),
        ["IF", "A", "<=", "B", "THEN", "10"]);
    assert.deepStrictEqual(texts("A<>B"), ["A", "<>", "B"]);
});

test("a doubled quote inside a string does not end it", () => {
    const t = lexAll("PRINT \"SAY \"\"HI\"\" NOW\"", XB).filter(x => x.kind === "string");
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].text, "\"SAY \"\"HI\"\" NOW\"");
    assert.strictEqual(t[0].error, undefined);
});

test("an unterminated string is reported, not swallowed", () => {
    const t = lexAll("PRINT \"OOPS", XB).find(x => x.kind === "string");
    assert.strictEqual(t.error, "Unterminated string");
});

test("a string never runs past end of line", () => {
    const toks = lexAll("PRINT \"OOPS\n110 END", XB);
    const s = toks.find(t => t.kind === "string");
    assert.ok(s.error, "should be flagged");
    assert.ok(toks.some(t => t.text === "END"), "the next line must still lex");
});

test("DATA operands: commas separate, quoting is optional", () => {
    const lx = new Lexer("HELLO,42,\"A,B\"", XB);
    const out = [];
    while (!lx.atEnd()) { const t = lx.next("data"); if (t.kind !== "eol") out.push(t); }
    assert.deepStrictEqual(out.map(t => t.text), ["HELLO", ",", "42", ",", "\"A,B\""]);
    assert.deepStrictEqual(out.map(t => t.kind),
        ["data-item", "separator", "data-item", "separator", "string"]);
});

test("comment mode takes everything to end of line", () => {
    const lx = new Lexer(" THIS, \"IS\" ALL :: TEXT\n110 END", XB);
    const t = lx.next("comment");
    assert.strictEqual(t.kind, "comment-text");
    assert.strictEqual(t.text, " THIS, \"IS\" ALL :: TEXT");
});

test("image mode takes everything to end of line", () => {
    const lx = new Lexer("###.##  ####\n", XB);
    const t = lx.next("image");
    assert.strictEqual(t.kind, "image-text");
    assert.strictEqual(t.text, "###.##  ####");
});

test("unquoted mode reads a bare name, as after CALL", () => {
    const lx = new Lexer("SPRITE(#1", XB);
    const t = lx.next("unquoted");
    assert.strictEqual(t.kind, "unquoted-string");
    assert.strictEqual(t.text, "SPRITE");
});

test("the statement separator is Extended BASIC only", () => {
    assert.ok(kinds("A=1 :: B=2", XB).includes("statement-sep"));
    // In TI BASIC :: is two ordinary colons, which the parser will reject.
    const t = kinds("A=1 :: B=2", TIB);
    assert.ok(!t.includes("statement-sep"), "TI BASIC has no statement separator");
});

test("labels are recognised only in label mode and only in column one", () => {
    const t = lexAll("COUNT:\n X=1\n", LABELS).filter(x => x.kind === "label");
    assert.deepStrictEqual(t.map(x => x.text), ["COUNT:"]);
    assert.strictEqual(lexAll("COUNT:\n X=1\n", XB).filter(x => x.kind === "label").length, 0,
        "without label mode a label is not a label");
    // Indented, so it is a variable followed by a colon, not a definition.
    assert.strictEqual(lexAll(" COUNT:\n", LABELS).filter(x => x.kind === "label").length, 0);
});

test("label references carry the at sign", () => {
    const t = lexAll(" IF X<10 THEN @COUNT\n", LABELS).find(x => x.kind === "label-ref");
    assert.strictEqual(t.text, "@COUNT");
});

test("every token records an exact source range", () => {
    const src = "100 PRINT \"HI\"";
    for (const t of lexAll(src, XB)) {
        assert.strictEqual(src.slice(t.start, t.end), t.text,
            "range must reproduce the token text");
    }
});

test("positions survive line breaks", () => {
    const toks = lexAll("100 A=1\n110 B=2\n", XB);
    const b = toks.find(t => t.text === "B");
    assert.strictEqual(b.line, 1, "second line");
    assert.strictEqual(b.column, 4);
});

test("concatenating every token reproduces the source exactly", () => {
    // Whitespace is skipped rather than emitted, so compare with it removed.
    const src = "100 FOR I=1 TO 10 :: PRINT I;\"X\" :: NEXT I";
    const joined = lexAll(src, XB).map(t => t.text).join("");
    assert.strictEqual(joined, src.replace(/[ \t]/g, ""));
});

test("the reserved list matches the tokenizer vocabulary", () => {
    for (const w of ["PRINT", "GOTO", "SUBEND", "RPT$", "SEG$", "VALIDATE"]) {
        assert.ok(RESERVED.has(w), w + " should be reserved");
    }
    for (const w of ["SPRITE", "CLEAR", "HCHAR"]) {
        assert.ok(!RESERVED.has(w),
            w + " is a CALL subprogram name, not a reserved word");
    }
});

/**
 * A minimal mode-aware driver, standing in for the parser.
 *
 * It exists to prove the lexer contract: statement mode alone cannot read a
 * whole program, because the body of REM, DATA and IMAGE is not code. The
 * parser will do this properly; this mirrors the switching rules so the corpus
 * can be checked before the parser exists.
 */
function lexProgram(src, opts) {
    const lx = new Lexer(src, opts);
    const out = [];
    let mode = "statement";
    let guard = 0;
    while (!lx.atEnd() && guard++ < 100000) {
        const t = lx.next(mode);
        out.push(t);
        if (t.kind === "eol") { mode = "statement"; continue; }
        if (mode === "comment" || mode === "image") { continue; }
        if (mode === "unquoted") { mode = "statement"; continue; }
        if (t.kind === "keyword") {
            const w = t.text.toUpperCase();
            if (w === "REM" || w === "!") { mode = "comment"; }
            else if (w === "DATA") { mode = "data"; }
            else if (w === "IMAGE") { mode = "image"; }
            else if (w === "CALL" || w === "SUB") { mode = "unquoted"; }
        }
    }
    return out;
}

test("the authored corpus lexes cleanly through a mode-aware driver", () => {
    const p = path.join(__dirname, "corpus", "constructs.bas");
    const src = fs.readFileSync(p, "utf8");
    const toks = lexProgram(src, { allowStatementSeparator: true, labels: false });
    const bad = toks.filter(t => t.kind === "unknown" || t.error);
    assert.deepStrictEqual(
        bad.map(t => "line " + (t.line + 1) + " col " + t.column + ": " +
                     JSON.stringify(t.text) + " " + (t.error || "")),
        []);
    assert.ok(toks.length > 100, "corpus should be substantial");
});

test("statement mode alone is not enough, which is why modes exist", () => {
    // The same corpus lexed entirely as code reports a problem inside the
    // IMAGE format. This is the lexer being right, not wrong: the parser must
    // tell it when a line is not code.
    const src = fs.readFileSync(path.join(__dirname, "corpus", "constructs.bas"), "utf8");
    const flat = lexAll(src, { allowStatementSeparator: true, labels: false });
    assert.ok(flat.some(t => t.kind === "unknown"),
        "flat lexing should stumble where a mode switch was needed");
});

test("historical programs lex cleanly when available", (t) => {
    const candidates = [
        "C:/Users/kenfi/OneDrive/Desktop/Ti Files/Snake Asm/ATTACK OF THE SLIME CREATURES.bas",
        "C:/Users/kenfi/OneDrive/Desktop/Ti Files/Snake Asm/BATTLE AT STONEHENGE.bas",
        "C:/Users/kenfi/OneDrive/Desktop/xdt99-master/examples/nim.bas",
        "C:/Users/kenfi/OneDrive/Desktop/xdt99-master/test/basic/colors.b99",
    ].filter(f => fs.existsSync(f));
    if (candidates.length === 0) { t.skip("no historical programs on this machine"); return; }
    for (const f of candidates) {
        const toks = lexProgram(fs.readFileSync(f, "utf8"),
            { allowStatementSeparator: true, labels: false });
        const bad = toks.filter(x => x.kind === "unknown" || x.error);
        assert.deepStrictEqual(
            bad.map(x => f.split("/").pop() + " line " + (x.line + 1) + ": " + JSON.stringify(x.text)),
            [], "zero false positives is the requirement for known-good programs");
    }
});
