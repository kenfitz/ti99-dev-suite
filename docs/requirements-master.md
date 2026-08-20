# TI-99/4A Development Suite for Visual Studio Code

## Consolidated Product Requirements, Implementation Status, and Phased Roadmap

**Document purpose:** authoritative working specification for the TI-99/4A Development Suite. It consolidates the original extension requirements, the BASIC and Extended BASIC expansion, AtariAge community research, SDK and library concepts, hardware and asset tooling, and the context-aware command-routing design.

**Document status:** reconciled against the repository on 2026-08-20.

**Reconciliation basis:** repository inspection, test execution, package build, and GitHub API queries, recorded in `docs/audit-2026-08-20.md`. That audit holds the line-by-line evidence. This document holds the requirements and the project state, and deliberately does not repeat the audit detail.

**Related documents in the repository:**

| File | Role |
|---|---|
| `docs/requirements.md` | The original 46-section assembly specification, long form. Superseded by this document where they conflict. See open decision D7. |
| `docs/audit-2026-08-20.md` | Full implementation evidence, file and line level |
| `docs/basic-support-design.md` | BASIC research and architecture, including the verified auto-run result |
| `docs/source-naming.md` | Canonical naming and the resolution-strength model |

---

## How to use this document

It has three jobs:

1. Define the intended product and its technical requirements.
2. Record implementation status without assuming a requirement is complete merely because it was discussed or designed.
3. Maintain a phased roadmap that can be refined after every implementation report.

The **Implementation Status** section is the status authority. The detailed requirement sections describe intended behaviour. A requirement appearing in the detailed specification does not imply that it is implemented.

## Status vocabulary

- **Implemented** - working end to end and supported by current repository evidence.
- **Partially Implemented** - meaningful implementation exists, but the full requirement is not satisfied.
- **Implemented Differently** - the requirement is met by a deliberate alternative design. The deviation is recorded in the Product Decisions register.
- **Needs Verification** - implementation exists but its behaviour has not been proven in the required environment.
- **Not Implemented** - no working implementation.
- **Future** - intentionally scheduled for a later phase.
- **Not Applicable** - aspirational or narrative, with no acceptance test.

**Nothing is marked Implemented because a design exists, a command is registered, a target is declared, a stub exists, a route exists, or a unit test exercises something below the end-to-end feature.**

## Product north star

A modern TI-99/4A development workstation inside Visual Studio Code: authentic source languages and native formats, predictable build and run workflows, reusable documented libraries, hardware-aware diagnostics, integrated asset tooling, emulator and source debugging where reliable APIs permit, and export to real TI hardware.

The product should feel closer to Visual Studio for a modern platform than to a collection of shell-command wrappers, while still exposing the TI architecture clearly enough for expert hobbyists.

---

# Implementation Status

## Current build health

Verified by execution on 2026-08-20:

```
133 tests passing
  0 tests failing
  0 tests skipped
Lint clean
Types clean
VSIX packages at 54 files, 141 KB, no test fixtures included
```

Test composition, corrected against the previous record of 45/48/40:

| Group | Count | Files |
|---|---|---|
| Assembly | 45 | `dialect` 10, `project` 12, `manifest` 14, `template` 9 |
| BASIC language | 31 | `basic-lexer` 21, `basic-metadata` 10 |
| Routing and actions | 57 | `actions-evidence` 13, `actions-language` 16, `actions-resolver` 28 |
| **Total** | **133** | |

## Released state

| Item | Value |
|---|---|
| Version | 0.2.0 |
| Tag and release | `v0.2.0`, 2026-08-20 |
| Repository | Public, default branch `main` |
| Rulesets | `Protect main` active, `Require CI on main` active |
| Licence | MIT, confirmed detected by the GitHub API |
| Marketplace publisher | `kenfitz` declared in the manifest, **not yet registered** |

## Implemented

| Area | Evidence |
|---|---|
| Assembly regression baseline | 45 assembly tests green |
| Cartridge output regression | Snake cartridge byte-identical to the known-good original, re-verified after every change |
| Assembly build pipeline | `xas99` fully integrated: assemble, link, listing, symbols, defines, include paths, COPY |
| Disk pipeline | `xdm99` fully integrated: image creation, add, catalog, TIFILES conversion |
| Five assembly distribution routes | Cartridge RPK, cartridge raw BIN, E/A option 3, E/A option 5, E/A disk |
| Extended BASIC-hosted assembly disk | `xb-loader` target with target-specific bootstrap, runtime-verified in Classic99 |
| Emulator integration | 11 profiles across Classic99, MAME, JS99er, Win994a, custom |
| Real hardware export | FinalGROM, FlashROM, disk folder, TIFILES folder |
| Assembly language service | Highlighting, completion, hover, definition, references, document symbols, formatting, code actions, dialect analysis |
| Diagnostics | xas99 and xdm99 parsers, Problems panel, stale clearing, configurable unresolved-reference policy |
| Task provider | `ti99` task type with the `xas99` problem matcher |
| Sidebar | Project, Symbols, Artifacts, Disk views |
| Workspace trust | `capabilities.untrustedWorkspaces` limited, `isTrusted` guard before any execution |
| Settings | 28 settings with correct scopes, guarded by tests |
| Canonical source naming | `docs/source-naming.md`, 16 tests |
| Strength-based dialect resolution | Declarations, strong and weak presumptions, asymmetric evidence, 16 tests |
| Token-aware Extended BASIC evidence | Payload-walking rather than byte scanning, 13 tests |
| TIFILES-aware evidence handling | 128-byte container stripped before parsing |
| BASIC lexer | Mode-driven, 21 tests, verified against historical programs with zero false positives |
| Central action resolver | `resolveSource` to `resolveLanguage` to `resolveTargets` to `resolveActions`, no `vscode` dependency, 28 tests |
| Context-aware routing | Explorer submenu, editor menus, Command Palette, all through one resolver |
| Run versus Build and Run semantics | Staleness guard; a stale or failed build never launches |
| xbas99 tokenisation adapter | **Wired and running**, see the correction below |
| Repository infrastructure | CI, tag-driven release, issue templates, PR template, Dependabot, CONTRIBUTING, SECURITY, NOTICE |

## Corrections to the previous status record

### xbas99 is wired, and BASIC tokenisation is not the gap

The previous record listed xbas99 integration as not implemented. That is wrong.

`xbas99 -c` is wired into the build coordinator through the toolchain profile table and **runs today**, producing the tokenised loader used by the Extended BASIC assembly disk. Tokenisation works and is exercised by a shipped, runtime-verified distribution route.

**The actual gap is different and narrower:**

1. **BASIC cannot function as the primary project language.** `basicSource` is a secondary input to an assembly project. There is no project shape in which a `.b99` or `.xb99` file is the entry source driving the build.
2. **Current BASIC routing does not reach the existing coordinator pipeline.** The routing layer resolves BASIC targets correctly and then intercepts them with an informative message rather than dispatching to the coordinator that already knows how to tokenise.

Both are connection work over an existing, working capability. Neither is a missing tokeniser.

### Extended BASIC auto-run is verified

A standard-format PROGRAM named `LOAD` on DSK1 **auto-loads and auto-runs**. Verified experimentally twice from a cold Classic99 start with the Extended BASIC cartridge selected and nothing typed. The long INT/VAR 254 format does **not** auto-run and requires an explicit `RUN`.

Status: **behaviour verified.** Recorded in `docs/basic-support-design.md` section 1.9.

**Evidence gap preserved:** no primary written source for this behaviour has been found. The result rests on a reproducible experiment. If documentation is located it should replace the experiment as the citation. See Evidence Gaps.

### Test composition

Corrected to 45 assembly, 31 BASIC-language, 57 routing, 133 total. See the table above.

## Partially Implemented

| Area | What exists | What is missing |
|---|---|---|
| BASIC and Extended BASIC as languages | Language IDs registered, language configuration shipped | **No TextMate grammar for either.** See P0-1 |
| BASIC build outputs | `basic-program` capability tokenises through xbas99 | No BASIC-primary project can reach it |
| Extended BASIC auto-run disk | Behaviour verified, `xb-autorun-disk` target declared and routed | No build pipeline behind the target |
| BASIC built-in metadata | 27 subprograms, 16 colours, dialect membership, 10 tests | Statements, functions, operators, keywords. Four entries flagged `confirm` pending manual verification |
| Dialect compatibility analysis | Evidence detection implemented and tested both in source and in tokenised programs | The user-facing diagnostic and the compatibility command |
| Import naming | `importFilename()` implemented and tested | No import command calls it |
| BASIC test strategy | Lexer and evidence covered | Parser, round-trip, packaging, negative corpus |
| Historical regression corpus | `test/corpus/constructs.bas`, plus an opportunistic check against local historical programs that skips in CI | A redistributable corpus and an intentionally invalid corpus |
| Build commands | Build, Rebuild, Clean, Run, Build and Run, Package, Validate, Select Target | Build Active File, Stop Emulator, Select Build Profile, Show Symbols, Reveal Artifact. See open decision D5 |
| Emulator process management | Launcher tracks the processes it starts | No Stop Emulator command |
| Cartridge validation | Header space and size checks | Bank count, bank size, entry-symbol resolution |
| Disk browser | Read-only catalog | Extract, add, replace, delete, rename |
| Project wizard | Creates a multi-target project from `templates/multi-target` | The wizard question flow, and language selection for BASIC projects. See open decision D4 |
| Templates | One assembly multi-target template | All BASIC and Extended BASIC templates |
| Build environment report | Toolchain Status shows much of the content | Not copyable as a report; no support bundle |
| Marketplace metadata | Complete and valid in the manifest | Publisher not registered, so first publish is blocked |

