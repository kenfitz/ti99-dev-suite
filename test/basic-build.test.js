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

// --- distribution disks holding several programs ---------------------------
//
// A target normally builds one program, because one source is the product. A
// distribution disk is the exception: it carries several programs a person
// chooses between, which is how a multi-part adventure was actually shipped.

const { resolveTarget } = require("../out/config/project.js");

test("a target carries its own list of programs", () => {
    const config = {
        name: "Collection", language: "ti-extended-basic",
        sources: [], entrySource: "a.xb99",
        targets: [{
            id: "disk",
            outputs: ["disk-image"],
            basicPrograms: [
                { source: "src/MENU.xb99", tiName: "LOAD" },
                { source: "src/GAME.xb99", tiName: "GAME" },
            ],
        }],
    };
    const resolved = resolveTarget(config, "disk");
    assert.strictEqual(resolved.basicPrograms.length, 2);
    assert.strictEqual(resolved.basicPrograms[0].tiName, "LOAD");
});

test("a project-level list is inherited by a target that does not override it", () => {
    const config = {
        name: "C", sources: [], entrySource: "a.xb99",
        basicPrograms: [{ source: "src/A.xb99", tiName: "A" }],
        targets: [{ id: "disk", outputs: ["disk-image"] }],
    };
    assert.strictEqual(resolveTarget(config, "disk").basicPrograms.length, 1);
});

test("a target list overrides the project list rather than merging", () => {
    // Merging would silently put programs on a disk the target never named.
    const config = {
        name: "C", sources: [], entrySource: "a.xb99",
        basicPrograms: [{ source: "src/A.xb99", tiName: "A" }],
        targets: [{
            id: "disk", outputs: ["disk-image"],
            basicPrograms: [{ source: "src/B.xb99", tiName: "B" }],
        }],
    };
    const resolved = resolveTarget(config, "disk");
    assert.deepStrictEqual(resolved.basicPrograms.map(p => p.tiName), ["B"]);
});

test("the schema describes the multi-program fields", () => {
    const schema = JSON.parse(fs.readFileSync(
        path.join(root, "schemas", "ti99.schema.json"), "utf8"));
    assert.ok(schema.properties.basicPrograms, "projects may carry a program list");
    assert.ok(schema.properties.targets.items.properties.basicPrograms,
        "and so may a target");
});

test("a disk built from a real multi-program project holds every program", (t) => {
    // The end-to-end check: tokenise several sources, create an image, add
    // them all, and read the catalog back. Skipped where xdt99 is absent.
    if (!haveXdt) { t.skip("xdt99 not available on this machine"); return; }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ti99-multi-"));
    const names = ["LOAD", "ALPHA", "BETA"];
    const programs = names.map((name, i) => {
        const source = path.join(dir, name + ".xb99");
        fs.writeFileSync(source,
            "100 CALL CLEAR\n110 PRINT \"" + name + "\"\n120 END\n", "utf8");
        const out = path.join(dir, name);
        execFileSync("python", [path.join(XDT, "xbas99.py"), "-c", source, "-o", out],
            { stdio: "pipe" });
        return { name, out, i };
    });

    const image = path.join(dir, "collection.dsk");
    execFileSync("python", [path.join(XDT, "xdm99.py"), "-X", "sssd", image, "-n", "COLLECT"],
        { stdio: "pipe" });
    for (const p of programs) {
        execFileSync("python",
            [path.join(XDT, "xdm99.py"), image, "-a", p.out, "-f", "PROGRAM", "-n", p.name],
            { stdio: "pipe" });
    }

    const catalog = execFileSync("python", [path.join(XDT, "xdm99.py"), image],
        { stdio: "pipe" }).toString();
    for (const name of names) {
        assert.ok(new RegExp("^" + name + "\\s", "m").test(catalog),
            name + " is missing from the disk");
    }
    assert.strictEqual((catalog.match(/PROGRAM/g) || []).length, names.length,
        "every entry must be a PROGRAM");

    // LOAD is what makes Extended BASIC start the disk by itself, so it has to
    // be standard format. Long format is ignored at power-up.
    const loadInfo = describeProgram(new Uint8Array(fs.readFileSync(
        path.join(dir, "LOAD"))));
    assert.strictEqual(loadInfo.format, "standard");

    fs.rmSync(dir, { recursive: true, force: true });
});

