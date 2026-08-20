// Consistency between the code and package.json.
//
// These catch the class of bug where a command is registered but never
// contributed (so it cannot be invoked), or a profile references a setting
// that does not exist (so it silently expands to nothing).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
const { BUILTIN_EMULATORS, classic99CartFilename } = require('../out/emulator/profiles.js');
const { BUILTIN_PROFILES } = require('../out/toolchain/profiles.js');

const settingIds = new Set(
  pkg.contributes.configuration.flatMap(s => Object.keys(s.properties || {})));
const contributed = new Set(pkg.contributes.commands.map(c => c.command));
const source = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
const registered = new Set(
  [...source.matchAll(/register\('([^']+)'/g)].map(m => m[1])
    // The loop registers 'ti99.buildAndRun.' + target.id, so the scan sees the
    // prefix on its own. That is a fragment, not a command.
    .filter(id => !id.endsWith('.')));

// The per-target commands are registered in a loop from the target table
// rather than written out one by one, so a scan for literal strings cannot see
// them. Add what that loop will produce, and let the drift guards below check
// the table against the manifest directly.
if (/register\('ti99\.buildAndRun\.' \+ target\.id/.test(source)) {
  for (const target of require("../out/actions/targets.js").allTargets()) {
    if (target.menuLabel && target.actionKinds.includes('build-run')) {
      registered.add('ti99.buildAndRun.' + target.id);
    }
  }
}

test('every registered command is contributed in package.json', () => {
  const missing = [...registered].filter(c => !contributed.has(c));
  assert.deepStrictEqual(missing, [], 'registered but not contributed');
});

test('every contributed command is registered in the extension', () => {
  const missing = [...contributed].filter(c => !registered.has(c));
  assert.deepStrictEqual(missing, [], 'contributed but not registered');
});

test('keybindings and menus only reference real commands', () => {
  const refs = [
    ...(pkg.contributes.keybindings || []).map(k => k.command),
    ...Object.values(pkg.contributes.menus || {}).flat().map(m => m.command),
  ].filter(Boolean);
  for (const c of refs) {
    assert.ok(contributed.has(c), `${c} is referenced but not contributed`);
  }
});

test('emulator profiles only reference settings that exist', () => {
  for (const p of BUILTIN_EMULATORS) {
    const text = JSON.stringify([p.executable, p.args, p.preLaunch, p.url]);
    for (const m of text.matchAll(/\$\{config:([^}]+)\}/g)) {
      assert.ok(settingIds.has(m[1]), `${p.id} references unknown setting ${m[1]}`);
    }
    for (const key of p.requires || []) {
      assert.ok(settingIds.has(key), `${p.id} requires unknown setting ${key}`);
    }
  }
});

test('a flag taking a config value declares it in requires', () => {
  // An unresolved argument is dropped, which would turn "-rom <path>" into a
  // bare "-rom" and launch the emulator with no cartridge.
  for (const p of BUILTIN_EMULATORS) {
    const args = p.args || [];
    for (let i = 0; i < args.length - 1; i++) {
      const m = /^\$\{config:([^}]+)\}$/.exec(args[i + 1]);
      if (args[i].startsWith('-') && m) {
        assert.ok((p.requires || []).includes(m[1]),
          `${p.id}: ${args[i]} takes ${m[1]} but does not require it`);
      }
    }
  }
});

test('toolchain profiles declare a command for every capability', () => {
  for (const p of BUILTIN_PROFILES) {
    for (const cap of p.capabilities) {
      if (['assemble', 'link', 'listing', 'symbols'].includes(cap)) continue;
      assert.ok(p.commands[cap], `${p.id} advertises ${cap} with no command`);
    }
  }
});

test('toolchain commands only use variables the coordinator supplies', () => {
  const supplied = new Set([
    'python', 'tool', 'projectRoot', 'buildDir', 'distDir', 'output', 'listing',
    'symbolFile', 'dialectFlag', 'registerFlag', 'cpuFlag', 'cartBase',
    'cartridgeName', 'diskGeometry', 'diskName', 'input', 'fileType',
    'sources', 'includePaths', 'basicFormatFlag',
  ]);
  for (const p of BUILTIN_PROFILES) {
    for (const [cap, cmd] of Object.entries(p.commands)) {
      for (const m of JSON.stringify([cmd.program, cmd.args]).matchAll(/\$\{([a-zA-Z]+)\}/g)) {
        assert.ok(supplied.has(m[1]), `${p.id}/${cap} uses unsupplied \${${m[1]}}`);
      }
    }
  }
});