## Not Implemented

| Area | Note |
|---|---|
| BASIC and Extended BASIC TextMate grammars | **P0-1** |
| Memory-map model, requirement 29.2 | **P0-2**. The `Show Memory Map` command currently focuses the symbol table |
| embed-xb compatibility detection | **P0-3** |
| BASIC parser, AST, binder | The dependency for everything in requirements 55 to 61 |
| BASIC semantic validation | Depends on the parser |
| BASIC completion, hover, signature help, semantic highlighting | Depends on the parser and the completed metadata |
| BASIC control-flow and symbol analysis | |
| Renumbering and label mode | Designed in the BASIC report, not built |
| Standard versus long format selection | The xbas99 default is standard; nothing selects long deliberately |
| BASIC-native disk packaging | |
| TI BASIC Run and Build and Run | |
| Extended BASIC Run and Build and Run | |
| Detokenisation | The prerequisite for all round-trip work |
| Round-trip disk development | Import, diff, update, watcher |
| Published JSON Schema for `ti99.json` | Placed at **early P1**, see the prioritised list for the reasoning |
| Build profiles, debug and release | See open decision D3 |
| Signature help and semantic tokens for assembly | |
| Synchronised listing navigation | |
| Diagnostic report and support bundle | |
| Extension-host tests | Two acceptance criteria depend on them |
| MERGE format and protection flags | |
| Cross-platform verification | Windows only; macOS and Linux never executed |

## Future

SDK and managed library system; hardware capability profiles; PAL and NTSC awareness; memory and scratchpad safety analyser; DSR, PAB and file services; SAMS tooling; TIPI tooling; graphics and asset studio; sound and speech studio; physical cartridge and banking tooling; source-level debugger and profiler; C and GCC integration; GPL via xga99; Forth; reusable multi-retro core.

---

# Findings that must remain regression-protected

These were established empirically and are protected by tests. They must survive refactoring.

### Flat token scanning is invalid

A line-number payload can contain a byte equal to an Extended BASIC keyword token. `GOTO 130` encodes the line number as `>00 >82`, and `>82` is the `::` token, so a flat byte scan reports an ordinary TI BASIC program as Extended BASIC. Dialect detection must walk the token structure. Pinned by fixture `test/fixtures/tib-goto.prg`.

### CALL subprogram payloads require semantic interpretation

`CALL SPRITE` initially escaped detection because the subprogram name is encoded as an unquoted-string payload, the same token used for numeric literals. Payload skipping is not equivalent to semantic ignoring: the payload directly following a CALL token must be read.

### TIFILES wrapping must be removed before native-token analysis

Programs extracted from disk arrive with a 128-byte TIFILES header. Parsing that as a BASIC header yields nonsense. Detection must unwrap the native payload first.

### `.b99` is not historically dialect-specific

xbas99 uses `.b99` for BASIC-family source generally, and writes it when detokenising either dialect. `.b99` is therefore the canonical new-project TI BASIC extension in this product, but remains a **weak presumption** when resolving existing files.

### Import naming must follow the resolved dialect

Never let the xbas99 default `.b99` output filename determine the source dialect. Required order:

```
native program
    -> dialect resolution
    -> TI BASIC       => .b99
    -> Extended BASIC => .xb99
    -> ambiguous      => ask the user
```

### Absence of Extended BASIC syntax proves nothing

Every valid TI BASIC program is also a valid Extended BASIC program. Extended BASIC can be proven; TI BASIC cannot. Never infer TI BASIC from the absence of Extended BASIC constructs.

### New: BASIC languages are registered without grammars

`ti-basic` and `ti-extended-basic` are registered language IDs with a language configuration, and neither has a TextMate grammar. A `.b99` file opens as unstyled text under a TI language mode. The extension claims the file type and provides nothing visible.

### New: Show Memory Map exposes the symbol table

The command loads the `.equ` symbol file and focuses the Symbols view. Requirement 29.2 asks for address ranges, segments, reserved regions and overlap detection, and that model does not exist. The command name promises the requirement and delivers something else. **Not changed during this documentation pass.** See open decision D2.

### New: the development machine has a patched xdt99

A local patch was applied to `xas99.py` during development for `--embed-xb` payloads over 257 bytes, where a padding calculation goes negative. The backup is `xas99.py.bak-before-embedxb-fix`.

A user with stock xdt99 3.6.5 building an `xb-loader` target for a payload over that size may produce an invalid or corrupt artifact **with no diagnostic**. Requirement 50.5 forbids patching a user installation, so detection plus an actionable message is the required behaviour. This remains **P0** until that exists.

---

# Product Decisions Register

Decisions taken deliberately, where the implementation differs from an earlier requirement statement. These are normative going forward.

### D-A. `ti99.json` is the official project filename

**Decided.** The project configuration file is `ti99.json`.

Earlier requirement text specified `ti99-project.json`. The implementation has used `ti99.json` since before the 0.2.0 release, it is baked into the shipped project template, and it is shorter. Renaming it would break released projects for no user benefit.

All normative requirements in this document now say `ti99.json`. Historical references to `ti99-project.json` are retained only where they describe past intent.

Detection also accepts a `.ti99/` subdirectory placement as originally specified.

### D-B. Assembly source extensions are narrowed

**Decided.** `.a99` is canonical TMS9900 Assembly. `.asm` is a first-class alias.

`.s`, `.inc` and `.equ` are **not** claimed automatically. `.s` is the standard GNU and ARM assembler extension, and claiming it meant that anyone with this extension installed could receive TMS9900 highlighting and TMS9900 diagnostics on unrelated files. `.asm` remains claimed because it is common in historical TI source.

Users who want the old behaviour may associate additional extensions manually through the VS Code `files.associations` setting. This is documented in the README.

This is a deliberate deviation from the original requirement 22.1.

### D-C. Canonical source naming

**Decided.** For newly created source:

| Language | Canonical | Alias |
|---|---|---|
| TMS9900 Assembly | `.a99` | `.asm` |
| TI BASIC | `.b99` | none |
| TI Extended BASIC | `.xb99` | `.xb` |
| GPL | `.g99` | `.gpl` |
| BASIC, dialect unspecified | none | `.bas` |

`.a99` and `.g99` are the primary extensions `xas99` and `xga99` already search for, so assembly and GPL naming follows xdt99 rather than inventing a convention. `.xb99` is a modern convention introduced by this extension and **was never used on the original TI**. `.xb` has modest but real standing and is therefore a first-class alias.

`.bas` is dialect-neutral by definition, not merely unrecognised.

### D-D. Strength-based language resolution

**Decided and implemented.** Resolution precedence:

```
1. Explicit per-file override
2. Explicit project configuration
3. Canonical extension
4. Deterministic content evidence
5. User selection
```

Levels 1 and 2 are **declarations of intent** and always win. When the source contradicts a declaration, the contradiction is reported as a conflict for the diagnostics layer rather than used to re-resolve, because the user said what they meant and the construct is the error.

Level 3 is a **presumption**, and presumptions have strength:

- `.a99`, `.asm`, `.xb99`, `.xb`, `.g99`, `.gpl` are **strong**.
- `.b99` is **weak**, because xdt99 writes it for both BASIC dialects, so an existing `.b99` file may well hold Extended BASIC.
- `.bas` carries **no** presumption.

Deterministic Extended BASIC evidence therefore **may resolve an existing `.b99` file as Extended BASIC**, because it overrides a weak presumption. It never overrides a declaration.

Evidence is asymmetric throughout, per the regression-protected finding above.

### D-E. One central action resolver

**Decided and implemented.** The Explorer context menu, the editor menus, the Command Palette and the tree views all resolve through a single service that imports no `vscode` and is unit tested directly. Two surfaces computing their own target lists would drift apart, and the wrong one would be the one nobody tested. A test asserts they cannot diverge.

---

# Phase Ledger and Current Phase

## Completed phases

### Phase 0 - Assembly baseline

**Status: Complete.**

Evidence: 45 assembly tests green; Snake cartridge byte-identical to the known-good original; five distribution routes building and launching; CI, tag-driven release and `v0.2.0` published; existing behaviour preserved through every subsequent change.

### Naming and routing architecture sub-phase

**Status: Complete as a sub-phase.**

Delivered: canonical and alias source naming; strength-based language resolution; token-aware and TIFILES-aware Extended BASIC evidence; the central pure action resolver; target compatibility routing; the context-aware menu foundation; URI-aware command handlers; 57 routing tests.

This closes the architecture portion of the multi-language phase. It is **not** completion of the multi-language phase.

## Current phase

**Phase 1 - Multi-Language Core: TI BASIC and Extended BASIC.**

### Substantially complete foundations

- BASIC and Extended BASIC language identity, as registered language IDs
- Canonical naming and compatibility aliases
- Strength-based dialect resolution
- Token-aware Extended BASIC evidence
- TIFILES-aware evidence handling
- BASIC lexer
- Central action resolver
- Target routing architecture
- Explorer and context routing
- xbas99 tokenisation adapter, wired and running
- Existing assembly regression baseline

### Incomplete

