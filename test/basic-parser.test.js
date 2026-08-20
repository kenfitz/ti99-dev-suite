// Parser, binder and validator for TI BASIC and Extended BASIC.
//
// The parser is dialect-aware rather than duplicated, so most tests run the
// same source through both dialects and assert on the difference. A construct
// only Extended BASIC accepts still parses in TI BASIC and is reported as a
// dialect problem, because "ACCEPT requires Extended BASIC" helps someone and
// "syntax error" does not.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("../out/lang/basic/parser.js");
const { bind } = require("../out/lang/basic/binder.js");
const { validate } = require("../out/lang/basic/validator.js");

const TIB = "ti-basic";
const XB = "ti-extended-basic";

const statementsOf = (src, dialect) =>
    parse(src, { dialect }).program.lines.flatMap(l => l.statements);
const kindsOf = (src, dialect) => statementsOf(src, dialect).map(s => s.kind);
const errorsOf = (src, dialect) =>
    validate(src, { dialect }).diagnostics.filter(d => d.severity === "error");
const codesOf = (src, dialect) => errorsOf(src, dialect).map(d => d.code);

// --- statement families ----------------------------------------------------

test("the ordinary statement families parse", () => {
    const cases = [
        ["100 LET A=1", "Assignment"],
        ["100 A=1", "Assignment"],
        ["100 PRINT A", "PrintStatement"],
        ["100 INPUT A", "InputStatement"],
        ["100 IF A THEN 200", "IfStatement"],
        ["100 FOR I=1 TO 5", "ForStatement"],
        ["100 NEXT I", "NextStatement"],
        ["100 GOTO 10", "GotoStatement"],
        ["100 GOSUB 10", "GotoStatement"],
        ["100 RETURN", "ReturnStatement"],
        ["100 ON X GOTO 1,2", "OnGotoStatement"],
        ["100 DATA 1,2", "DataStatement"],
        ["100 READ A", "ReadStatement"],
        ["100 RESTORE 10", "RestoreStatement"],
        ["100 DIM A(5)", "DimStatement"],
        ["100 DEF FN(X)=X*2", "DefStatement"],
        ["100 OPTION BASE 1", "OptionStatement"],
        ["100 OPEN #1:\"DSK1.F\"", "OpenStatement"],
        ["100 CLOSE #1", "CloseStatement"],
        ["100 CALL CLEAR", "CallStatement"],
        ["100 REM hello", "Comment"],
        ["100 END", "SimpleStatement"],
        ["100 RANDOMIZE", "SimpleStatement"],
    ];
    for (const [src, expected] of cases) {
        assert.deepStrictEqual(kindsOf(src + "\n", TIB), [expected], src);
    }
});

test("GO TO and GO SUB are accepted as spelling variants", () => {
    assert.deepStrictEqual(kindsOf("100 GO TO 200\n", TIB), ["GotoStatement"]);
    assert.deepStrictEqual(kindsOf("100 GO SUB 200\n", TIB), ["GotoStatement"]);
    assert.strictEqual(statementsOf("100 GO SUB 200\n", TIB)[0].keyword, "GOSUB");
});

test("Extended BASIC statements parse in both dialects", () => {
    // They must parse in TI BASIC too, so the diagnostic can be about the
    // dialect rather than about the syntax.
    for (const src of ["100 SUB FOO\n", "100 SUBEND\n", "100 LINPUT A$\n",
                       "100 ACCEPT AT(1,1):A\n", "100 IMAGE ###\n", "100 RUN 100\n"]) {
        assert.ok(kindsOf(src, TIB).length > 0, src + " must still parse");
        assert.ok(kindsOf(src, XB).length > 0, src);
    }
});

// --- expressions -----------------------------------------------------------

