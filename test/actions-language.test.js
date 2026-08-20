// Language resolution: canonical extensions, aliases, and the precedence model.
const test = require("node:test");
const assert = require("node:assert");
const {
    resolveLanguage, presumeFromExtension, importFilename, extensionOf, LANGUAGES,
} = require("../out/actions/languages.js");

const at = (path, extra) => resolveLanguage(Object.assign({ path }, extra || {}));

test("canonical extensions resolve to their language", () => {
    assert.strictEqual(at("src/game.a99").language, "tms9900");
    assert.strictEqual(at("src/game.b99").language, "ti-basic");
    assert.strictEqual(at("src/game.xb99").language, "ti-extended-basic");
    assert.strictEqual(at("src/game.g99").language, "gpl");
});

test("aliases are first-class, not second-class", () => {
    assert.strictEqual(at("src/game.asm").language, "tms9900");
    assert.strictEqual(at("src/game.xb").language, "ti-extended-basic");
    assert.strictEqual(at("src/game.gpl").language, "gpl");
});

test("extension matching ignores case and directory noise", () => {
    assert.strictEqual(extensionOf("C:/Path.With.Dots/GAME.XB99"), ".xb99");
    assert.strictEqual(at("GAME.A99").language, "tms9900");
    assert.strictEqual(extensionOf("no-extension"), "");
});

test(".bas is dialect-neutral, never resolved by name alone", () => {
    const r = at("src/game.bas");
    assert.strictEqual(r.language, undefined);
    assert.ok(r.ambiguous);
    assert.deepStrictEqual(r.candidates, ["ti-basic", "ti-extended-basic"]);
});

test("absence of Extended BASIC syntax never proves TI BASIC", () => {
    // The whole point: a TI BASIC program is also a valid XB program, so
    // finding nothing tells us nothing.
    const r = at("src/game.bas", { extendedBasicProven: false });
    assert.ok(r.ambiguous, "must stay ambiguous and ask");
    assert.strictEqual(r.language, undefined);
});

test("Extended BASIC evidence settles a neutral .bas", () => {
    const r = at("src/game.bas", { extendedBasicProven: true, evidenceDetail: "CALL SPRITE" });
    assert.strictEqual(r.language, "ti-extended-basic");
    assert.strictEqual(r.source, "content");
    assert.ok(!r.ambiguous);
    assert.match(r.reason, /CALL SPRITE/);
});

test("project configuration overrides the extension", () => {
    const r = at("src/game.b99", { projectLanguage: "ti-extended-basic" });
    assert.strictEqual(r.language, "ti-extended-basic");
    assert.strictEqual(r.source, "project");
});

test("a per-file override supersedes project configuration", () => {
    const r = at("src/game.b99", {
        projectLanguage: "ti-extended-basic", fileOverride: "ti-basic",
    });
    assert.strictEqual(r.language, "ti-basic");
    assert.strictEqual(r.source, "file-override");
});

test(".b99 is a weak presumption, so evidence outranks it", () => {
    // xdt99 writes .b99 for both dialects, so the name is a hint. A file that
    // uses an XB-only construct cannot be TI BASIC whatever it is called.
    const r = at("legacy/game.b99", { extendedBasicProven: true, evidenceDetail: "CALL SPRITE" });
    assert.strictEqual(r.language, "ti-extended-basic");
    assert.strictEqual(r.source, "content");
    assert.match(r.reason, /both dialects/);
});

test("a declaration is honoured even when the source contradicts it", () => {
    // The user said what they meant. The construct is the error, so this is
    // reported as a conflict for the diagnostics layer, not re-resolved.
    const r = at("src/game.b99", {
        projectLanguage: "ti-basic", extendedBasicProven: true, evidenceDetail: "CALL SPRITE",
    });
    assert.strictEqual(r.language, "ti-basic", "declaration wins");
    assert.ok(r.conflict, "but the contradiction is reported");
    assert.match(r.conflict, /Extended BASIC-only/);
});

test("strong presumptions report a conflict rather than flipping", () => {
    const r = at("src/game.xb99", { extendedBasicProven: true });
    assert.strictEqual(r.language, "ti-extended-basic");
    assert.strictEqual(r.conflict, undefined, "agreement is not a conflict");
});

test("a user choice resolves an otherwise ambiguous file", () => {
    const r = at("src/game.bas", { userChoice: "ti-basic" });
    assert.strictEqual(r.language, "ti-basic");
    assert.strictEqual(r.source, "user");
});

test("unknown extensions are not TI source", () => {
    const r = at("notes.txt");
    assert.strictEqual(r.language, undefined);
    assert.ok(r.ambiguous);
});

test("presumption strength is weak only for .b99", () => {
    assert.strictEqual(presumeFromExtension("a.b99").strength, "weak");
    for (const p of ["a.a99", "a.xb99", "a.g99", "a.xb", "a.asm", "a.gpl"]) {
        assert.strictEqual(presumeFromExtension(p).strength, "strong", p);
    }
});

test("import naming comes from the resolved dialect, not from xbas99", () => {
    // xbas99 writes .b99 for both dialects. Letting that default decide would
    // mislabel every imported Extended BASIC program.
    assert.strictEqual(importFilename("GAME", "ti-basic"), "GAME.b99");
    assert.strictEqual(importFilename("GAME", "ti-extended-basic"), "GAME.xb99");
    assert.strictEqual(importFilename("GAME", "tms9900"), "GAME.a99");
});

test("every language declares its targets", () => {
    for (const l of LANGUAGES) {
        assert.ok(Array.isArray(l.buildTargets), l.id);
        if (l.defaultTarget) {
            assert.ok(l.buildTargets.includes(l.defaultTarget) || l.runTargets.includes(l.defaultTarget),
                l.id + " default target must be one of its own targets");
        }
    }
});