- BASIC and Extended BASIC TextMate grammars
- BASIC parser
- AST
- Binder
- Semantic validation
- Complete BASIC metadata inventories
- BASIC as a primary project language
- Standard versus long format selection
- BASIC-native disk packaging
- Extended BASIC auto-run disk pipeline
- TI BASIC Run
- TI BASIC Build and Run
- Extended BASIC Run
- Extended BASIC Build and Run
- BASIC completion, hover, signature help and navigation
- Detokenisation
- Round-trip disk development

### Phase 1 exit criteria

The phase is complete only when a user can perform this entire workflow for **TI BASIC**:

1. Create or open a TI BASIC project.
2. Edit with appropriate language support, including syntax highlighting.
3. Receive syntax and semantic validation before building.
4. Build a native tokenised program.
5. Package it appropriately.
6. Launch it in a configured emulator.
7. Use Build and Run end to end.

The equivalent workflow must work for **Extended BASIC**.

In addition:

8. Existing assembly behaviour must remain regression-free, with all assembly tests green.
9. Routed BASIC actions must execute real validated native pipelines rather than informative placeholders.
10. Documentation must reflect actual behaviour rather than planned behaviour.
11. The full test count and package validation must be refreshed at phase exit.

A phase is not complete because the resolver or the UI exists. End-to-end native build and run behaviour must pass.

---

# Prioritised Work List

## P0 - correctness and product integrity

Each of these is a place where the product currently claims more than it delivers. All are small.

**P0-1. BASIC and Extended BASIC syntax grammars.** The language IDs are registered without TextMate grammars, so `.b99` and `.xb99` files open as unstyled text under a TI language mode. Either ship grammars or unregister the languages until the parser lands. See open decision D1 for the strategy choice.

**P0-2. Show Memory Map mismatch.** The command exposes the symbol table rather than the memory-map model of requirement 29.2. The requirement itself is Not Implemented. Not changed during this documentation pass. See open decision D2.

**P0-3. embed-xb compatibility detection and diagnostics.** A user with stock xdt99 3.6.5 may produce an invalid `xb-loader` artifact with no diagnostic, because the development machine carries a local patch the user does not have. Detect the incompatible version or behaviour and produce an actionable message. Do not patch the user installation.

## P1 - make TI BASIC and Extended BASIC genuine first-class executable languages

This is the remaining body of Phase 1.

1. **BASIC parser, AST and binder.** The dependency for requirements 55 to 61.
2. **BASIC as a primary project language.** A project whose entry source is `.b99` or `.xb99` selects the tokenisation pipeline. This is connection work over the existing coordinator capability.
3. **Route BASIC targets to the coordinator** instead of intercepting them with a message.
4. **Semantic validation** for both dialects, including the dialect diagnostic that the evidence layer already supports.
5. **Complete the metadata inventories:** statements, functions, operators, keywords, plus manual confirmation of the four entries flagged `confirm`.
6. **Standard versus long format selection,** with long used only when genuinely required and never as a default.
7. **BASIC-native disk packaging** for the TI BASIC Disk and Extended BASIC Disk targets.
8. **Extended BASIC auto-run disk pipeline,** now unblocked by the verified auto-run behaviour.
9. **TI BASIC Run and Build and Run.**
10. **Extended BASIC Run and Build and Run.**
11. **Published JSON Schema for `ti99.json`,** with a `jsonValidation` contribution.

   *Placement: early P1, not late P0.* The P0 criterion used here is that the product misrepresents its own behaviour, and a missing schema does not misrepresent anything; it is a quality gap. It belongs early in P1 because `ti99.json` gains `language`, `defaultTarget` and `sourceDefaults` as part of the BASIC project-language work, and authoring the schema alongside those additions is cheaper and less error-prone than retrofitting it afterwards.

12. **BASIC and Extended BASIC project templates,** validated to parse, build and run.
13. **Detokenisation,** the prerequisite for P2 round-trip work.

## P2 - high-value IDE and round-trip capabilities

14. BASIC completion, hover, signature help and semantic highlighting.
15. BASIC control-flow and symbol analysis, including SUB navigation.
16. Round-trip disk development: import from disk, source-versus-disk diff, update program on disk, disk-change watcher.
17. Disk browser write operations: extract, add, replace, delete, rename.
18. Renumbering and xbas99 label mode, including the label sidecar map.
19. Extension-host tests, closing acceptance criteria 7 and 15 of requirement 150.
20. Signature help and semantic tokens for assembly.
21. Synchronised listing navigation.
22. Build environment report and support bundle.
23. Historical listing import and export.
24. Protected-program metadata.
25. Cross-platform verification on macOS and Linux.
26. Marketplace publisher registration and first publish.

## Future

Preserved in full, in roadmap order: SDK and managed library services; hardware capability profiles; PAL and NTSC awareness; memory and scratchpad safety analyser; DSR, PAB and file-I/O services; SAMS tooling; TIPI tooling; graphics and asset studio; sound and speech studio; physical cartridge, banking and hardware deployment tooling; source-level debugger and profiler; C and GCC integration; GPL via xga99; a specifically chosen Forth dialect; and eventual reusable retro-computer architecture extraction.

**No work in these areas should begin during Phase 1.**

---

# Forward Implementation Roadmap

## Phase 0 - Assembly baseline

**Complete.** See the phase ledger.

## Phase 1 - Multi-Language Core: TI BASIC and Extended BASIC

**Current active phase.** Scope, completed foundations, incomplete items and exit criteria are in the Current Phase section above. P0 and P1 in the prioritised list constitute the work.

## Phase 2 - BASIC round-trip, disk workflows, and preservation

Make native TI disks part of the editable development loop.

Scope: detokenisation and import; disk browser BASIC actions; source-versus-disk diff; safe update back to disk; disk-change detection; label sidecar restoration; protected-program metadata; historical listing import and export; preservation workflows.

Exit criteria: VS Code to native disk to emulator or real TI to SAVE to disk to VS Code is reliable and understandable, and source is never silently overwritten.

## Phase 3 - TI SDK foundation and hardware capability model

Scope: versioned managed libraries; dependency resolution; inspectable generated includes; library source navigation and copy-to-project; documented calling convention; metadata-driven IntelliSense; initial VDP, graphics, input, sound, memory and math helpers; hardware profiles; memory and scratchpad resource declarations; target-aware compatibility diagnostics.

Exit criteria: a developer can add a library through the IDE, call documented routines with IntelliSense, build inspectable native code, and receive deterministic target and resource diagnostics.

## Phase 4 - Native platform services: DSR, files, SAMS, TIPI

Scope: DSR and PAB documentation and inspection; `TI.Files` SDK; file-I/O analysers; SAMS page management and visualisation; SAMS SDK; TIPI profile, templates and documented helpers; hardware-aware emulator profiles.

## Phase 5 - Graphics and asset studio

Scope: character editor; sprite editor; animation and composite preview; tile and map editor; modern image conversion; VDP layout visualisation; mode and table overlap validation; Magellan interoperability. Stock TMS9918A first, F18A enhancements afterwards.

## Phase 6 - Sound and speech development

Scope: sound effect editor; sound-list builder; VGM integration where licensing and tooling permit; playback-library integration; music and effects coexistence metadata; speech asset conversion, inspection and playback; hardware requirement diagnostics.

## Phase 7 - Cartridge, banking, and real-hardware deployment

Scope: cartridge inspector; bank visualisation; physical cartridge profiles; FinalGROM and FlashROM validation; banked ROM templates; filename, header and layout validation; real-hardware export verification.

## Phase 8 - Source-level debugging and performance tools

Scope: source, address and symbol mapping; breakpoints; register and workspace views; CPU, scratchpad and VDP memory; VDP inspector; source stepping where supported; debug SDK helpers; qualified static timing; measured profiling.

Do not fake debugger APIs through fragile UI automation.

## Phase 9 - Additional toolchains and languages

Order: TMS9900 GCC and libti99ALL; GPL via xga99; one explicitly selected Forth dialect. Each integration must include real build, run and package behaviour, not syntax colouring alone.

## Phase 10 - Mature product and maintenance

Bugs, compatibility, performance, documentation, SDK additions, community recipes, new hardware profiles, quality-of-life features, Marketplace and release improvements. New large subsystems should require a clear community or developer use case.

## Phase 11 - Optional retro-core extraction

Only after the TI product is mature: identify genuinely machine-independent abstractions; extract them with full TI regression coverage; validate with a separate platform such as Apple II; keep machine-specific Marketplace products separate.

**Architectural note from the audit.** `src/actions/` already imports no `vscode` and is machine-independent apart from its target list. The one coupling that would obstruct a second machine is `Capability`, a flat union of TI output kinds referenced across the coordinator, the project model and the targets. Parameterising it is the single refactor worth doing before any extraction, and it should not be done now.

---

# Part I - Product Definition and Governance

## 1. Product overview

A Visual Studio Code extension providing an integrated development environment for the TI-99/4A. The developer can create a project, select a deployment format, write source with modern editing support, build through xdt99, produce emulator-ready cartridges and disk images, launch an emulator, export for real hardware, and inspect listings, symbols, memory usage and disk contents.

xdt99 is the underlying assembler, linker, cartridge builder, BASIC tokeniser and disk toolchain, invoked as an external process. The extension does not reimplement it.

**Status: Implemented** for assembly. **Partially Implemented** for BASIC.

## 2. Product vision