test("operator precedence follows the manual", () => {
    // Folded rather than inspected, so the assertion is about meaning.
    const evaluate = n => {
        switch (n.kind) {
            case "NumericLiteral": return n.value;
            case "ParenExpression": return evaluate(n.inner);
            case "UnaryExpression":
                return n.operator === "-" ? -evaluate(n.operand) : evaluate(n.operand);
            case "BinaryExpression": {
                const a = evaluate(n.left), b = evaluate(n.right);
                return { "+": a + b, "-": a - b, "*": a * b, "/": a / b,
                         "^": Math.pow(a, b) }[n.operator];
            }
            default: return NaN;
        }
    };
    const cases = [
        ["2+3*4", 14], ["2+3*4^2", 50], ["(2+3)*4", 20],
        ["2^3^2", 512],        // exponentiation is right-associative
        ["-2^2", -4],          // unary minus binds looser than ^
        ["10-2-3", 5], ["8/4/2", 1],
    ];
    for (const [expr, expected] of cases) {
        const value = evaluate(statementsOf("100 A=" + expr + "\n", TIB)[0].value);
        assert.strictEqual(value, expected, expr);
    }
});

test("relational and logical operators parse", () => {
    for (const op of ["=", "<>", "<", ">", "<=", ">="]) {
        const s = statementsOf("100 IF A" + op + "B THEN 200\n", TIB)[0];
        assert.strictEqual(s.condition.kind, "BinaryExpression", op);
        assert.strictEqual(s.condition.operator, op);
    }
    assert.strictEqual(statementsOf("100 IF A AND B THEN 1\n", TIB)[0].condition.operator, "AND");
});

test("string concatenation is Extended BASIC only", () => {
    assert.deepStrictEqual(codesOf("100 A$=B$&C$\n", XB), []);
    assert.ok(codesOf("100 A$=B$&C$\n", TIB).includes("xb-operator"));
});

test("a function call and an array reference look the same to the parser", () => {
    // Only the symbol table can tell them apart, so the parser records a call
    // and the binder decides. Recording the wrong one here would be a guess.
    const s = statementsOf("100 A=SCORE(1)\n", TIB)[0];
    assert.strictEqual(s.value.kind, "FunctionCall");
});

// --- context-sensitive syntax ---------------------------------------------

test("DATA keeps its operands as written", () => {
    const s = statementsOf('100 DATA HELLO,42,"A,B",\n', TIB)[0];
    assert.deepStrictEqual(s.values.map(v => v.text), ["HELLO", "42", "A,B"]);
    assert.deepStrictEqual(s.values.map(v => v.quoted), [false, false, true]);
});

test("an IMAGE format runs to end of line", () => {
    const s = statementsOf("100 IMAGE ###.## :: ####\n", XB)[0];
    assert.strictEqual(s.kind, "ImageStatement");
    assert.strictEqual(s.format.trim(), "###.## :: ####");
});

test("REM and ! take the rest of the line", () => {
    const rem = statementsOf("100 REM A=1 :: B=2\n", XB)[0];
    assert.strictEqual(rem.kind, "Comment");
    assert.match(rem.text, /A=1/);
    const bang = statementsOf("100 A=1 ! trailing\n", XB);
    assert.deepStrictEqual(bang.map(s => s.kind), ["Assignment", "Comment"]);
});

test("a colon inside PRINT is a separator, not the end of the statement", () => {
    // 110 PRINT :"X" prints a blank line then the string. Treating the colon
    // as a statement boundary breaks real programs; nim.bas opens with one.
    const s = statementsOf('110 PRINT :"X"\n', TIB)[0];
    assert.strictEqual(s.kind, "PrintStatement");
    assert.deepStrictEqual(s.items.map(i => i.separator || i.expression.kind),
        [":", "StringLiteral"]);
});

test("the statement separator is Extended BASIC only", () => {
    assert.deepStrictEqual(kindsOf("100 A=1 :: B=2\n", XB), ["Assignment", "Assignment"]);
    assert.ok(codesOf("100 A=1 :: B=2\n", TIB).includes("xb-statement-separator"));
});

