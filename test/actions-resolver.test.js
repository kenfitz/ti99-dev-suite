// The central action resolver.
//
// These are the acceptance scenarios for command routing. They run against
// the resolver directly, with no editor host, which is the point of keeping
// it free of vscode imports.
const test = require("node:test");
const assert = require("node:assert");
const {
    resolveSource, resolveFileLanguage, resolveTargets, resolveActions,
    defaultTargetFor, artifactIsCurrent, contextKeysFor, renameSourceReferences,
} = require("../out/actions/resolver.js");
const { targetsForLanguage } = require("../out/actions/targets.js");

// A project with two assembly targets sharing modules, plus a BASIC loader.
const PROJECT = {
    name: "Snake",
    sources: ["src/main.a99", "src/graphics.a99", "src/sound.a99"],
    entrySource: "src/main.a99",
    targets: [
        { id: "cart", entrySource: "src/targets/cart.a99",
          sources: ["src/targets/cart.a99", "src/graphics.a99", "src/sound.a99"] },
        { id: "ea5", entrySource: "src/targets/ea.a99",
          sources: ["src/targets/ea.a99", "src/graphics.a99"] },
    ],
};

const ctx = extra => Object.assign({ project: PROJECT, isConfigured: () => true }, extra || {});

test("an entry source is recognised as runnable", () => {
    const r = resolveSource("src/targets/cart.a99", ctx());
    assert.strictEqual(r.role, "entry");
});

test("a shared module is not independently runnable", () => {
    // graphics.a99 belongs to both targets and is an entry to neither.
    const r = resolveSource("src/graphics.a99", ctx());
    assert.strictEqual(r.role, "module");
    assert.deepStrictEqual(r.containingTargets.map(t => t.id), ["cart", "ea5"]);
});

test("a module offers its containing target, not a standalone build", () => {
    const plan = resolveActions("src/graphics.a99", ctx());
    const labels = plan.actions.map(a => a.label);
    assert.ok(labels.includes("Build Containing Target"));
    assert.ok(labels.includes("Build and Run Containing Target"));
    assert.ok(!labels.includes("Build and Run"), "must not pretend it is a program");
});

test("a module in more than one target reports both for the picker", () => {
    const plan = resolveActions("src/graphics.a99", ctx());
    assert.deepStrictEqual(plan.containingTargetIds, ["cart", "ea5"]);
});

test("a module in one target still reports that target", () => {
    const plan = resolveActions("src/sound.a99", ctx());
    assert.deepStrictEqual(plan.containingTargetIds, ["cart"]);
});

test("a file with no project is standalone", () => {
    const r = resolveSource("C:/tmp/hello.a99", {});
    assert.strictEqual(r.role, "standalone");
    const plan = resolveActions("C:/tmp/hello.a99", {});
    assert.ok(plan.actions.some(a => a.kind === "build-run"),
        "standalone files still get useful actions");
});

test("assembly entry offers the assembly distribution routes", () => {
    const choices = resolveTargets("tms9900", "build-run", ctx());
    const ids = choices.map(c => c.target.id);
    assert.deepStrictEqual(ids, ["cart", "ea3", "ea5", "ea-disk", "xb-loader"]);
});

test("the target list contains only targets for that language", () => {
    for (const [lang, expected] of [
        ["ti-basic", ["basic-program", "basic-disk", "basic-under-xb"]],
        ["ti-extended-basic", ["xb-basic-program", "xb-basic-disk", "xb-autorun-disk"]],
    ]) {
        const ids = resolveTargets(lang, "build-run", ctx()).map(c => c.target.id);
        assert.deepStrictEqual(ids, expected, lang);
        for (const id of ids) {
            assert.ok(!targetsForLanguage(lang === "ti-basic" ? "tms9900" : "tms9900")
                .some(t => t.id === id), "no assembly target leaked into " + lang);
        }
    }
});

test("TI BASIC can run under Extended BASIC as an alternate runtime", () => {
    const ids = resolveTargets("ti-basic", "run", ctx()).map(c => c.target.id);
    assert.ok(ids.includes("basic-under-xb"), "offered as a runtime choice");
    // It is a runtime, not a build product: it does not appear for building.
    const buildIds = resolveTargets("ti-basic", "build", ctx()).map(c => c.target.id);
    assert.ok(!buildIds.includes("basic-under-xb"),
        "running under XB does not change the source dialect");
});

test("Extended BASIC source is never offered TI BASIC as a runtime", () => {
    for (const action of ["run", "build-run", "build"]) {
        const ids = resolveTargets("ti-extended-basic", action, ctx()).map(c => c.target.id);
        assert.ok(!ids.some(id => id.startsWith("basic-") && !id.startsWith("basic-under")),
            "no TI BASIC target for XB source in " + action);
    }
});

