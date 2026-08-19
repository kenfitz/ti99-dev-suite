# Changelog

All notable changes to the TI-99/4A Development Suite are recorded here.
This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] — unreleased

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