test("statements after THEN require Extended BASIC", () => {
    // The target has to exist, or the dangling-reference check fires and
    // the assertion ends up measuring the wrong thing.
    assert.deepStrictEqual(codesOf("100 IF A THEN 200\n200 END\n", TIB), [],
        "a line number is fine in both dialects");
    assert.ok(codesOf("100 IF A THEN PRINT A\n", TIB).includes("xb-if-statement"));
    assert.deepStrictEqual(codesOf("100 IF A THEN PRINT A ELSE PRINT B\n", XB), []);
});

test("the subprogram name after CALL is read as a name, not an expression", () => {
    const s = statementsOf("100 CALL SPRITE(#1,42,2,1,1)\n", XB)[0];
    assert.strictEqual(s.name, "SPRITE");
    assert.strictEqual(s.args.length, 5);
});

// --- ranges ----------------------------------------------------------------

test("every node carries a range that slices back to its own text", () => {
    const src = '100 PRINT "HI";A\n';
    const { program } = parse(src, { dialect: TIB });
    const check = node => {
        assert.ok(node.start <= node.end, node.kind + " has an inverted range");
        assert.ok(node.end <= src.length, node.kind + " runs past the document");
    };
    const walk = n => {
        check(n);
        for (const v of Object.values(n)) {
            if (Array.isArray(v)) { v.forEach(x => x && x.kind && walk(x)); }
            else if (v && typeof v === "object" && v.kind) { walk(v); }
        }
    };
    program.lines.forEach(walk);
    const literal = statementsOf(src, TIB)[0].items[0].expression;
    assert.strictEqual(src.slice(literal.start, literal.end), '"HI"');
});

// --- binder ----------------------------------------------------------------

const bindingOf = (src, dialect) => {
    const { program } = parse(src, { dialect });
    return bind(program, dialect);
};

test("lines are indexed and duplicates are recorded", () => {
    const b = bindingOf("100 END\n110 END\n100 END\n", TIB);
    assert.deepStrictEqual([...b.lines.keys()], [100, 110]);
    assert.deepStrictEqual(b.duplicateLines.map(d => d.number), [100]);
});

test("branch targets are resolved forwards and backwards", () => {
    const b = bindingOf("100 GOTO 300\n200 GOTO 100\n300 END\n", TIB);
    assert.strictEqual(b.lines.get(300).references.length, 1, "forward branch");
    assert.strictEqual(b.lines.get(100).references.length, 1, "backward branch");
    assert.deepStrictEqual(b.danglingReferences, []);
});

test("a branch to a line that does not exist is recorded", () => {
    const b = bindingOf("100 GOTO 999\n", TIB);
    assert.deepStrictEqual(b.danglingReferences.map(r => r.value), [999]);
});

test("line references are found in every construct that takes one", () => {
    const src = [
        "100 GOTO 900", "110 GOSUB 900", "120 IF A THEN 900",
        "130 ON X GOTO 900,900", "140 RESTORE 900", "150 RUN 900",
        "900 END", "",
    ].join("\n");
    const b = bindingOf(src, XB);
    assert.strictEqual(b.lines.get(900).references.length, 7,
        "every reference to line 900 should be recorded");
});

test("arrays are distinguished from variables by DIM", () => {
    const b = bindingOf("100 DIM SCORE(10)\n110 SCORE(1)=5\n120 A=1\n", TIB);
    assert.strictEqual(b.symbols.get("SCORE").kind, "array");
    assert.strictEqual(b.symbols.get("SCORE").dimensions, 1);
    assert.strictEqual(b.symbols.get("A").kind, "variable");
});

test("string variables are recorded as such", () => {
    const b = bindingOf('100 A$="X"\n', TIB);
    assert.strictEqual(b.symbols.get("A$").kind, "string-variable");
});