test("an unavailable target stays listed with the setting to fix", () => {
    // Offering it and then failing with a process error is the behaviour this
    // replaces. The user needs to be told which setting is missing.
    const missingXb = resolveTargets("tms9900", "build-run",
        ctx({ isConfigured: k => k !== "ti99.emulator.classic99XbRom" }));
    const loader = missingXb.find(c => c.target.id === "xb-loader");
    assert.ok(loader, "still listed");
    assert.strictEqual(loader.availability.available, false);
    assert.deepStrictEqual(loader.availability.missing, ["ti99.emulator.classic99XbRom"]);
    const cart = missingXb.find(c => c.target.id === "cart");
    assert.ok(cart.availability.available, "unrelated targets are unaffected");
});

test("a project default bypasses the target question", () => {
    const p = Object.assign({}, PROJECT, { defaultTarget: "ea5" });
    assert.strictEqual(defaultTargetFor("tms9900", { project: p }), "ea5");
    const choices = resolveTargets("tms9900", "build-run", { project: p, isConfigured: () => true });
    assert.strictEqual(choices.filter(c => c.isDefault).length, 1);
    assert.strictEqual(choices.find(c => c.isDefault).target.id, "ea5");
});

test("a per-source default beats the project default", () => {
    const p = Object.assign({}, PROJECT, {
        defaultTarget: "cart",
        sourceDefaults: { "src/diagnostic.a99": "ea5" },
    });
    assert.strictEqual(defaultTargetFor("tms9900", { project: p }, "src/diagnostic.a99"), "ea5");
    assert.strictEqual(defaultTargetFor("tms9900", { project: p }, "src/main.a99"), "cart");
});

test("with no configuration the language default applies", () => {
    assert.strictEqual(defaultTargetFor("tms9900", {}), "cart");
    assert.strictEqual(defaultTargetFor("ti-basic", {}), "basic-program");
    assert.strictEqual(defaultTargetFor("ti-extended-basic", {}), "xb-basic-program");
});

test("choosing a target once does not silently become a preference", () => {
    // Nothing in the resolver writes a default. Persisting a one-off choice
    // would take the decision away from the user without asking.
    const p = Object.assign({}, PROJECT);
    resolveTargets("tms9900", "build-run", { project: p, isConfigured: () => true });
    assert.strictEqual(p.defaultTarget, undefined);
    assert.strictEqual(p.sourceDefaults, undefined);
});

test("Build and Run As always offers the picker", () => {
    const plan = resolveActions("src/targets/cart.a99", ctx());
    const chooser = plan.actions.find(a => a.label === "Build and Run As...");
    assert.ok(chooser, "the chooser variant exists alongside the default one");
    assert.strictEqual(chooser.choosesTarget, true);
    const plain = plan.actions.find(a => a.label === "Build and Run");
    assert.ok(plain && !plain.choosesTarget, "the plain one uses the resolved default");
});

test("a stale artifact is not current", () => {
    assert.strictEqual(artifactIsCurrent(1000, 2000), false, "source newer than artifact");
    assert.strictEqual(artifactIsCurrent(2000, 1000), true);
    assert.strictEqual(artifactIsCurrent(2000, 2000), true, "same instant counts as current");
    assert.strictEqual(artifactIsCurrent(undefined, 1000), false, "never built");
    assert.strictEqual(artifactIsCurrent(1000, undefined), true, "unknown source time");
});

test("an ambiguous .bas offers only the dialect question", () => {
    const plan = resolveActions("legacy/PROGRAM.BAS", { readSource: () => "100 PRINT 1\n" });
    assert.ok(plan.needsDialectChoice, "must ask before offering anything");
    assert.deepStrictEqual(plan.actions.map(a => a.command), ["ti99.selectDialect"]);
});

test("a .bas proven Extended BASIC skips the question entirely", () => {
    const plan = resolveActions("legacy/PROGRAM.BAS", {
        readSource: () => "100 CALL SPRITE(#1,42,2,1,1)\n",
    });
    assert.strictEqual(plan.needsDialectChoice, undefined);
    assert.strictEqual(plan.language.language, "ti-extended-basic");
    assert.ok(plan.actions.some(a => a.label === "Validate Extended BASIC"));
});

test("a legacy .b99 holding Extended BASIC resolves as Extended BASIC", () => {
    // xdt99 writes .b99 for both dialects, so this is a real collection, not
    // a hypothetical one.
    const plan = resolveActions("legacy/GAME.b99", {
        readSource: () => "100 CALL SPRITE(#1,42,2,1,1)\n110 A=1 :: B=2\n",
    });
    assert.strictEqual(plan.language.language, "ti-extended-basic");
    assert.ok(plan.actions.some(a => a.label === "Validate Extended BASIC"));
});