TI development should feel like modern embedded development: create, write, build, package, run, export, without memorising xdt99 command lines or maintaining batch files. Advanced developers must still be able to inspect and customise every command and output.

**Status: Implemented** for assembly; toolchain detail remains visible in the output channel.

## 3. Goals

**3.1 Primary goals.** All original primary goals are met for assembly: xas99 assembly and linking, xdm99 disk creation, RPK, raw binary, E/A object, E/A option 5, disk images, MAME and Classic99 launch, Problems-panel diagnostics, templates, the full command set, multi-module support, COPY and include paths, listings and symbols, configuration validation, and preserved build logs.

**Status: Implemented.**

**3.2 Secondary goals.** Semantic assembly support is partial; cartridge and bank visualisation, asset tools, GPL, debugging and most hardware targets are Future.

## 4. Non-goals for the initial release

Unchanged and still honoured: no new assembler, no emulator, no in-extension hardware emulation, no web extension, no automatic download of copyrighted ROMs, no distribution of commercial emulators, no modification of xdt99 source in the shipped product.

**Note:** the last of these is currently violated on the development machine only, and is tracked as P0-3. The shipped extension does not modify any user installation.

## 5. Target users

New TI assembly developer; experienced TI-99/4A developer; retro-computing developer new to the TI. Unchanged.

## 6. Supported host environments

Windows 10 and 11, current macOS, common modern Linux, VS Code Desktop, Python 3.8 or later, xdt99 3.6.0 or compatible.

**Status: Needs Verification** beyond Windows. Path handling is normalised and tested, but no macOS or Linux execution has occurred, and toolchain discovery order differs per platform.

## 46, 48, 95, 97, 134. Product definition, scope and principles

The product now targets three first-class languages: TMS9900 Assembly, TI BASIC and TI Extended BASIC. The consistent workflow is create, edit, validate, build, package, run, inspect, export or round-trip.

**Status: Partially Implemented.** Assembly is first-class end to end. BASIC has identity, naming, resolution and routing, and lacks the executable pipeline.

The narrative principles in 95, 97 and 134 are **Not Applicable** to status tracking; they carry no acceptance test.

---

# Part II - Architecture, Projects, Configuration, Toolchains

## 7. External dependencies

Required: VS Code Desktop, Python 3.8 or later, xdt99, and at least one emulator for Build and Run.

Installation modes: **Mode A user-installed is Implemented** and is the default. **Mode B autodetect is Implemented** in `src/toolchain/discovery.ts`. **Mode C managed installation is Not Implemented** and remains deliberately deferred pending a GPL distribution review.

## 8. High-level architecture

Command controller, project manager, configuration manager, build coordinator, toolchain adapter, diagnostics parser, language services, emulator manager, artifact manager and UI providers, over Python and xdt99, driving MAME, Classic99 or a custom emulator.

**Status: Implemented.** The module layout matches the intent, flatter than the proposal in section 39.

## 9. Extension components

All eight component responsibilities are **Implemented**: extension host in TypeScript, project manager, toolchain adapter using direct process execution with argument arrays, build coordinator, diagnostics parser, language service, emulator manager and artifact manager.

## 10. Project detection

A workspace is a TI-99 project when `ti99.json` exists at the workspace root, or a `.ti99/ti99.json` exists, or the user selects a project file, or an import creates one.

The extension must not infer a complete project merely because a source file exists, and must not create files without permission.

**Status: Implemented.** Filename per decision D-A.

## 11. Project creation wizard

Command: `TI-99: Create New Project`.

The wizard should request project name, destination, project type, output type, source syntax mode, emulator profile, optional hardware target, sample code, Git initialisation and whether to open the project. It must also offer **language selection** across TMS9900 Assembly, TI BASIC and TI Extended BASIC.

**Status: Partially Implemented.** The command creates a multi-target project from `templates/multi-target` with substitution, and generates a README explaining the actual workflow. It does not present the question flow and does not offer language selection. See open decision D4.

Generated cartridge templates place application code clear of the header space that `xas99` may generate through `>602F`. **Implemented.**

## 12. Project configuration file

**Filename: `ti99.json`.** See decision D-A.

The configuration must be valid JSON, have a published JSON Schema providing IntelliSense and validation, use workspace-relative paths, and support multiple named targets.

**Status: Partially Implemented.**

- Configuration model: **Implemented Differently.** The shipped model is flatter than the original proposal, using `sources`, `targets[]` and `outputs[]` expressed as build capabilities, plus `language`, `defaultTarget` and `sourceDefaults` added during the routing work.
- Published JSON Schema: **Not Implemented.** Placed at early P1.
- Named build profiles for debug and release: **Not Implemented.** Targets serve a different purpose and do not substitute. See open decision D3.

## 13. Workspace settings

28 settings under the `ti99` namespace across Language, Formatting, Toolchain, Emulators and Diagnostics.

**Status: Implemented,** including correct `resource` and `machine-overridable` scopes, which are guarded by tests. Settings using the default `window` scope are invisible in folder-level `settings.json`, which is why the scopes are asserted.

## 14. Toolchain discovery

Python and xdt99 detection with platform-specific candidate ordering, validation by executing a harmless version command, and recording of the detected version. Commands `TI-99: Show Toolchain Status` and `TI-99: Configure Toolchain`.

**Status: Implemented.** Cross-platform candidate ordering is **Needs Verification** per section 6.

## 39, 40. Source organisation and core interfaces

**Status: Implemented Differently.** The layout is flatter than proposed and the interfaces carry equivalent information under different names. No action required; the proposal was advisory.

## 90. Reusable retro-computing architecture

**Status: Future.** See the architectural note under Phase 11.

---

# Part III - Canonical Languages, File Naming, and Source Resolution

## 22. Assembly language support

**22.1 File extensions.** `.a99` canonical, `.asm` alias. `.s`, `.inc` and `.equ` are not claimed automatically; users may associate them through `files.associations`. See decision D-B. **Implemented Differently, deliberately.**

**22.2 Syntax highlighting.** **Implemented.** `syntaxes/ti99-assembly.tmLanguage.json`.

**22.3 Language configuration.** **Implemented.**

**22.4 to 22.9 Completion, directives, registers, symbols, definition, references.** **Implemented.** Providers registered in `src/extension.ts`.

**22.10 Hover.** **Implemented** for instructions and symbols.

**22.11 Document outline.** **Implemented.**

**22.12 Formatting.** **Implemented** with 8 settings. The formatter is field-aware and does not alter string data, comments or symbol case unless configured.

**22.13 Implementation strategy.** Direct `vscode.languages` providers, as intended for this phase. A language server remains unnecessary.

**Not Implemented:** signature help, semantic tokens, workspace symbols.

## 51. TI BASIC and Extended BASIC as products

**51.1 Language IDs.** `ti-basic` and `ti-extended-basic` registered. **Implemented.**

**51.1 Syntax highlighting for BASIC and Extended BASIC.** **Not Implemented.** Neither language has a TextMate grammar. This is P0-1.

**51.2 Historical correctness.** Behaviour must come from the original TI interpreter and official documentation, never from other BASIC dialects. Extended BASIC has its own availability and semantic rules. **Implemented** as a working practice: metadata is sourced from TI documentation and four uncertain entries carry a `confirm` flag rather than a guess.

## 52. BASIC research sources

**Implemented.** See the Structured Bibliography.

## 53. xbas99 integration

**53.1 Required understanding.** Token tables, token encoding, line-number encoding, string encoding, the native PROGRAM format, standard and long formats, and TIFILES containers are understood and used. **MERGE format and protection flags are Not Implemented.**

**53.2 xbas99 is not the language validator.** The required pipeline is source, then our lexer, parser and semantic validator, then xbas99, then the native program. **Not Implemented:** no parser exists, so nothing validates before tokenisation. The tokeniser itself is wired and running.

## 54. BASIC lexer, parser, and AST

**54.1 Architecture.** A shared foundation with dialect-specific rules, reusing logic only where semantics genuinely match. **Implemented** for the lexer, which takes a dialect parameter.

**54.2 Lexer.** **Implemented.** `src/lang/basic/lexer.ts`, mode-driven rather than regular expressions, 21 tests. It respects context so punctuation and keywords inside strings, comments, DATA and IMAGE are not misinterpreted. Verified against historical programs with zero false positives. A test demonstrates that statement-mode-only lexing fails, which is the concrete justification for the mode design.

**54.3 AST.** **Not Implemented.** No parser, no AST, no binder. This is the primary Phase 1 dependency.

## 55, 56. TI BASIC and Extended BASIC validation

**Not Implemented.** Both depend on the parser. The dialect-availability half of requirement 55 is already supported by the metadata layer, which distinguishes wrong-dialect from unknown-name, so the diagnostic text can be specific when the parser arrives.

## 57. Dialect compatibility analysis

**Partially Implemented.** Evidence detection is implemented and tested in both source and tokenised programs. The user-facing diagnostic and the `Check TI BASIC to Extended BASIC Compatibility` command are Not Implemented.

## 58. Structured BASIC knowledge database

One machine-readable source of truth driving validation, completion, hover, signature help, documentation and tests.

**Partially Implemented.** `src/lang/basic/metadata.ts` holds 27 subprograms with dialect membership and 16 colours mapping BASIC numbers to VDP codes, with 10 tests. Statements, functions, operators and keywords are missing. Four entries carry a `confirm` flag pending manual verification and must not drive an error until confirmed.