test("subprograms record their parameters and their call sites", () => {
    const src = "100 CALL GREET(1)\n110 SUB GREET(N)\n120 SUBEND\n";
    const b = bindingOf(src, XB);
    assert.deepStrictEqual(b.subs.get("GREET").parameters, ["N"]);
    assert.ok(b.subs.get("GREET").definition, "the SUB is the definition");
    assert.strictEqual(b.subs.get("GREET").references.length, 1, "the CALL is a reference");
});

test("subprogram parameters are scoped to their subprogram", () => {
    const b = bindingOf("100 SUB GREET(N)\n110 PRINT N\n120 SUBEND\n", XB);
    assert.strictEqual(b.symbols.get("N").kind, "sub-parameter");
    assert.strictEqual(b.symbols.get("N").scope, "GREET");
});

test("a built-in CALL is not mistaken for a user subprogram", () => {
    const b = bindingOf("100 CALL CLEAR\n", TIB);
    assert.strictEqual(b.subs.size, 0);
    assert.strictEqual(b.calls.length, 1);
});

// --- validation ------------------------------------------------------------

test("a correct program produces no diagnostics", () => {
    const src = [
        "100 CALL CLEAR", "110 FOR I=1 TO 10", '120 PRINT "HELLO ";I',
        "130 NEXT I", "140 END", "",
    ].join("\n");
    assert.deepStrictEqual(codesOf(src, TIB), []);
    assert.deepStrictEqual(codesOf(src, XB), []);
});

test("Extended BASIC subprograms are rejected in TI BASIC by name", () => {
    const errors = errorsOf("100 CALL SPRITE(#1,42,2,1,1)\n", TIB);
    assert.deepStrictEqual(errors.map(e => e.code), ["wrong-dialect-subprogram"]);
    assert.match(errors[0].message, /Extended BASIC/);
    assert.match(errors[0].message, /SPRITE/);
});

test("an unknown CALL is an error in TI BASIC, which has no user subprograms", () => {
    assert.ok(codesOf("100 CALL WOBBLE\n", TIB).includes("unknown-subprogram"));
});

test("an undefined subprogram is reported in Extended BASIC", () => {
    assert.ok(codesOf("100 CALL WOBBLE\n", XB).includes("undefined-sub"));
    assert.deepStrictEqual(codesOf("100 CALL W\n110 SUB W\n120 SUBEND\n", XB), []);
});

test("subprogram argument counts are checked against the declaration", () => {
    const src = "100 CALL GREET(1,2)\n110 SUB GREET(N)\n120 SUBEND\n";
    assert.ok(codesOf(src, XB).includes("sub-argument-count"));
});

test("documented argument ranges are enforced for literals", () => {
    assert.ok(codesOf("100 CALL SOUND(500,440,99)\n", TIB).includes("argument-range"));
    assert.ok(codesOf("100 CALL SOUND(500,50,2)\n", TIB).includes("argument-range"));
    assert.ok(codesOf("100 CALL MAGNIFY(9)\n", XB).includes("argument-range"));
});

test("CALL SOUND accepts a noise frequency, which is a separate range", () => {
    // 110 to 44733 for a tone, or -8 to -1 for noise, and nothing between. One
    // min and max cannot express that.
    assert.deepStrictEqual(codesOf("100 CALL SOUND(500,-3,2)\n", TIB), []);
    assert.ok(codesOf("100 CALL SOUND(500,-99,2)\n", TIB).includes("argument-range"));
});

test("a negative duration is legal and means interrupt", () => {
    assert.deepStrictEqual(codesOf("100 CALL SOUND(-500,440,2)\n", TIB), []);
});

test("ranges are checked only for literals, never for variables", () => {
    // A variable might hold anything. Guessing is how a validator becomes noise.
    assert.deepStrictEqual(codesOf("100 CALL SOUND(D,F,V)\n", TIB), []);
    assert.deepStrictEqual(codesOf("100 CALL MAGNIFY(N)\n", XB), []);
});