test('Classic99 cartridge names carry the type letter it matches on', () => {
  assert.strictEqual(classic99CartFilename('SNAKE', 'none'), 'SNAKEC.BIN');
  assert.strictEqual(classic99CartFilename('TI SNAKE', 'none'), 'TISNAKEC.BIN');
  assert.match(classic99CartFilename('a-very-long-program-name', 'none'), /^[A-Z0-9_]{1,9}C\.BIN$/);
  assert.strictEqual(classic99CartFilename('X', 'grom'), 'XG.BIN');
});

test('the packaged icon exists and package.json points at it', () => {
  assert.ok(pkg.icon, 'no icon declared');
  assert.ok(fs.existsSync(path.join(root, pkg.icon)), `${pkg.icon} is missing`);
});

test('marketplace metadata is present', () => {
  for (const field of ['name', 'displayName', 'description', 'version',
                       'publisher', 'license', 'icon', 'categories', 'keywords']) {
    assert.ok(pkg[field], `package.json is missing ${field}`);
  }
  assert.ok(pkg.engines && pkg.engines.vscode, 'engines.vscode is required');
  assert.ok(/^https:\/\/github\.com\//.test(pkg.repository.url), 'repository url');
  assert.ok(!/YOUR-GITHUB-USER|your-publisher-id/.test(JSON.stringify(pkg)),
    'package.json still contains a placeholder');
});

test('the licence names a copyright holder', () => {
  const text = fs.readFileSync(path.join(root, 'LICENSE.txt'), 'utf8');
  assert.match(text, /^MIT License/);
  assert.doesNotMatch(text, /<YOUR NAME>/, 'licence still has a placeholder');
  assert.match(text, /Copyright \(c\) \d{4} .+/);
});

test('project settings are read with a resource scope', () => {
  // getConfiguration() without a resource cannot see a folder-level
  // .vscode/settings.json in a multi-root workspace, so a per-project
  // toolchain or emulator setup silently does not exist. Language features
  // scope to the document; everything project-shaped must scope to the
  // project folder.
  const files = [
    'src/emulator/launcher.ts',
    'src/toolchain/discovery.ts',
    'src/build/coordinator.ts',
  ];
  const offenders = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    text.split('\n').forEach((line, i) => {
      const m = /getConfiguration\(([^)]*)\)/.exec(line);
      if (!m) return;
      // A scope is a second argument, or the only one when the section is
      // omitted as getConfiguration(undefined, scope).
      const scoped = m[1].split(',').length >= 2;
      if (!scoped) offenders.push(f + ':' + (i + 1) + '  getConfiguration(' + m[1].trim() + ')');
    });
  }
  assert.deepStrictEqual(offenders, [], 'unscoped configuration reads');
});

