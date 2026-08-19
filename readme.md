# TI-99/4A Development Suite

Write TMS9900 assembly for the TI-99/4A in VS Code. Build cartridges, disk
images and Editor/Assembler programs, and launch them in an emulator without
leaving the editor.

Uses [xdt99](https://github.com/endlos99/xdt99) as the assembler and disk
manager. xdt99 is a separate project and is not bundled — see
[Requirements](#requirements).

---

## Features

### It knows the instruction set

Hover any mnemonic for the full picture: instruction format, operand pattern,
cycle count, address-mode penalties and which status flags it touches.

```
MOV source,destination
Move Word — format 1

Copies source to destination and sets status from the value moved.

Cycles: 14
Address mode penalty: *R +4, *R+ +8, @LABEL +8, @LABEL(R) +8
Status flags: L> (logical greater than), A> (arithmetic greater than), = (equal)
```

The Editor/Assembler utilities are built in too, so `REF VMBW` resolves and
hovers with its calling convention instead of raising a false error.

### It formats to TI conventions

Label at column 1, opcode at 8, operand at 13, comment at 31 — all
configurable. Trailing comments on definitions become hover documentation, so
the comments you already wrote start earning their keep.

### It understands the three assembly dialects

Editor/Assembler strict, xas99 extended and xas99 relaxed disagree about where
the operand field ends. One setting drives tokenizing, formatting and the
assembler flag together, so they cannot drift apart.

**This matters more than it sounds.** Legacy TI source frequently separates a
trailing `*` comment from the operand by a single blank. Under xas99's default
syntax that blank belongs to the expression, so this:

```
       MOV  @SSNKSZ,@SNKSIZ * Reset the snake size
```

is read as a multiplication, and the assembler goes looking for a symbol called
`RESET THE SNAKE SIZE`. On a real 1,500-line game that is a dozen errors that
look nothing like the actual problem.

The extension flags those lines as you type, offers a one-character quick fix,
and can migrate a whole file with **TI-99: Convert Source to xas99 Syntax** —
in a minimal mode that touches only the lines that would change meaning.

### It builds and runs

| Output | Runs on |
|---|---|
| MAME RPK cartridge | MAME |
| Padded raw cartridge binary | Classic99, FinalGROM 99, FlashROM 99 |
| Editor/Assembler option 5 image | Any E/A environment |
| Editor/Assembler option 3 object | Any E/A environment |
| TI disk image | MAME, real hardware, HxC |
| TIFILES | Classic99 FIAD folders |

Press **F5**. The extension assembles, packages, verifies the artifact exists,
reports any errors in the Problems panel, and launches your emulator.

Assembler errors arrive as proper diagnostics with the offending token
underlined, not the whole line — and without the duplicates xas99 emits once
per pass.

### It is not locked to one toolchain

xdt99 ships as the default profile, but the toolchain model is declarative.
Register another assembler in `ti99.toolchain.profiles` with its own detection
rules, argument templates and problem matcher. Capabilities drive the UI, so a
tool that cannot produce RPKs simply will not offer cartridge output.

---

## Requirements

| | |
|---|---|
| **Python 3.8+** | xdt99 is written in Python |
| **xdt99 3.6.0+** | [github.com/endlos99/xdt99](https://github.com/endlos99/xdt99) — a folder of `.py` files, not a pip package |
| **An emulator** | Optional, but needed for Build and Run |

Run **TI-99: Configure Toolchain** after installing. The extension searches
`PATH`, `XDT99_HOME`, and `<workspace>/tools/xdt99` before asking.

No TI ROMs, GROMs, cartridge images or system firmware are distributed with
this extension, and it will not download them. Point the settings at your own
copies.

---

## Getting started

1. **TI-99: Create New Project** and pick a target.
2. Edit `src/main.a99`.
3. Press **F5**.

Importing existing code instead? **TI-99: Import Existing Source** detects the
dialect of your source and never modifies a file.

---

## Commands

| Command | Default key |
|---|---|
| TI-99: Build | Ctrl+Shift+B |
| TI-99: Build and Run | F5 |
| TI-99: Rebuild / Clean | |
| TI-99: Create New Project | |
| TI-99: Import Existing Source | |
| TI-99: Convert Source to xas99 Syntax | |
| TI-99: Detect Source Dialect | |
| TI-99: Check for Dialect Hazards | |
| TI-99: Show Toolchain Status | |
| TI-99: Open Build Listing | |
| TI-99: Show Memory Map | |
| TI-99: Show Disk Catalog | |
| TI-99: Export to Real Hardware | |

---

## Emulator notes

**Classic99** is launched with `classic99.exe -rom <file>`. This is not in the
Classic99 manual; it was confirmed by the author. Cartridge type is inferred
from the last character of the filename (`C` plain ROM, `8` non-inverted 378
banking, `3` inverted 379, `G` GROM), and the extension names the output
accordingly. Classic99 cannot write to `.dsk` images, so disk projects drop
TIFILES straight into your configured `DSK1` folder.

**MAME** takes the RPK directly and is the better default for cartridge work.
Disk projects need your own Editor/Assembler cartridge image; set
`ti99.emulator.eaCartridgePath`.

**Win994a** is launch-only. It has no documented command line for loading a
program; files go in through its own Disk Manager.

**Js99er** runs in a browser, so the extension opens it and reveals the build
output for you to drag in.

---

## Known limitations

- Analysis is per-file. Cross-file symbol resolution is limited to `COPY`
  navigation until the language server lands.
- No source-level debugging.
- GPL (`xga99`) projects are not yet supported.
- Desktop VS Code only. Web extensions cannot start local processes, which
  rules out running Python, xdt99 or an emulator.

---

## Credits

[xdt99](https://github.com/endlos99/xdt99) by Ralph Benzinger, GPL v3 —
invoked as an external program, not bundled or modified. The xdt99 IntelliJ
plugin was the reference for tokenizing this language correctly.

[Classic99](http://harmlesslion.com/software/classic99) by Mike Brent.
TMS9900 cheat sheet by Stefan "SteveB" Bauch with Lee Stewart and the AtariAge
TI forums.

TI-99/4A and Texas Instruments are trademarks of Texas Instruments
Incorporated. This project is not affiliated with or endorsed by Texas
Instruments, the xdt99 project, the MAME project, or any emulator author.