## 59, 60, 61. BASIC editing, analysis, renumbering

**Not Implemented.** Completion, hover, signature help, semantic highlighting, outline, formatting, control-flow and symbol analysis, resequencing and label mode all depend on the parser.

Requirement 61 remains normative: renumbering must operate on token semantics, updating only syntactic line references and never arbitrary numeric literals. Label mode must be documented as an xdt99 development-source extension, not interpreter syntax.

## 74, 75. Static analysis and size reporting

**Not Implemented.** Both remain normative, including the instruction to avoid excessive noise on retro code patterns.

## 76. Project creation and templates

**Partially Implemented.** One assembly multi-target template exists. No TI BASIC or Extended BASIC templates exist. Every template must parse, build and run in the intended environment.

## 77, 78. Listing import and export; protected programs

**Not Implemented.**

## 79. BASIC test strategy

**Partially Implemented.** Lexer and evidence coverage exist. Parser, expression precedence, statement families, built-ins, tokenisation round-trip, disk packaging, extraction, replacement, diff and auto-run tests do not.

## 80. Historical regression corpus

**Partially Implemented.** `test/corpus/constructs.bas` is authored and ships with the tests, exercising the constructs a lexer gets wrong. An opportunistic check runs against historical programs present on the development machine and skips in CI, since those are not redistributable. A redistributable corpus and an intentionally invalid negative corpus do not exist.

## 117, 118, 119. C, GPL, Forth

**Not Implemented, Future.** `.g99` and `.gpl` resolve as GPL through the language layer, and `xga99` is not integrated.

## 135. Canonical source naming and language resolution

**Implemented.** See decisions D-C and D-D, and `docs/source-naming.md`.

**135.4 Dialect inference asymmetry.** **Implemented** and protected by tests, including the flat-scan counterexample fixture.

**135.5 Import naming.** **Partially Implemented.** The naming function exists and is tested; no import command calls it because the import command is Not Implemented.

**135.6 Resolution strength model.** **Implemented.** See decision D-D.

---

# Part IV - Build, Targets, Packaging, and Command Routing

## 15. Build commands

**Partially Implemented.** Present: Build, Rebuild, Clean, Run, Build and Run, Build and Run As, Package, Validate, Select Target, Select Dialect, Build Containing Target, Build and Run Containing Target, Select Containing Target, Create Project from Current File, Rename to Canonical Extension, plus toolchain, listing, disk catalog and export commands. 29 commands total.

Absent: Build Active File, Stop Emulator, Select Build Profile, Show Symbols, Reveal Build Artifact. See open decision D5.

**15.3 Clean safety.** **Implemented** with path guards preventing deletion outside approved build directories, at the workspace root, at a drive root or in the user profile.

**15.4 Build and Run.** **Implemented.** A failed build never launches.

## 16. VS Code task integration

**Implemented.** `src/tasks.ts` registers a `ti99` task type with the `xas99` problem matcher, supporting cancellation and multi-root workspaces.

## 17. Assembly and link requirements

**Implemented.** Multi-module builds, relocatable modules, DEF and REF, COPY, project and workspace relative includes, configured include paths, defines, listings and symbols.

## 18. Output formats

**Implemented.** Object, E/A option 5 image, RPK, raw binary and disk image, plus TIFILES variants and the Extended BASIC hosted program.

## 19. Disk image requirements

**Implemented** for creation, geometry selection, file addition, catalog reading and verification through xdm99. Filename validation and capacity checking are in place.

**19.6 Disk catalog view.** **Implemented,** read-only.

## 20. Emulator integration

**Implemented.** 11 profiles: Classic99 cartridge, disk, E/A, E/A disk, Extended BASIC and Extended BASIC disk; MAME cartridge and disk; JS99er; Win994a; custom.

**20.3 Variables.** **Implemented,** including artifact, project and BASIC-name substitution.

**20.6 Classic99 honesty.** **Implemented.** The extension stages artifacts and shows the exact remaining TI steps rather than claiming automation it does not have. No Classic99 command-line capability is fabricated.

**20.8 Process management.** **Partially Implemented.** The launcher tracks processes it starts and does not terminate instances it did not launch. No Stop Emulator command exists.

**Target availability.** Targets that are compatible but unconfigured remain visible and name the setting to fix, using the same `requires` mechanism as the emulator profiles. **Implemented.**

## 21. Real hardware export

**Implemented.** FinalGROM, FlashROM, disk image to folder and TIFILES to folder, with overwrite protection and size verification.

## 31. Cartridge validation

**Partially Implemented.** Header space and output size are checked. Bank count, bank size and entry-symbol resolution are not.

## 41. Example build pipelines

**Implemented** for all four assembly pipelines.

## 42. Error handling model

**Implemented Differently.** User-facing errors explain what failed and what will fix it, and offer the corrective command. The formal `Ti99ExtensionError` interface with a code enum is not implemented. See open decision D6.

## 49. Assembly development intended state

**Implemented,** with the exceptions listed under 22: signature help, semantic tokens and workspace symbols.

## 50. Extended BASIC-hosted assembly distribution

**Implemented and runtime-verified.** The `xb-loader` target builds a disk that starts from Extended BASIC for users with 32K but no Editor/Assembler cartridge.

**50.3 Target-specific bootstrap.** **Implemented** as intended: a small bootstrap per target over shared application source, not a fork of the application. The bootstrap disables interrupts, establishes the workspace, clears the Extended BASIC interrupt-hook state, establishes VDP and console shadow state, clears the sprite list, and transfers to the shared entry point. Keyboard and sound work, and repeated clean launches work.

**50.5 embed-xb compatibility.** **Not Implemented, P0-3.** See the regression-protected findings. The development machine carries a local xdt99 patch for payloads over 257 bytes. A user with stock xdt99 3.6.5 may produce an invalid or corrupt artifact with no diagnostic. The extension must detect and report, and must never patch a user installation.

**50.6 Validation.** Classic99 **verified**. MAME and real hardware **Needs Verification**.

## 62. BASIC build outputs

**Partially Implemented.** The `basic-program` capability tokenises through xbas99 and runs today for the Extended BASIC assembly loader. No BASIC-primary project can reach it, and BASIC routing does not dispatch to the coordinator.

## 63. BASIC disk images and auto-run

**Partially Implemented.**

Required target concepts: TI BASIC Program, TI BASIC Disk, Extended BASIC Program, Extended BASIC Disk, Extended BASIC Auto-Run Disk. All five are declared and routed; none has a build pipeline.

**63.1 Extended BASIC LOAD behaviour: verified.** A standard-format PROGRAM named `LOAD` on DSK1 auto-loads and auto-runs, proven twice from a cold Classic99 start. The long INT/VAR 254 format does not. The distinction between this tokenised XB `LOAD` and the assembly `--embed-xb` distribution format must remain explicit; they share a filename and nothing else.

**Evidence gap:** no primary written source found. See Evidence Gaps.

## 64. BASIC Build and Run

**Not Implemented.** The command routes correctly and then reports which phase the pipeline arrives in.

## 81. Unified commands

**Implemented.** The same commands serve every language, with the backend chosen by project configuration and the resolver.

## 136 to 151. Context-aware build and run command system

**Implemented.**

- **136 Central action-resolution service.** One service drives Explorer menus, editor menus, the Command Palette and tree views. A test asserts they cannot diverge.
- **137 Source-to-target compatibility model.** Languages declare their build and run targets; targets declare the languages they accept, their action kinds and their configuration requirements.
- **138 Assembly context actions.** Compatible targets come from the registered definitions, never from hard-coded filenames.
- **139 TI BASIC context actions.** Running a `.b99` file under Extended BASIC is offered as an alternate runtime and does not change the declared dialect.
- **140 Extended BASIC context actions.** TI BASIC is not offered as a normal runtime for Extended BASIC source.
- **141 Legacy `.bas`.** Resolved by override, project, then evidence; otherwise the user is asked, with an option to remember.
- **142 Command Palette routing.** Generic commands work with or without an active editor. **Partially Implemented:** the source-selection Quick Pick exists but has no host test.
- **143 Entry point versus module.** A module offers its containing target rather than pretending to be a program. Multiple containing targets trigger a picker.
- **144 Standalone file mode.** **Implemented.** Language from the extension, no project file created without asking.
- **145 Run versus Build and Run.** **Implemented,** including the staleness guard.
- **146 Dynamic menus.** One `TI-99/4A` submenu gated on context keys. Nothing appears on unrelated files.
- **147 Terminology.** Labels describe the TI runtime, not xdt99 switches.
- **148 Defaults.** Project and per-source defaults are supported. Nothing is persisted silently.
- **149 Rename assistance.** Offered, never automatic, never an error. Accepting it rewrites `ti99.json`, `entrySource`, target references and per-source defaults.
- **150 Acceptance criteria.** 14 of 16 covered by tests. Items 7 and 15 depend on Quick Pick UI and require host tests.
- **151 UX principle.** **Implemented.**

---

# Part V - Native Storage, Disk, Cartridge, Import, and Preservation

## 30. Project import

**Implemented** for assembly: `TI-99: Import Existing Source` scans for source, detects the likely entry, and generates configuration without modifying original source.

## 65. Bidirectional BASIC round-trip development

Core architectural requirement. **Not Implemented.** Phase 2.

## 66. Import BASIC program from disk

**Not Implemented.** The dialect detection it depends on is built and tested, including the tokenised and TIFILES-aware paths, and the import naming function exists. The command does not.