test('settings are declared at a scope that allows per-folder values', () => {
  // VS Code's default scope is "window", and a window-scoped setting is
  // ignored in a folder-level .vscode/settings.json - the settings editor
  // greys it out. Reading it with a resource scope does not help, because the
  // value was never applied. Anything a project may configure for itself must
  // therefore be declared "resource" or "machine-overridable".
  const PER_FOLDER = new Set(['resource', 'machine-overridable', 'language-overridable']);
  const bad = [];
  for (const section of pkg.contributes.configuration) {
    for (const [key, prop] of Object.entries(section.properties || {})) {
      if (!PER_FOLDER.has(prop.scope)) {
        bad.push(key + ' has scope ' + JSON.stringify(prop.scope || '(default: window)'));
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'settings that cannot be set per folder');
});

test('every setting a profile requires is settable per folder', () => {
  const byKey = new Map();
  for (const section of pkg.contributes.configuration) {
    for (const [key, prop] of Object.entries(section.properties || {})) byKey.set(key, prop);
  }
  const PER_FOLDER = new Set(['resource', 'machine-overridable', 'language-overridable']);
  for (const p of BUILTIN_EMULATORS) {
    for (const key of p.requires || []) {
      const prop = byKey.get(key);
      assert.ok(prop, p.id + ' requires unknown setting ' + key);
      assert.ok(PER_FOLDER.has(prop.scope),
        p.id + ' requires ' + key + ', which cannot be set per folder (scope ' + prop.scope + ')');
    }
  }
});

// Grammars and the Show Symbols rename, checked against the manifest.
//
// These are packaging guards. A grammar that is written but not contributed,
// or contributed under the wrong scope, is invisible in exactly the way the
// missing grammars were before this iteration.

test("every registered language has a grammar", () => {
    const langs = pkg.contributes.languages.map(l => l.id);
    const withGrammar = new Set(pkg.contributes.grammars.map(g => g.language));
    for (const id of langs) {
        assert.ok(withGrammar.has(id),
            id + " is registered as a language with no grammar, so its files " +
            "would open as unstyled text");
    }
});

test("BASIC grammars are contributed for the intended language ids", () => {
    const byLang = Object.fromEntries(pkg.contributes.grammars.map(g => [g.language, g]));
    assert.strictEqual(byLang["ti-basic"].scopeName, "source.ti-basic");
    assert.strictEqual(byLang["ti-extended-basic"].scopeName, "source.ti-extended-basic");
});

test("grammar files exist and are valid JSON with matching scopes", () => {
    for (const g of pkg.contributes.grammars) {
        const file = path.join(__dirname, "..", g.path);
        assert.ok(fs.existsSync(file), g.path + " is contributed but missing");
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        assert.strictEqual(parsed.scopeName, g.scopeName,
            g.path + " declares a different scope than the manifest");
    }
});

test("the intended extensions reach the intended grammar", () => {
    const byId = Object.fromEntries(pkg.contributes.languages.map(l => [l.id, l]));
    assert.deepStrictEqual(byId["ti-basic"].extensions, [".b99"]);
    assert.deepStrictEqual(byId["ti-extended-basic"].extensions, [".xb99", ".xb"]);
    assert.deepStrictEqual(byId["tms9900"].extensions, [".a99", ".asm"]);
});

test(".bas is not claimed by either dialect", () => {
    // .bas is dialect-neutral. Assigning it to one grammar would silently pick
    // a dialect the resolver deliberately refuses to guess.
    for (const l of pkg.contributes.languages) {
        assert.ok(!(l.extensions || []).includes(".bas"),
            l.id + " must not claim .bas");
    }
});

test("the Extended BASIC grammar reuses TI BASIC rather than copying it", () => {
    const xb = JSON.parse(fs.readFileSync(
        path.join(__dirname, "..", "syntaxes", "ti-extended-basic.tmLanguage.json"), "utf8"));
    const included = Object.values(xb.repository)
        .filter(r => typeof r.include === "string" && r.include.startsWith("source.ti-basic#"));
    assert.ok(included.length >= 8,
        "shared rules should be included from source.ti-basic, not duplicated");
});

test("the Extended BASIC grammar carries the constructs only it has", () => {
    const src = fs.readFileSync(
        path.join(__dirname, "..", "syntaxes", "ti-extended-basic.tmLanguage.json"), "utf8");
    assert.match(src, /statement-separator/, ":: must be highlighted");
    assert.match(src, /comment-bang/, "! comments must be highlighted");
    assert.match(src, /SUBEND/, "Extended BASIC keywords must be present");
});

test("grammars stay presentation-only", () => {
    // The lexer, parser and metadata database are the semantic authority. A
    // grammar that starts encoding dialect or parameter rules will drift from
    // them, so each one says so in its own header.
    for (const g of pkg.contributes.grammars) {
        if (!g.language.startsWith("ti-")) { continue; }
        const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", g.path), "utf8"));
        assert.match(parsed._comment, /[Pp]resentation only/,
            g.language + " grammar must state that it is not a semantic authority");
    }
});

test("Show Symbols is the canonical command and the old id still works", () => {
    const ids = pkg.contributes.commands.map(c => c.command);
    assert.ok(ids.includes("ti99.showSymbols"), "canonical id must exist");
    assert.ok(ids.includes("ti99.showMemoryMap"),
        "old id must stay registered so existing keybindings do not break");

    const canonical = pkg.contributes.commands.find(c => c.command === "ti99.showSymbols");
    assert.strictEqual(canonical.title, "Show Symbols");
});

test("the compatibility alias is hidden from the Command Palette", () => {
    // It never showed a memory map, so it must not be offered under that name.
    const hidden = (pkg.contributes.menus.commandPalette || [])
        .find(e => e.command === "ti99.showMemoryMap");
    assert.ok(hidden, "the alias needs a commandPalette entry");
    assert.strictEqual(hidden.when, "false");
});

test("no user-facing text still promises a memory map", () => {
    const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
    const offending = readme.split("\n").filter(l =>
        /Show Memory Map/.test(l) && !/alias|never produced/.test(l));
    assert.deepStrictEqual(offending, [],
        "requirement 29.2 is not implemented, so nothing may advertise it");
});

// Per-target context-menu entries.
//
// The point of these is that the menu says what it will do before you click,
// instead of a generic command followed by a list. They are generated from the
// target table, and these guards are what stop the two drifting apart.

const runnableTargets = () =>
  require("../out/actions/targets.js").allTargets()
    .filter(t => t.menuLabel && t.actionKinds.includes("build-run"));

test("every runnable target has its own command", () => {
  const ids = new Set(pkg.contributes.commands.map(c => c.command));
  for (const target of runnableTargets()) {
    assert.ok(ids.has("ti99.buildAndRun." + target.id),
      target.id + " has no command, so it cannot appear in the menu");
  }
});

test("command titles come from the target table", () => {
  const byId = Object.fromEntries(pkg.contributes.commands.map(c => [c.command, c]));
  for (const target of runnableTargets()) {
    assert.strictEqual(byId["ti99.buildAndRun." + target.id].title, target.menuLabel,
      target.id + " title must match its menuLabel, or the two will drift");
  }
});

test("no command exists for a target that is gone", () => {
  const known = new Set(runnableTargets().map(t => "ti99.buildAndRun." + t.id));
  const orphans = pkg.contributes.commands
    .map(c => c.command)
    .filter(id => id.startsWith("ti99.buildAndRun.") && !known.has(id));
  assert.deepStrictEqual(orphans, [], "these commands name targets that no longer exist");
});

test("each target entry is gated to the languages it accepts", () => {
  const entries = Object.fromEntries(
    pkg.contributes.menus["ti99.explorer"]
      .filter(e => (e.command || "").startsWith("ti99.buildAndRun."))
      .map(e => [e.command, e]));
  for (const target of runnableTargets()) {
    const entry = entries["ti99.buildAndRun." + target.id];
    assert.ok(entry, target.id + " is not in the submenu");
    for (const language of target.languageIds) {
      assert.ok(entry.when.includes("resourceLangId == '" + language + "'"),
        target.id + " must be offered for " + language);
    }
  }
});

test("menus never depend on editor-derived context keys", () => {
  // This is the bug that made the whole submenu invisible. A custom context
  // key describes the active editor, not the file that was right-clicked, so
  // in the Explorer it is either empty or about a different file. Only
  // resource context keys are evaluated against the clicked item.
  const surfaces = ["explorer/context", "editor/context", "ti99.explorer"];
  const offenders = [];
  for (const surface of surfaces) {
    for (const entry of pkg.contributes.menus[surface] || []) {
      if (/ti99\.(language|isEntrySource|hasContainingTarget|canBuild|canRun|canPackage)/
          .test(entry.when || "")) {
        offenders.push(surface + ": " + (entry.command || entry.submenu));
      }
    }
  }
  assert.deepStrictEqual(offenders, [],
    "these entries would be hidden or wrong when right-clicking in the Explorer");
});

test("assembly targets are never offered on BASIC files, or the reverse", () => {
  const entries = pkg.contributes.menus["ti99.explorer"]
    .filter(e => (e.command || "").startsWith("ti99.buildAndRun."));
  const find = id => entries.find(e => e.command === "ti99.buildAndRun." + id).when;

  assert.ok(!find("cart").includes("ti-basic"), "a cartridge cannot be built from BASIC");
  assert.ok(!find("basic-program").includes("tms9900"), "TI BASIC cannot be built from assembly");
  assert.ok(!/== 'ti-basic'/.test(find("xb-basic-program")),
    "an Extended BASIC program is not offered for TI BASIC source");
});

test("the Extended BASIC program is staged so it both auto-runs and can be listed", () => {
  // Extended BASIC runs a standard-format program called LOAD at power-up.
  // Staging only under that name would leave no way to load it without
  // running it, so it goes down twice.
  const { BUILTIN_EMULATORS } = require("../out/emulator/profiles.js");
  const profile = BUILTIN_EMULATORS.find(p => p.id === "classic99-xb-program");
  const copies = profile.preLaunch.filter(s => s.action === "copy").map(s => s.to);
  assert.ok(copies.some(t => t.endsWith("/LOAD")), "one copy must be named LOAD to auto-run");
  assert.ok(copies.some(t => t.includes("${basicName}")),
    "and one under its own name, so it can be loaded without running");
});

test("the TI BASIC profile does not claim an auto-run it cannot do", () => {
  const { BUILTIN_EMULATORS } = require("../out/emulator/profiles.js");
  const profile = BUILTIN_EMULATORS.find(p => p.id === "classic99-basic");
  assert.ok(!profile.preLaunch.some(s => (s.to || "").endsWith("/LOAD")),
    "TI BASIC has no LOAD mechanism; staging one would imply it does");
  assert.match(profile.hint, /OLD DSK1/, "the hint must give the exact command");
});
