// Native BASIC program formats, project schema, and the shipped templates.
//
// The format tests matter because the two native formats are not
// interchangeable: standard loads on an unexpanded console and is what
// Extended BASIC auto-runs from DSK1.LOAD, while long needs 32K and does not
// auto-run. Producing the wrong one leaves someone with a disk that does
// nothing on the machine they aimed at.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
    describeProgram, describeForBuildLog, STANDARD_TOP, LONG_TOP,
} = require("../out/lang/basic/format.js");
const { validate } = require("../out/lang/basic/validator.js");
const { isBasicProject, basicSourceOf } = require("../out/config/project.js");
const { BUILTIN_EMULATORS } = require("../out/emulator/profiles.js");
const { allTargets } = require("../out/actions/targets.js");

const root = path.join(__dirname, "..");
const XDT = "C:/Users/kenfi/OneDrive/Desktop/xdt99-master";
const haveXdt = fs.existsSync(path.join(XDT, "xbas99.py"));

// --- native program format -------------------------------------------------

test("the two formats are told apart by their marker and top of program", () => {
    // Standard is a flat image; long is record-structured, so its >ABCD marker
    // sits at offset 1 behind a record-length byte. Checking only offset 0
    // reports a long program as standard.
    const standard = Uint8Array.from([0x00, 0x2d, 0x37, 0xa0, 0x37, 0x8d, 0x37, 0xd7, 0, 0]);
    const long = Uint8Array.from([0x0a, 0xab, 0xcd, 0xfe, 0xd2, 0xfe, 0xe9, 0x00, 0x3b, 0xff, 0xe7, 0]);

    const s = describeProgram(standard);
    assert.strictEqual(s.format, "standard");
    assert.strictEqual(s.topOfProgram, STANDARD_TOP);
    assert.strictEqual(s.requires32k, false);

    const l = describeProgram(long);
    assert.strictEqual(l.format, "long");
    assert.strictEqual(l.topOfProgram, LONG_TOP);
    assert.strictEqual(l.requires32k, true);
});

test("the build log says what a user needs to decide from", () => {
    const long = describeForBuildLog(
        describeProgram(Uint8Array.from([0x0a, 0xab, 0xcd, 0, 0, 0, 0, 0, 0, 0xff, 0xe7, 0])));
    assert.match(long, /Long format/);
    assert.match(long, /32K expansion required/);
    assert.match(long, /does not auto-run/);

    const standard = describeForBuildLog(
        describeProgram(Uint8Array.from([0, 0x2d, 0x37, 0xa0, 0x37, 0x8d, 0x37, 0xd7, 0, 0])));
    assert.match(standard, /Standard format/);
    assert.match(standard, /not required/);
});

test("rubbish is not described as a program", () => {
    assert.strictEqual(describeProgram(Uint8Array.from([1, 2, 3])), undefined);
    assert.strictEqual(describeProgram(new Uint8Array(0)), undefined);
});

test("a TIFILES container is stripped before the format is read", () => {
    const inner = [0x00, 0x2d, 0x37, 0xa0, 0x37, 0x8d, 0x37, 0xd7];
    const wrapped = new Uint8Array(128 + inner.length);
    wrapped[0] = 0x07;
    for (let i = 0; i < 7; i++) { wrapped[1 + i] = "TIFILES".charCodeAt(i); }
    inner.forEach((b, i) => { wrapped[128 + i] = b; });

    const info = describeProgram(wrapped);
    assert.strictEqual(info.format, "standard");
    assert.strictEqual(info.hadContainer, true);
    assert.strictEqual(info.topOfProgram, STANDARD_TOP);
});