Normative: never guess the dialect when the native format is ambiguous; ask.

## 67. TI disk browser and file operations

**Partially Implemented.** Read-only catalog. Extract, add, replace, delete, rename, Open BASIC Source, Import BASIC Source and Update BASIC Program on Disk are Not Implemented.

## 68, 69, 70, 71. Change detection, diff, disk update, preservation

**Not Implemented.** Phase 2. Normative constraints retained: never silently overwrite project source; prefer a source-level diff over a binary diff; preserve unrelated disk contents during targeted updates.

## 73. BASIC file-I/O intelligence

**Not Implemented.** Normative: do not assume the universe of device names is closed, because third-party DSRs add devices.

## 107, 108. Cartridge inspector, banked templates

**Not Implemented, Future.**

---

# Part VI - Emulator, Debugger, Diagnostics, and Developer Feedback

## 24. Diagnostics

**Implemented.** Sources include xas99, xdm99 and static language analysis. Diagnostics carry the source tool, file and line, are cleared before each build, and link to corrective commands where possible.

**24.5 Unresolved references.** **Implemented** with four configurable levels, because E/A programs may intentionally reference environment-supplied routines.

## 26, 27, 28.1. Status bar, output channel, listing viewer

**Implemented.** The output channel records the tool, executable, arguments, working directory, output, exit code, elapsed time and generated artifacts.

**28.2 Synchronised listing navigation.** **Not Implemented.**

## 29. Symbol and memory map viewer

**29.1 Symbol table.** **Implemented.** A Symbols tree loaded from the `.equ` file.

**29.2 Memory map.** **Not Implemented.** No model exists for address ranges, cartridge banks, expansion RAM, scratchpad, data and BSS segments, reserved ranges or the generated header.

The command currently named `TI-99: Show Memory Map` loads the symbol file and focuses the Symbols view. **This is a naming mismatch, recorded as P0-2 and not changed during this documentation pass.** See open decision D2.

**29.3 Memory-map validation.** **Not Implemented.** Overlap detection, bank overflow, missing entry point and ROM-write detection all depend on the model.

## 34. Reliability

**Implemented.** Exit status captured, expected artifacts verified, partial outputs not mistaken for success, failed packaging never launching an old artifact, build failure distinguished from launch failure, and staleness checked before Run.

## 35. Logging and diagnostic report

**Partially Implemented.** Log levels and the output channel exist. `TI-99: Create Diagnostic Report` is Not Implemented.

## 83. Workspace trust and process safety

**Implemented.** `capabilities.untrustedWorkspaces` is declared as limited with an explanatory description; execution is guarded by an `isTrusted` check. Tools are invoked with argument arrays rather than composed shell strings.

## 101, 103. Hardware and scratchpad diagnostics

**Not Implemented, Future.** Both depend on the hardware capability model and the memory-map model.

## 114, 115, 116. Debugger, debug helpers, performance

**Not Implemented, Future.** Normative constraints retained: do not simulate unavailable emulator APIs through fragile UI automation, and do not present a single cycle count as universal.

## 123, 124, 125. Compatibility matrix, environment report, support bundle

**Not Implemented,** except that Toolchain Status already surfaces much of the environment report content without being copyable.

---

# Part VII to XI - SDK, Assets, UX, Distribution, Product Family

## 98, 99. Managed TI SDK and community libraries

**Not Implemented, Future,** Phase 3. Normative constraints retained: never silently rewrite user source; no hidden binary blob may be injected without the developer being able to inspect what was included; verify licence before bundling; never present a third-party library as first-party code.

## 100, 102, 104, 105, 106. Hardware profiles, PAL and NTSC, SAMS, TIPI, DSR

**Not Implemented, Future,** Phases 3 and 4.

## 23. Snippets

**Implemented** for assembly.

## 72, 109 to 113. Graphics, sound and speech tooling

**Not Implemented, Future,** Phases 5 and 6.

## 25, 82. Sidebar and Activity Bar

**Partially Implemented.** Project, Symbols, Artifacts and Disk views exist. BASIC symbols and SUBs, listings, memory map, emulator profiles and hardware export destinations do not. Non-TI workspaces are not cluttered.

## 43, 92. Documentation

**Partially Implemented.** Present: README with getting started, toolchain setup, distribution routes, naming convention and menu behaviour; CONTRIBUTING; SECURITY; NOTICE; the BASIC design report; the source-naming document; the audit; publishing and development notes; and a generated README in every created project.

Missing: TI BASIC and Extended BASIC development guides, BASIC disk generation, auto-run disks, round-trip development, importing historical programs, and known xdt99 compatibility issues. These should follow the features rather than precede them.

## 32. Security

**Implemented.** Trust respected, argument arrays used, paths normalised, destructive external operations confirmed, deletion confined to approved build directories.

## 33. Performance

**Implemented.** Activation is scoped to TI projects and TI source files; analysis does not block the extension host; builds are cancellable.

## 36. Testing requirements

**36.1 Unit tests.** **Implemented.** 133 tests, zero dependencies, using the Node built-in runner.

**36.2 Integration tests with real xdt99.** **Not Implemented as automation.** Performed manually and repeatedly throughout development, including byte-identity verification of the cartridge output.

**36.3 Emulator tests.** **Not Implemented as automation.** Performed manually in Classic99.

**36.4 Platform tests.** **Windows only.** macOS and Linux are unverified.

**36.5 Extension-host tests.** **Not Implemented.** Required to close acceptance criteria 7 and 15 of requirement 150.

## 44, 89. Distribution, licensing, attribution

**Implemented.** MIT licence, confirmed detected by the GitHub API. xdt99 attribution and third-party notices are held in `NOTICE.md`, deliberately separated from `LICENSE.txt` so that licence detection is not diluted. No implied endorsement by TI, xdt99, MAME or Classic99.

## 84. Repository and public project requirements

**Implemented.** Public repository, sole-maintainer contribution policy stated, issue forms for bug reports and feature requests, PR template, and rulesets preventing force pushes and branch deletion while requiring CI. No collaborators added.

## 85. CI, packaging, releases

**Implemented.** CI runs `npm ci`, compilation, lint, tests and packaging validation. Releases are tag-driven and attach the VSIX. No secrets are committed.

## 86. Marketplace metadata

**Partially Implemented.** All required fields are present and valid. The publisher `kenfitz` is **not yet registered**, which blocks first publish.

## 87. Sponsorship

**Not Implemented, deliberately.** No `FUNDING.yml` and no sponsor metadata, because no valid Sponsors account exists and fabricating a URL is forbidden.

## 88. Dependency maintenance

**Implemented.** Dependabot configured with major-version updates ignored to limit noise.

## 91. Future Marketplace product family

**Future.**

---

# Appendix - Community Research

## 96. AtariAge developer-needs research

**Complete as requirements work.** The review sampled long-running reference threads, high-reply development threads, recent 2024 to 2026 discussions, and threads where developers explicitly struggled with fragmented knowledge. It does not claim exhaustive reading of the corpus.

The recurring theme: TI developers repeatedly solve the same low-level machine problems because knowledge is fragmented across manuals, old source, forum replies, libraries and emulator-specific behaviour. The extension should make that knowledge executable.

Findings are incorporated into the SDK, hardware, asset, deployment and debugger roadmap. Source threads are listed in the bibliography.

## 132, 133. Ongoing research feed and community validation

**Future.** Add a requirement only when it has durable value; do not add a feature because one forum post mentions it. Before declaring the broader IDE mature, publish a preview to TI hobbyist developers and ask for validation across stock, 32K, disk, FinalGROM, SAMS, TIPI, F18A and speech configurations.

---

# Structured Bibliography and Technical References

Grouped by technical domain. Implementation decisions should prefer primary technical documentation, tool source code and verified hardware documentation over forum recollection. Community discussions remain especially valuable for discovering real-world problems, compatibility issues, undocumented behaviour and established practice.

Entries marked **[added 2026-08-20]** were consulted during the naming, evidence and routing work and were absent from the previous bibliography.

## A. Core TI-99/4A hardware and system architecture

- TI-99/4A Console Technical Data and Technical Reference material. Console architecture, memory map, scratchpad RAM, ROM and GROM organisation, I/O ports, interrupts.
- TMS9900 Microprocessor Data Manual and Programmer's Reference. Instruction set, addressing modes, workspace architecture, status register, interrupts, timing.
- TMS9918A, TMS9928A and TMS9929A Video Display Processor documentation. Registers, Graphics I and II, Text and Multicolor modes, pattern, colour, name and sprite tables, VRAM access, hardware limits.
- SN76489 sound-generator documentation.
- TMS5220 Speech Synthesizer documentation.
- TI-99/4A architecture reference. https://unige.ch/medecine/nouspikel/ti99/architec.htm

## B. TI BASIC and TI Extended BASIC

- TI BASIC Reference Guide and User's Reference Guide. Authoritative for TI BASIC statements, functions, syntax, runtime behaviour and file I/O.
- TI Extended BASIC Reference Manual. https://ftp.whtech.com/programming/Extended%20Basic/TI%20Extended%20Basic%20-%20Linked.pdf
- TI BASIC reference material. https://ftp.whtech.com/Users/stephen/book2.htm
- TI manual archive. https://www.1000bit.it/support/manuali/manuali.asp?cboCostr=-2
- TI-99/4A Disk Memory System documentation. File operations, device names, organisations, record formats.
- xbas99 implementation. https://github.com/endlos99/xdt99/blob/master/xbas99.py