test("a .b99 in an Extended BASIC project is Extended BASIC", () => {
    const plan = resolveActions("src/game.b99", {
        project: { name: "X", sources: [], language: "ti-extended-basic" },
    });
    assert.strictEqual(plan.language.language, "ti-extended-basic");
    assert.strictEqual(plan.language.source, "project");
});

test("evidence is not gathered for assembly", () => {
    let read = false;
    resolveActions("src/main.a99", ctx({ readSource: () => { read = true; return ""; } }));
    assert.strictEqual(read, false, "an .a99 file never needs a dialect scan");
});

test("context keys describe the file for the when clauses", () => {
    const entry = contextKeysFor(resolveActions("src/targets/cart.a99", ctx()));
    assert.strictEqual(entry["ti99.language"], "tms9900");
    assert.strictEqual(entry["ti99.isEntrySource"], true);
    assert.strictEqual(entry["ti99.canRun"], true);

    const mod = contextKeysFor(resolveActions("src/graphics.a99", ctx()));
    assert.strictEqual(mod["ti99.isEntrySource"], false);
    assert.strictEqual(mod["ti99.hasContainingTarget"], true);

    const ambiguous = contextKeysFor(resolveActions("x.bas", { readSource: () => "100 END\n" }));
    assert.strictEqual(ambiguous["ti99.language"], "basic-ambiguous");

    const foreign = contextKeysFor(resolveActions("notes.txt", {}));
    assert.strictEqual(foreign["ti99.language"], "", "no TI menu on unrelated files");
    assert.strictEqual(foreign["ti99.canBuild"], false);
});

test("the Explorer menu and the Command Palette cannot diverge", () => {
    // Both surfaces call these same two functions. This test is the guard
    // against a future change adding a second, separate target list.
    const path = "src/targets/cart.a99";
    const fromMenu = resolveActions(path, ctx());
    const fromPalette = resolveActions(path, ctx());
    assert.deepStrictEqual(fromMenu.actions, fromPalette.actions);
    const menuTargets = resolveTargets("tms9900", "build-run", ctx()).map(c => c.target.id);
    const paletteTargets = resolveTargets("tms9900", "build-run", ctx()).map(c => c.target.id);
    assert.deepStrictEqual(menuTargets, paletteTargets);
});

test("renaming a source updates every project reference", () => {
    const config = {
        name: "Game",
        sources: ["src/game.b99", "src/util.a99"],
        entrySource: "src/game.b99",
        basicSource: "src/game.b99",
        sourceDefaults: { "src/game.b99": "xb-basic-disk" },
        targets: [
            { id: "disk", entrySource: "src/game.b99", sources: ["src/game.b99"] },
            { id: "other", entrySource: "src/util.a99", sources: ["src/util.a99"] },
        ],
    };
    const { config: next, changed } = renameSourceReferences(
        config, "src/game.b99", "src/game.xb99");

    assert.deepStrictEqual(next.sources, ["src/game.xb99", "src/util.a99"]);
    assert.strictEqual(next.entrySource, "src/game.xb99");
    assert.strictEqual(next.basicSource, "src/game.xb99");
    assert.deepStrictEqual(next.targets[0].sources, ["src/game.xb99"]);
    assert.strictEqual(next.targets[0].entrySource, "src/game.xb99");
    assert.deepStrictEqual(next.sourceDefaults, { "src/game.xb99": "xb-basic-disk" });
    assert.ok(changed.length >= 6, "every change is reported for review");
});

test("renaming leaves unrelated references alone", () => {
    const config = {
        name: "Game",
        sources: ["src/game.b99", "src/util.a99"],
        entrySource: "src/util.a99",
        targets: [{ id: "t", entrySource: "src/util.a99", sources: ["src/util.a99"] }],
    };
    const { config: next, changed } = renameSourceReferences(
        config, "src/game.b99", "src/game.xb99");
    assert.strictEqual(next.entrySource, "src/util.a99");
    assert.deepStrictEqual(next.targets[0].sources, ["src/util.a99"]);
    assert.strictEqual(changed.length, 1, "only the sources entry changed");
});

test("renaming matches an absolute path against relative project paths", () => {
    // ti99.json holds relative paths; the editor hands over an absolute one.
    const config = { name: "G", sources: ["src/game.b99"], entrySource: "src/game.b99" };
    const { config: next } = renameSourceReferences(
        config, "C:/work/proj/src/game.b99", "C:/work/proj/src/game.xb99");
    assert.strictEqual(next.entrySource, "src/game.xb99",
        "the project keeps its relative form");
});

test("renaming does not mutate the config it was given", () => {
    const config = { name: "G", sources: ["src/game.b99"], entrySource: "src/game.b99" };
    renameSourceReferences(config, "src/game.b99", "src/game.xb99");
    assert.strictEqual(config.entrySource, "src/game.b99", "caller keeps the original");
});