test("the Time Lost project is configured as a real distribution disk", (t) => {
    // A worked example rather than a synthetic one: seven programs, a menu
    // named LOAD, all Extended BASIC.
    const file = "C:/Users/kenfi/source/Time-Lost-A-Computer-Adventure-TI-99-4a-/ti99.json";
    if (!fs.existsSync(file)) { t.skip("the Time Lost project is not on this machine"); return; }

    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.strictEqual(config.language, "ti-extended-basic",
        "five of the six adventures use :: and cannot run in TI BASIC");

    const disk = config.targets.find(x => x.id === "distribution-disk");
    assert.ok(disk, "there must be a distribution disk target");
    assert.strictEqual(disk.basicPrograms.length, 7);
    assert.strictEqual(disk.basicPrograms[0].tiName, "LOAD",
        "the menu must be named LOAD so Extended BASIC runs it at power-up");

    const names = disk.basicPrograms.map(p => p.tiName);
    assert.strictEqual(new Set(names).size, names.length,
        "two programs cannot share a TI filename on one disk");
    for (const name of names) {
        assert.ok(name.length <= 10, name + " exceeds the ten-character TI limit");
        assert.ok(!/\s/.test(name), name + " contains a space, which TI filenames cannot");
    }
});

// --- what a FIAD directory needs -------------------------------------------
//
// Classic99 reads a headerless file with no extension as DIS/FIX 128. A raw
// tokenised program dropped into DSK1 is therefore on the disk but is not a
// PROGRAM, so Extended BASIC finds nothing to run and boots to READY. Only the
// TIFILES-wrapped form carries the type byte that says PROGRAM.

test("a FIAD profile stages the TIFILES form, never the raw image", () => {
    for (const id of ["classic99-basic", "classic99-xb-program", "classic99-xb"]) {
        const profile = BUILTIN_EMULATORS.find(p => p.id === id);
        const copies = profile.preLaunch.filter(s => s.action === "copy");
        for (const copy of copies) {
            assert.ok(!/\$\{artifact:basic-program\}/.test(copy.from),
                id + " stages the raw image, which Classic99 reads as DIS/FIX 128");
        }
    }
});

test("a target that runs through FIAD builds the TIFILES form", () => {
    // Staging it is no use if the build never produced it.
    for (const target of allTargets()) {
        const profile = BUILTIN_EMULATORS.find(p => p.id === target.emulatorProfile);
        if (!profile || profile.kind !== "fiad-drop") { continue; }
        const needsTifiles = profile.preLaunch.some(
            s => s.action === "copy" && /basic-tifiles/.test(s.from || ""));
        if (!needsTifiles) { continue; }
        if (!target.outputs.includes("basic-program")) { continue; }
        assert.ok(target.outputs.includes("basic-tifiles"),
            target.id + " runs through a profile that stages basic-tifiles but never builds it");
    }
});

test("the raw and wrapped forms do not collide on disk", () => {
    // Both want the same TI name. Writing them to the same path means the
    // second silently replaces the first, and which one survives depends on
    // build order.
    const { BUILTIN_PROFILES } = require("../out/toolchain/profiles.js");
    const commands = BUILTIN_PROFILES[0].commands;
    assert.ok(commands["basic-program"], "the raw form is built");
    assert.ok(commands["basic-tifiles"], "and the wrapped form too");
    assert.match(JSON.stringify(commands["basic-tifiles"].args), /-f.*PROGRAM/,
        "the wrapper must mark the file as PROGRAM, which is the whole point");
});

test("a real wrapped program declares itself PROGRAM", (t) => {
    if (!haveXdt) { t.skip("xdt99 not available on this machine"); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ti99-fiad-"));
    const source = path.join(dir, "p.xb99");
    fs.writeFileSync(source, '100 PRINT "HI"\n110 END\n', "utf8");

    const raw = path.join(dir, "RAW");
    execFileSync("python", [path.join(XDT, "xbas99.py"), "-c", source, "-o", raw], { stdio: "pipe" });
    const wrapped = path.join(dir, "WRAPPED");
    execFileSync("python",
        [path.join(XDT, "xdm99.py"), "-T", raw, "-f", "PROGRAM", "-o", wrapped], { stdio: "pipe" });

    const rawBytes = fs.readFileSync(raw);
    assert.notStrictEqual(rawBytes[0], 0x07,
        "the raw image has no TIFILES header, which is why it cannot be served from FIAD");

    const bytes = fs.readFileSync(wrapped);
    assert.strictEqual(bytes[0], 0x07);
    assert.strictEqual(bytes.subarray(1, 8).toString("latin1"), "TIFILES");
    assert.strictEqual(bytes[10], 0x01, "byte 10 must say PROGRAM");

    fs.rmSync(dir, { recursive: true, force: true });
});