**[added 2026-08-20]**

- **xdt99 `doc/EMACS.md` and `ide/README.md`.** The only xdt99 documents that map file extensions to languages. They show `.b99`, `.bas` and `.xb` all resolving to one BASIC mode, which is the evidence that `.b99` is a weak dialect presumption rather than a dialect statement. Not in the manual, and easily missed.
- **`xbas99.py` default output extension, line 854: `ext='.b99'`.** xbas99 writes `.b99` when detokenising **either** dialect. This is the reason the import pipeline must choose its own filename from the resolved dialect rather than accept the tool default.
- **AtariAge: Question about non-TI filesystem extensions for TI BASIC files.** https://forums.atariage.com/topic/309621-question-about-non-ti-filesystem-extensions-for-ti-basic-files/ Community discussion of `.bas` versus `.xb` and other conventions. Note: AtariAge returns HTTP 403 to automated fetching, so this requires a human reader.
- **Ninerpedia: Extended BASIC.** https://www.ninerpedia.org/wiki/Extended_BASIC Checked for an extension convention and documents none, which is itself evidence.
- **arcadeshopper TI-99/4A FAQ: Extended BASIC.** https://www.arcadeshopper.com/wp/ti-99-4a-faq-extended-basic/
- **mainbyte.com: TI-99 Extended BASIC.** http://mainbyte.com/ti99/software/s_carts/ext_basic.html

### Verified design findings traceable to these sources

- xbas99 does not itself distinguish TI BASIC from Extended BASIC as separate source dialects.
- Standard and long native program formats are structurally different. Long format uses the `>ABCD` header and a 32K high-memory representation.
- Label information is not preserved in the native tokenised program, which is why a sidecar map is required.
- Safe renumbering must operate on token semantics rather than textual numeral replacement.
- Native round trips preserve program semantics but cannot preserve arbitrary source formatting.

## C. TMS9900 assembly, GPL, and the xdt99 toolchain

- xdt99 repository and documentation. https://github.com/endlos99/xdt99 and https://github.com/endlos99/xdt99/blob/master/doc/MANUAL.md
- Tools: `xas99`, `xda99`, `xga99`, `xdg99`, `xbas99`, `xdm99`, and the HFE, CF7+ and nanoPEB utilities.
- Editor/Assembler documentation. E/A object format, Option 3 LOAD AND RUN, Option 5 RUN PROGRAM FILE, tagged-object conventions.
- ASM994a documentation, relevant only if legacy compatibility is separately adopted.

**[added 2026-08-20]**

- **`xas99.py` line 1537 and `xga99.py` line 960: the extension search lists.**
  ```
  xas99   ['', '.a99', '.A99', '.asm', '.ASM', '.s', '.S']
  xga99   ['', '.g99', '.G99', '.gpl', '.GPL', '.g', '.G']
  ```
  These are the authority for `.a99` and `.g99` being xdt99 conventions rather than inventions of this product, and for `.asm` and `.gpl` as accepted alternates.

## D. Native TI files, disks, and storage

- TI Disk Memory System documentation.
- Editor/Assembler documentation.
- xdt99 `xdm99` documentation and source. PROGRAM, DIS/VAR, DIS/FIX, INT/VAR, INT/FIX, TIFILES headers, V9T9 FIAD, sector allocation, catalogs.
- Formats to research separately when implemented: PC99 images, V9T9 images, HFE, CF7+, nanoPEB, TIPI-backed storage.

## E. Device Service Routines, PABs, and file I/O

- TI Disk Memory System documentation; Peripheral Expansion System documentation; Editor/Assembler documentation; console ROM and DSR technical references.
- AtariAge: DSRLINK Code Tutorial. https://forums.atariage.com/topic/262846-dsrlink-code-tutorial/
- AtariAge: File Operations in Assembly Language. https://forums.atariage.com/topic/277243-file-operations-in-assembly-language/
- AtariAge: Need Help Understanding and Implementing Disk File Access. https://forums.atariage.com/topic/385965-need-help-understanding-and-implementing-disk-file-access/

## F. Cartridge, ROM, GROM, and real-hardware deployment

- Editor/Assembler and cartridge technical documentation; xdt99 `xas99` cartridge and RPK documentation; MAME RPK format documentation; FinalGROM 99 documentation; FlashROM documentation.
- AtariAge: Help with Creating Cartridge. https://forums.atariage.com/topic/389153-help-with-creating-cartridge/
- AtariAge: Understanding How Cartridges Load and Run. https://forums.atariage.com/topic/372380-understanding-how-cartridges-load-and-run/

## G. Graphics, VDP, sprites, tiles, and maps

- TMS9918A family documentation and TI console technical references.
- AtariAge: Magellan. https://forums.atariage.com/topic/161356-magellan/
- AtariAge: Sprite Sheets. https://forums.atariage.com/topic/356063-sprite-sheets/
- AtariAge: Rotating Sprites. https://forums.atariage.com/topic/388867-rotating-sprites/
- AtariAge: SPECTRA2 Assembly Library. https://forums.atariage.com/topic/303318-spectra2-asm-library/

## H. Sound, music, and speech

- SN76489 and TMS5220 documentation.
- AtariAge: Writing and/or Reading TI Music. https://forums.atariage.com/topic/295038-writing-andor-reading-ti-music/
- AtariAge: VGM Compression Tool. https://forums.atariage.com/topic/225463-vgm-compression-tool/
- AtariAge: Creating and Playing Custom Speech. https://forums.atariage.com/topic/383694-creating-and-playing-custom-speech/

## I. SAMS expanded memory

- AtariAge: SAMS Usage in Assembly. https://forums.atariage.com/topic/229205-sams-usage-in-assembly/
- AtariAge: SAMS Buffer Handling Routines for RXB. https://forums.atariage.com/topic/391463-sams-buffer-handling-routines-for-rxb/
- SAMS hardware and mapper register documentation; emulator SAMS configuration documentation.

## J. TIPI and modern storage and networking

- AtariAge: Programming with the TIPI. https://forums.atariage.com/topic/281172-programming-with-the-tipi/
- Current TIPI project documentation and source, which is the authority because TIPI is actively developed.

## K. F18A enhanced video

- AtariAge: F18A Programming, Info, and Resources. https://forums.atariage.com/topic/207586-f18a-programming-info-and-resources/
- AtariAge: F18A Performance in VDP Read/Write and Scrolling. https://forums.atariage.com/topic/352844-f18a-performance-in-vdp-read-write-and-scrolling/
- Current F18A documentation for registers, ECM modes, palettes, GPU and sprite enhancements.

## L. Emulator and debugger references

- Classic99. https://github.com/tursilion/classic99 Command-line behaviour, disk and cartridge mounting, debugger features, supported hardware profiles.
- AtariAge: How About a Debugger Tutorial. https://forums.atariage.com/topic/234812-how-about-a-debugger-tutorial/
- AtariAge: Getting Started Testing Assembly Program on Emulator. https://forums.atariage.com/topic/384967-getting-started-testing-assembly-program-on-emulator/
- Current MAME TI-99/4A documentation for machine profiles, cartridge and disk loading, and debugger integration.
- JS99er and other emulators, useful for cross-validation, not required build dependencies.

## M. C, GCC, and libti99ALL

- AtariAge: New Automated GCC TMS9900 Installation. https://forums.atariage.com/topic/389028-new-automated-gcc-tms9900-installation/
- AtariAge: GCC, libti99 and Speech. https://forums.atariage.com/topic/378943-gcc-libti99-and-speech/
- AtariAge: Banked ROM Cartridge Starter Project in C. https://forums.atariage.com/topic/389091-my-starter-project-for-developing-banked-rom-cartridge-software-using-c/

## N. GPL development

- xdt99 `xga99` and `xdg99`.
- AtariAge: History of GPL. https://forums.atariage.com/topic/299946-history-of-gpl/

## O. Forth development

fbForth, TurboForth, Camel99 and other TI Forth systems are distinct languages. Select a specific dialect and toolchain before building a bibliography for it.

## P. AtariAge community research

- TI-99/4A Computers Forum. https://forums.atariage.com/forum/164-ti-994a-computers/
- TI-99/4A Development Forum. https://forums.atariage.com/forum/119-ti-994a-development/
- TI-99/4A Development Resources. https://forums.atariage.com/topic/153704-ti-994a-development-resources/
- Assembly on the 99/4A. https://forums.atariage.com/topic/162941-assembly-on-the-994a/

Forum statements should not automatically become hard diagnostics. Verify against primary documentation, tool source, reproducible emulator tests or real hardware.

## Q. Visual Studio Code extension platform

- Visual Studio Code Extension API. https://code.visualstudio.com/api
- Publishing Extensions. https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- Extension Manifest. https://code.visualstudio.com/api/references/extension-manifest
- Web extensions, explaining why a browser-only build is impossible. https://code.visualstudio.com/api/extension-guides/web-extensions

**[added 2026-08-20]**

- **Contributed submenus.** https://code.visualstudio.com/api/references/contribution-points#contributes.submenus Used for the single `TI-99/4A` Explorer submenu.
- **when-clause contexts.** https://code.visualstudio.com/api/references/when-clause-contexts Used for the routing context keys.
- **Language configuration guide.** https://code.visualstudio.com/api/language-extensions/language-configuration-guide Used for the BASIC language configuration.
- **Syntax highlight guide.** https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide **Required for P0-1**, the missing BASIC grammars.
- **Testing extensions.** https://code.visualstudio.com/api/working-with-extensions/testing-extension **Required** to close acceptance criteria 7 and 15.