test("real xbas99 output is classified correctly in both formats", (t) => {
    if (!haveXdt) { t.skip("xdt99 not available on this machine"); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ti99-fmt-"));
    const src = path.join(dir, "p.b99");
    // Long format needs a program with some substance. xbas99 reports
    // "Program too short, will pad" and fails on a tiny one, which is
    // the padding behaviour ordinary builds are meant to avoid and
    // another reason long format is opt-in rather than automatic.
    const lines = ["100 CALL CLEAR"];
    for (let i = 0; i < 60; i++) {
        lines.push((110 + i * 10) + ' PRINT "LINE ' + i + ' OF THE PROGRAM"');
    }
    lines.push("9000 END", "");
    fs.writeFileSync(src, lines.join("\n"), "utf8");

    const build = (args, out) => {
        execFileSync("python", [path.join(XDT, "xbas99.py"), "-c", ...args, src, "-o", out],
            { stdio: "pipe" });
        return describeProgram(new Uint8Array(fs.readFileSync(out)));
    };
    assert.strictEqual(build([], path.join(dir, "std")).format, "standard",
        "the default must be standard, never long merely because 32K exists");
    assert.strictEqual(build(["-L"], path.join(dir, "lng")).format, "long",
        "-L forces long format");
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- BASIC as a primary project language -----------------------------------

test("a BASIC project drives the build from its entry source", () => {
    const project = {
        name: "G", language: "ti-basic",
        entrySource: "src/main.b99", sources: ["src/main.b99"],
    };
    assert.ok(isBasicProject(project));
    assert.strictEqual(basicSourceOf(project), "src/main.b99",
        "the entry source is what gets tokenised");
});

test("an assembly project still uses basicSource for its loader", () => {
    // On an Extended BASIC assembly disk the BASIC program is a component, not
    // the program itself, so the two must not be conflated.
    const project = {
        name: "S", language: "tms9900",
        entrySource: "src/main.a99", sources: ["src/main.a99"],
        basicSource: "boot/LOAD.b99",
    };
    assert.strictEqual(isBasicProject(project), false);
    assert.strictEqual(basicSourceOf(project), "boot/LOAD.b99");
});

test("an assembly project without a loader has nothing to tokenise", () => {
    const project = { name: "S", language: "tms9900", entrySource: "a.a99", sources: ["a.a99"] };
    assert.strictEqual(basicSourceOf(project), undefined);
});

// --- targets and profiles --------------------------------------------------

test("every target names an emulator profile that exists", () => {
    const ids = new Set(BUILTIN_EMULATORS.map(p => p.id));
    for (const target of allTargets()) {
        if (!target.emulatorProfile) { continue; }
        assert.ok(ids.has(target.emulatorProfile),
            target.id + " names profile " + target.emulatorProfile + ", which does not exist");
    }
});

test("the five declared BASIC targets exist", () => {
    const ids = allTargets().map(t => t.id);
    for (const wanted of ["basic-program", "basic-disk", "xb-basic-program",
                          "xb-basic-disk", "xb-autorun-disk"]) {
        assert.ok(ids.includes(wanted), wanted + " is missing");
    }
});

test("the auto-run target is Extended BASIC only", () => {
    const target = allTargets().find(t => t.id === "xb-autorun-disk");
    assert.deepStrictEqual(target.languageIds, ["ti-extended-basic"]);
});

// --- the shipped templates -------------------------------------------------

const templateSource = (dir, file) =>
    fs.readFileSync(path.join(root, "templates", dir, "src", file), "utf8")
        .replace(/\{\{NAME\}\}/g, "DEMO").replace(/\{\{MENUNAME\}\}/g, "DEMO");

test("the TI BASIC template validates without a single error", () => {
    const errors = validate(templateSource("ti-basic", "main.b99"), { dialect: "ti-basic" })
        .diagnostics.filter(d => d.severity === "error");
    assert.deepStrictEqual(errors.map(e => e.code + ": " + e.message), []);
});

test("the Extended BASIC template validates without a single error", () => {
    const errors = validate(templateSource("ti-extended-basic", "main.xb99"),
        { dialect: "ti-extended-basic" }).diagnostics.filter(d => d.severity === "error");
    assert.deepStrictEqual(errors.map(e => e.code + ": " + e.message), []);
});

test("the templates actually tokenise", (t) => {
    if (!haveXdt) { t.skip("xdt99 not available on this machine"); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ti99-tpl-"));
    for (const [folder, file] of [["ti-basic", "main.b99"], ["ti-extended-basic", "main.xb99"]]) {
        const src = path.join(dir, file);
        fs.writeFileSync(src, templateSource(folder, file), "utf8");
        const out = path.join(dir, folder);
        execFileSync("python", [path.join(XDT, "xbas99.py"), "-c", src, "-o", out],
            { stdio: "pipe" });
        const info = describeProgram(new Uint8Array(fs.readFileSync(out)));
        assert.strictEqual(info.format, "standard", folder + " must build standard format");
        assert.ok(info.size > 0);
    }
    fs.rmSync(dir, { recursive: true, force: true });
});

test("the Extended BASIC template declares an auto-run target that can auto-run", () => {
    const config = JSON.parse(fs.readFileSync(
        path.join(root, "templates", "ti-extended-basic", "ti99.json"), "utf8"));
    const autorun = config.targets.find(t => t.id === "autorun-disk");
    assert.ok(autorun, "the template must offer the auto-run disk");
    assert.strictEqual(autorun.basicName, "LOAD",
        "Extended BASIC only auto-runs a program called LOAD");
    assert.strictEqual(autorun.disk.files[0].tiName, "LOAD");
    assert.strictEqual(autorun.disk.files[0].format, "PROGRAM");
    assert.strictEqual(config.basicFormat, "standard",
        "long format does not auto-run, so the template must not ask for it");
});

test("the TI BASIC template asks for nothing the console lacks", () => {
    const config = JSON.parse(fs.readFileSync(
        path.join(root, "templates", "ti-basic", "ti99.json"), "utf8"));
    assert.strictEqual(config.language, "ti-basic");
    const program = config.targets.find(t => t.id === "program");
    assert.strictEqual(program.emulatorProfile, "classic99-basic",
        "TI BASIC is in the console ROM, so no cartridge should be required");
    const profile = BUILTIN_EMULATORS.find(p => p.id === "classic99-basic");
    assert.ok(!profile.requires.some(r => /Rom/.test(r)),
        "the TI BASIC profile must not require a cartridge ROM");
});

// --- the published schema --------------------------------------------------

const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas", "ti99.schema.json"), "utf8"));

test("the schema is contributed to VS Code for ti99.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const entry = (pkg.contributes.jsonValidation || [])
        .find(v => v.fileMatch === "ti99.json");
    assert.ok(entry, "ti99.json must get schema validation");
    assert.ok(fs.existsSync(path.join(root, entry.url.replace(/^\.\//, ""))));
});

test("the schema describes every property the templates use", () => {
    // A schema stricter than the loader would flag working projects, which is
    // worse than having no schema at all.
    const known = new Set(Object.keys(schema.properties));
    for (const dir of ["ti-basic", "ti-extended-basic", "multi-target"]) {
        const file = path.join(root, "templates", dir, "ti99.json");
        if (!fs.existsSync(file)) { continue; }
        const config = JSON.parse(
            fs.readFileSync(file, "utf8").replace(/\{\{[A-Z]+\}\}/g, "X"));
        for (const key of Object.keys(config)) {
            assert.ok(known.has(key),
                dir + "/ti99.json uses " + key + ", which the schema does not describe");
        }
    }
});

test("the schema requires nothing the loader does not", () => {
    // The loader needs a name and sources. Requiring more would reject
    // projects that build perfectly well.
    assert.deepStrictEqual(schema.required, ["name", "sources"]);
    assert.strictEqual(schema.additionalProperties, true,
        "unknown keys must not be errors; the model still grows");
});

test("the schema offers the language and format choices that exist", () => {
    assert.deepStrictEqual(schema.properties.language.enum,
        ["tms9900", "ti-basic", "ti-extended-basic", "gpl"]);
    assert.deepStrictEqual(schema.properties.basicFormat.enum, ["standard", "long"]);
    assert.strictEqual(schema.properties.basicFormat.default, "standard");
});