test("CALL CHAR checks its pattern", () => {
    assert.deepStrictEqual(codesOf('100 CALL CHAR(128,"3C7EFFFF")\n', TIB), []);
    assert.ok(codesOf('100 CALL CHAR(128,"ZZZZ")\n', TIB).includes("argument-hex"));
    assert.ok(codesOf('100 CALL CHAR(200,"FF")\n', TIB).includes("argument-range"));
});

test("CALL CHAR accepts the codes real programs use", () => {
    // The manual documents 32 to 143, but published Extended BASIC programs
    // define characters up to 159. Erroring on them would put false errors on
    // working software, so the check uses the character-set limit instead.
    for (const code of [144, 145, 154, 155, 159]) {
        assert.deepStrictEqual(codesOf('100 CALL CHAR(' + code + ',"FF")\n', XB), [],
            "character code " + code + " occurs in real programs");
    }
});

test("an output argument must be somewhere the interpreter can write", () => {
    assert.ok(codesOf("100 CALL VERSION(5)\n", XB).includes("argument-not-writable"));
    assert.deepStrictEqual(codesOf("100 CALL VERSION(V)\n", XB), []);
});

test("too few arguments are reported with the documented syntax", () => {
    const errors = errorsOf("100 CALL HCHAR(1)\n", TIB);
    assert.strictEqual(errors[0].code, "argument-count");
    assert.match(errors[0].message, /CALL HCHAR/);
});

test("SUB structure is checked", () => {
    assert.ok(codesOf("100 SUB A\n110 PRINT 1\n", XB).includes("sub-not-closed"));
    assert.ok(codesOf("100 SUBEND\n", XB).includes("subend-without-sub"));
    assert.ok(codesOf("100 SUBEXIT\n", XB).includes("subexit-outside-sub"));
    assert.ok(codesOf("100 SUB A\n110 SUBEND\n120 SUB A\n130 SUBEND\n", XB)
        .includes("duplicate-sub"));
    assert.deepStrictEqual(codesOf("100 SUB A\n110 SUBEXIT\n120 SUBEND\n", XB), []);
});

test("FOR needs a simple variable", () => {
    assert.ok(codesOf("100 DIM A(3)\n110 FOR A(1)=1 TO 5\n", TIB)
        .includes("for-needs-simple-variable"));
});

test("line numbers must be within the interpreter range", () => {
    assert.ok(codesOf("99999 END\n", TIB).includes("line-number-range"));
    assert.deepStrictEqual(codesOf("32767 END\n", TIB), []);
});

// --- the regression corpus -------------------------------------------------

test("the authored corpus validates without a single error", () => {
    const src = fs.readFileSync(path.join(__dirname, "corpus", "constructs.bas"), "utf8");
    assert.deepStrictEqual(errorsOf(src, XB).map(e => e.code + " line " + (e.line + 1)), []);
});

test("historical programs validate without a single error", (t) => {
    // The requirement is zero false errors on known-good software. These are
    // real published programs, not samples written to suit the parser.
    const candidates = [
        "C:/Users/kenfi/OneDrive/Desktop/Ti Files/Snake Asm/ATTACK OF THE SLIME CREATURES.bas",
        "C:/Users/kenfi/OneDrive/Desktop/Ti Files/Snake Asm/BATTLE AT STONEHENGE.bas",
        "C:/Users/kenfi/OneDrive/Desktop/xdt99-master/examples/nim.bas",
        "C:/Users/kenfi/OneDrive/Desktop/xdt99-master/test/basic/colors.b99",
    ].filter(f => fs.existsSync(f));
    if (candidates.length === 0) { t.skip("no historical programs on this machine"); return; }
    for (const file of candidates) {
        const errors = errorsOf(fs.readFileSync(file, "utf8"), XB);
        assert.deepStrictEqual(
            errors.map(e => file.split("/").pop() + " line " + (e.line + 1) + ": " + e.code),
            []);
    }
});
