# Changelog

All notable changes to the TI-99/4A Development Suite are recorded here.
This project follows [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-08-20

The last release built one thing from one source. This one builds a program
every way a TI-99/4A can receive it, from the same file.

### Added

- **Multi-target builds.** A project declares `targets` in `ti99.json`:
  distribution routes that each override part of the configuration and inherit
  the rest. `TI-99: Build` builds every route, `TI-99: Build Target...` builds
  one, and each is offered as a task. Projects without targets are unaffected.
- **Extended BASIC distribution.** `xas99 --embed-xb` stores the program inside
  an Extended BASIC program, so a disk runs without the Editor/Assembler
  module — the cartridge most people did not own. New `xb-program` capability
  and `classic99-xbdisk` profile.
- **Editor/Assembler option 3.** The tagged object is now staged as well as
  assembled, so option 3 is reachable rather than merely built. New
  `ea3-tifiles` capability.
- **Extended BASIC boot programs.** `basic-program`, `basic-tifiles` and
  `xb-tifiles` capabilities, using `xbas99`, for the loader on a boot disk.
- **Loader cartridge profiles.** `classic99-ea`, `classic99-xb`,
  `classic99-eadisk` and `classic99-xbdisk` load the Editor/Assembler or
  Extended BASIC cartridge, because running anything that is not a cartridge
  needs one: a bare console cannot load code from disk.
- **Launch hints.** A cartridge boots into the program; a loader cartridge drops
  the user at a menu. Profiles now say which option to choose and what filename
  to type, naming the file actually staged.
- **Media instructions.** Builds that produce a disk image print how to write it
  to a Gotek, greaseweazle or HxC with `xhm99`.
- **Project scaffolding.** A new project contains a shared body, three target
  wrappers and an Extended BASIC loader, prints `HELLO WORLD!`, and builds a
  cartridge, an E/A object and image, and an XB disk from the moment it is
  created.
- **Tests.** 45, using Node's built-in runner, with no framework dependency.
- **Repository infrastructure.** CI on Windows and Linux, a tag-driven release,
  Dependabot, issue forms, and a contribution policy.

### Fixed

- **Dialect hazard detection** counted hazards with a regex over the raw line,
  which misread labelled indirect addressing as a comment, counted a `*` inside
  a `;` comment, treated a tab as a single blank, and let any `*Rn` on a line
  hide a real hazard elsewhere on it. It now uses the field parser the converter
  already used, and agrees with xas99 exactly on every source tested.
- **Project settings were unreachable.** Every setting used VS Code's default
  `window` scope, which is ignored in a folder-level `.vscode/settings.json`, so
  a per-project toolchain or emulator setup silently did not exist. Path
  settings are now `machine-overridable` and the rest `resource`, and the reads
  are scoped to the project folder.
- **Emulator profile precedence** put a global setting above the project's own
  choice, so every target launched through the same emulator. The project wins;
  a profile that cannot accept what the build produced is skipped with a reason.
- **`tifiles` never worked.** Its command referenced `${input}` and
  `${fileType}`, neither of which was supplied.
- **Unresolved arguments were dropped**, turning `-rom <path>` into a bare
  `-rom` and starting the emulator with no cartridge. Profiles now declare what
  they require, checked before anything is staged.
- **`docs/` was being packaged** into the `.vsix`.
- The licence named `<YOUR NAME>` as the copyright holder.

## [0.1.0] — unreleased

Never published; superseded by 0.2.0.

First release.

### Language support

- Syntax highlighting for TMS9900 assembly, with xas99 extension directives
  scoped separately from Editor/Assembler directives so they can be themed
  or linted independently.
- Hover documentation for all 71 TMS9900 instructions and 14 extended
  instructions, including instruction format, cycle counts, address-mode
  penalties and status flags affected.
- Hover and completion for 32 Editor/Assembler utility routines and console
  addresses, so `REF VMBW` resolves rather than raising a false unresolved
  symbol.
- Completion for instructions, directives, registers and document symbols,
  filtered by which field the cursor is in.
- Go to definition, find references, and document outline.
- Go to definition on a `COPY` operand opens the included file, resolving
  both native paths and TI paths such as `DSK1.SOUND`.
- 17 snippets at TI column conventions.

### Formatting

- Column formatter with configurable label, opcode, operand and comment
  columns, defaulting to the TI convention of 1 / 8 / 13 / 31.
- Three syntax dialects — Editor/Assembler strict, xas99 extended and xas99
  relaxed — driving tokenizing, formatting and the assembler flag from one
  setting.
- `TI-99: Convert Source to xas99 Syntax` migrates legacy sources, in either
  a minimal mode that touches only the lines that would change meaning, or a
  full reformat.
- `TI-99: Detect Source Dialect` and `TI-99: Check for Dialect Hazards`.

### Diagnostics

- Static analysis as you type: unknown mnemonics, operand-count mismatches,
  duplicate labels, and the single-blank comment hazard, with a quick fix.
- Assembler and disk-manager output parsed into the Problems panel, with
  cross-pass deduplication and token-level ranges rather than whole lines.
- Unresolved-reference severity is configurable and defaults by project type.

### Build and run

- Pluggable toolchain profiles. xdt99 ships built in; other assemblers can be
  registered through `ti99.toolchain.profiles`.
- Outputs: MAME RPK cartridge, padded raw cartridge binary, Editor/Assembler
  option 3 object, option 5 image, TI disk image and TIFILES.
- Incremental builds keyed on sources, the transitive `COPY` closure and the
  full argument vector.
- A build step succeeds only when the exit code is zero *and* the declared
  artifact exists on disk.
- Emulator profiles for Classic99, MAME, Js99er, Win994a and a custom target,
  filtered by which artifacts the build actually produced.
- Project and artifact sidebar, symbol view grouped by memory region, and a
  disk catalog view.
- Task provider, status bar, and `TI-99: Export to Real Hardware`.

### Known limitations

- No language server yet; analysis is per-file, so cross-file symbol
  resolution is limited to what `COPY` navigation provides.
- No source-level debugging.
- GPL (`xga99`) projects are not supported.
- Win994a is launch-only; no documented command line for loading a program.