## R. GitHub, releases, and sponsorship

- GitHub Actions. https://docs.github.com/actions
- GitHub Releases. https://docs.github.com/repositories/releasing-projects-on-github
- GitHub Sponsors. https://docs.github.com/sponsors

## S. Test tooling **[added 2026-08-20]**

- **Node.js built-in test runner.** https://nodejs.org/api/test.html The entire suite uses it, with zero test dependencies. Glob patterns require Node 22, which caused a CI failure early in development; recording it prevents rediscovery.

## T. Licensing and attribution sources

Every bundled or integrated third-party component must record project name, URL, version or commit, licence, attribution requirements, and whether source is bundled, invoked externally or merely linked. Especially: xdt99, SPECTRA2, libti99ALL, VGM tools, speech conversion tools, graphics converters, emulator integrations, and any community-derived routine.

Forum code snippets must not be copied into the SDK merely because they are publicly visible. Determine authorship and licensing first.

## U. Source reliability hierarchy

1. Reproducible behaviour on documented real hardware
2. Primary TI hardware and software documentation
3. Maintained tool source code, for tool-specific behaviour
4. Current official project documentation
5. Reproducible emulator behaviour
6. Well-established community library source
7. AtariAge technical discussions
8. Other secondary summaries

Not absolute: xbas99 source is the authority for what xbas99 does, even where that differs from original TI software.

When a requirement depends on uncertain historical behaviour, document the uncertainty and create a reproducible test instead of silently choosing an interpretation.

---

# Evidence Gaps

Two behaviours the product relies on have no primary written citation. **No authoritative citation should be invented for either.**

### TIFILES 128-byte header layout

Required before any tokenised program taken off a disk can be parsed. Currently supported by **the project's own fixture and empirical behaviour**, verified against Classic99 FIAD output during development and pinned by `test/fixtures/xb-tifiles.prg`.

**Pending:** a primary reference. Likely candidates are the TI Disk Memory System documentation or the V9T9 and TIFILES format notes circulated in the community. Until one is found, the behaviour is evidence-backed, not citation-backed.

### Classic99 auto-run of DSK1.LOAD

The behaviour that a standard-format PROGRAM named `LOAD` auto-loads and auto-runs, while long INT/VAR 254 does not, is currently supported by **a reproducible experiment**, performed twice from a cold start and recorded in `docs/basic-support-design.md` section 1.9.

**Pending:** written documentation, in the Extended BASIC manual, Classic99 documentation or a primary community source. If located it should replace the experiment as the citation. The experiment remains reproducible in the meantime.

### Research quality note: GitHub extension-adoption counts

Figures quoted during the naming research came from GitHub code search, counting files by extension in TI-99 context: `.a99` 146, `.xb` 3, `.b99` 0 to 1, `.xb99` 0, `.g99` 0.

These are **indicative research only, not authoritative community statistics.** GitHub code search covers only indexed public repositories, and the API rate-limits aggressively. They were sufficient to show that `.xb99` conflicts with nothing and that `.xb` has modest real use. They should not be cited as adoption measurements.

---

# PM Handoff

## Current released version

**0.2.0**, tagged `v0.2.0` and released 2026-08-20. Public repository, MIT licence confirmed detected, branch protection and CI rulesets active.

## Current test status

**133 passing, 0 failing, 0 skipped.** Lint clean, types clean, VSIX packages at 54 files with no test fixtures included.

Composition: 45 assembly, 31 BASIC-language, 57 routing.

## What is genuinely complete

- The entire assembly product: edit, validate, build, package, launch, export, across five distribution routes plus the Extended BASIC-hosted assembly disk.
- Cartridge output byte-identical to the known-good original.
- Canonical source naming and the strength-based dialect resolution model.
- Token-aware and TIFILES-aware Extended BASIC evidence detection.
- The BASIC lexer.
- The central action resolver and the whole context-aware routing architecture.
- Repository infrastructure: CI, releases, issue and PR templates, Dependabot, licensing and attribution.

## What is partially complete

- **BASIC and Extended BASIC as languages.** Registered, resolved, routed. No grammar, no parser, no executable pipeline.
- **BASIC build.** The tokenisation capability exists and runs for the assembly loader; no BASIC-primary project can reach it.
- **BASIC metadata.** Subprograms and colours done; statements, functions, operators and keywords missing; four entries need manual confirmation.
- **Disk browser.** Read-only.
- **Project wizard.** Creates a project; does not ask the intended questions and cannot create a BASIC project.
- **Marketplace readiness.** Metadata complete, publisher unregistered.

## Current active phase

**Phase 1 - Multi-Language Core: TI BASIC and Extended BASIC.** The architecture portion is complete. The executable pipeline is the remaining work.

## P0 blockers

1. **BASIC and Extended BASIC TextMate grammars.** Languages are registered without them, so BASIC files open as unstyled text under a TI language mode.
2. **Show Memory Map mismatch.** The command exposes the symbol table; the requirement 29.2 model does not exist.
3. **embed-xb compatibility detection.** A stock xdt99 3.6.5 user may produce a corrupt `xb-loader` artifact with no diagnostic, because the development machine carries a patch they do not have.

All three are places where the product claims more than it delivers. All three are small.

## Next logical implementation milestone

**The BASIC parser, AST and binder,** followed immediately by **making BASIC a primary project language** so the tokenisation that already works becomes reachable.

Those two unlock validation, the five BASIC targets, Run, Build and Run, and every editing feature. Everything else in Phase 1 depends on them. The P0 items should be cleared first because they are small and each one is currently misleading a user.

## Open product decisions requiring PM input

**D1. BASIC grammar strategy.** Ship hand-written TextMate grammars now, or unregister the BASIC language IDs until the parser can drive semantic highlighting? Grammars are quick and fix the visible gap immediately, but a hand-written grammar will duplicate knowledge the lexer already holds and the two can drift. Unregistering is honest but removes the language identity that routing depends on. **Recommendation: ship minimal grammars now, and treat them as presentation-only, with the lexer remaining the single source of truth for semantics.**

**D2. Show Memory Map.** Rename the command to `Show Symbols` and leave requirement 29.2 unimplemented, or build the memory-map model? Renaming is honest and cheap, but the command shipped in 0.2.0 and a rename breaks any keybinding or task referencing it. **Not decided; not changed during this pass.**

**D3. Build profiles.** Requirement 12 specifies named debug and release profiles with per-profile defines and output settings. None exists, and targets serve a different purpose. Is this still wanted, or superseded by targets?

**D4. Project wizard scope.** The wizard currently creates one multi-target assembly project without asking the ten specified questions. Phase 1 needs BASIC project creation. Should the full question flow be built, or should the wizard stay template-driven with a language choice added?

**D5. Missing commands from requirement 15.** Build Active File, Stop Emulator, Select Build Profile, Show Symbols and Reveal Build Artifact are specified and absent. Which are still wanted? Stop Emulator and Show Symbols look genuinely useful; Select Build Profile depends on D3.

**D6. Formal error model.** Requirement 42 specifies a `Ti99ExtensionError` interface with a code enum. The implementation produces actionable messages without the formal structure. Adopt the formal model, or record it as superseded?

**D7. Status of `docs/requirements.md`.** The original 46-section specification remains in the repository at 2804 lines and now conflicts with this document in places, most visibly on the project filename and assembly extensions. Archive it, mark it superseded, or delete it?

**D8. Cross-platform verification.** macOS and Linux have never been executed. When should that be scheduled, and does it gate the Marketplace publish?

## Requirements implemented intentionally differently

| Requirement | Original | Implemented | Reason |
|---|---|---|---|
| 10, 12 | `ti99-project.json` | `ti99.json` | Shipped before 0.2.0, in the template; renaming breaks released projects. Decision D-A |
| 22.1 | `.asm .a99 .s .inc` | `.a99 .asm` only | `.s` is standard GNU and ARM assembly; claiming it gave TMS9900 diagnostics to unrelated files. Decision D-B |
| 11.3 | Six discrete project types | One multi-target template | A single project builds all assembly routes; discrete types would duplicate source |
| 12.3 | Nested configuration schema | Flatter model with capability-based outputs | Simpler to validate and to merge per target |
| 39, 40 | Proposed file layout and interfaces | Flatter layout, equivalent interfaces | Advisory in the original; no functional difference |
| 42 | Formal error code enum | Actionable messages without the enum | Pending D6 |
| 29.2 | Memory map | Symbol table under the memory-map command name | Not a decision, a defect. P0-2 |

## Evidence gaps requiring external research

1. **TIFILES 128-byte header layout** - supported by the project fixture and empirical behaviour, pending a primary reference.
2. **Classic99 DSK1.LOAD auto-run behaviour** - supported by a reproducible experiment performed twice, pending written documentation.
3. **Four BASIC metadata entries flagged `confirm`** - `CHAR`, `SOUND`, `MAGNIFY` and `VERSION` parameter details need a pass over the Extended BASIC manual before they drive anything stronger than a hint.
4. **MAME and real-hardware validation** of the Extended BASIC-hosted assembly disk, per requirement 50.6. Classic99 is verified; the other two are not.
