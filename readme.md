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

### It builds every distribution route from one source

A TI-99 program reaches its user in one of three ways, and each needs a
different prologue: a cartridge needs `AORG >6000` and a standard header, an
Editor/Assembler option 5 image needs a branch at offset 0 because option 5
executes from the load address, and anything that resolves the entry by name
needs only `DEF`.

A project can declare `targets` in `ti99.json` — distribution routes that each
override part of the configuration and inherit the rest:

```jsonc
"targets": [
  { "id": "cart", "label": "Cartridge",   "distDir": "dist/cart",
    "outputs": ["cart-rpk", "cart-bin"],  "emulatorProfile": "classic99-cart" },
  { "id": "ea",   "label": "Editor/Assembler", "distDir": "dist/ea",
    "outputs": ["ea3-object", "ea5-image", "tifiles"] },
  { "id": "disk", "label": "Extended BASIC boot disk", "distDir": "dist/disk",
    "outputs": ["ea3-object", "basic-program", "basic-tifiles", "disk-image"] }
]
```

**TI-99: Build** builds them all; **TI-99: Build Target...** builds one. Each
target gets its own `build/` and `dist/` folder, and each is offered as a
separate task under Run Task.

Projects that declare no targets behave exactly as before.

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

## Installation

**From a release.** Download the `.vsix` from the
[Releases page](https://github.com/kenfitz/ti99-dev-suite/releases), then
either drop it on the Extensions view, or:

```
code --install-extension ti99-dev-suite-<version>.vsix
```

**From the Marketplace.** Not published yet — see
[Project status](#project-status).

**From source.** See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Getting started


1. **TI-99: Create New Project**, name it, pick a syntax dialect, and choose
   which route **Build and Run** should use by default.
2. Edit `src/main.a99`.
3. Press **F5**.

The new project prints `HELLO WORLD!` and already builds three ways — a
cartridge, an Editor/Assembler program, and an Extended BASIC disk — from that
one file:

```
src/
  main.a99             the program - the file you edit
  targets/
    cart.a99           cartridge            ->  dist/cart/
    ea.a99             Editor/Assembler     ->  dist/ea/
    disk-xb.a99        Extended BASIC disk  ->  dist/disk-xb/
boot/
  LOAD.b99             Extended BASIC loader, tokenised onto the disk
```

`src/main.a99` carries no `AORG`, no cartridge header and no `DEF`: each
wrapper supplies the prologue its loader needs and then `COPY`s the body, so
adding to the program means editing one file. It is commented for someone new
to the machine — the VDP ports, what lives in scratchpad, why a cartridge
cannot write to its own data, and where to put your code — which also gives an
assistant enough context to help you write it.

The utility routines it ships with (`VSBW`, `VMBW`, `VWTR`, `CLS`) mean the
program needs nothing from the Editor/Assembler, which is what lets the same
source run from a cartridge on a bare console.

Importing existing code instead? **TI-99: Import Existing Source** detects the
dialect of your source and never modifies a file.

---

## Getting a program to a user

A TI-99/4A cannot run assembly from disk on its own. The console boots to TI
BASIC, which has no `CALL LOAD`, and the disk controller serves files rather
than executing them. Something in the cartridge port has to supply the loader,
so the route you choose is really a choice about what your user already owns.

| Route | They need | You ship |
|---|---|---|
| Cartridge | nothing | `.rpk` for MAME, or a `C.BIN` for Classic99 and FinalGROM 99 |
| E/A option 5 | Editor/Assembler + 32K | a memory image, loaded by filename |
| E/A option 3 | Editor/Assembler + 32K | a tagged object, entered by program name |
| Extended BASIC | Extended BASIC + 32K | a disk with a `LOAD` program |

Extended BASIC was in far more homes than Editor/Assembler, so an XB disk
usually reaches more people than an E/A one. A cartridge reaches everybody.

### Entry points differ, and it matters

Only some loaders resolve the entry point by name:

| Loader | Finds the entry by | Needs |
|---|---|---|
| console (cartridge) | `DATA` in the `>AA` header | a standard header |
| E/A option 3 | name, from `DEF` | nothing |
| XB `CALL LINK("NAME")` | name, from `DEF` | nothing |
| E/A option 5 | the load address | entry first, or a branch to it |
| `xas99 --embed-xb` | the code base | entry first, or a branch to it |

If your entry point is not the first thing emitted — and it usually is not,
because data tables tend to come first — the last two rows execute your data as
instructions. A single `B @MAIN` ahead of everything satisfies both.

### Two ways to build an Extended BASIC disk

**Embedded, one file.** `xas99 --embed-xb` stores the code inside an XB program.
The disk holds only `LOAD`. Simple to ship, but XB reads the whole program
before running a single statement, so a large program means a long silence with
nothing on screen.

**Loader plus object, two files.** A small XB program prints progress and
`CALL LOAD`s the object. It costs a second file, and buys feedback: the loader
can print each step, and sprites set moving with `CALL SPRITE` keep moving
during the load because the console interrupt routine drives them. If the
machine hangs, they stop — which tells a user more than a frozen screen does.

### Taking over from Extended BASIC

XB does not have to survive. If your program never returns, it can own the
machine, but it must stop XB's interrupt routine first or the two will fight
over scratchpad. A bootstrap ahead of the game, and no change to the game
itself, is usually enough:

```asm
XBBOOT LIMI 0                * before touching anything
       LWPI MYWS             * our own workspace
       CLR  R0
       MOV  R0,@>83C4        * address of the user interrupt routine
       MOVB R0,@>83C2        * flag byte controlling it
       B    @MAIN
```

Those two locations are documented in appendix 24.3.1 of the Editor/Assembler
manual. Clearing them leaves the console interrupt routine doing only its own
work — the timer, sprite motion, and the sound list — which is what a program
written for a cartridge already expects.

### Writing a disk image to real media

Every build that produces a disk image prints this, with the paths filled in:

```
xhm99.py -T snake.dsk -o snake.hfe
```

HFE is what a Gotek, a greaseweazle or an HxC floppy emulator expects, and a
greaseweazle writes it to a physical disk. Converting back with `-F` returns
the `.dsk` unchanged, so nothing is lost in the round trip. The `.dsk` itself
works directly in Classic99, MAME and js99er.

---

## Commands


| Command | Default key |
|---|---|
| TI-99: Build | Ctrl+Shift+B |
| TI-99: Build and Run | F5 |
| TI-99: Build Target... | |
| TI-99: Rebuild / Rebuild Target... / Clean | |
| TI-99: Create New Project | |
| TI-99: Import Existing Source | |
| TI-99: Convert Source to xas99 Syntax | |
| TI-99: Detect Source Dialect | |
| TI-99: Check for Dialect Hazards | |
| TI-99: Show Toolchain Status | |
| TI-99: Open Build Listing | |
| TI-99: Show Symbols | Load the symbol table from the last build into the Symbols view. The older `ti99.showMemoryMap` command id still works as an alias; it never produced a memory map, and the real memory map remains future work. |
| TI-99: Show Disk Catalog | |
| TI-99: Export to Real Hardware | |

---

## Source file naming

New projects use the canonical extension for their language. The aliases are
recognised as first-class equivalents, not as deprecated spellings.

| Language | Canonical | Alias |
|---|---|---|
| TMS9900 Assembly | `.a99` | `.asm` |
| TI BASIC | `.b99` | |
| TI Extended BASIC | `.xb99` | `.xb` |
| GPL | `.g99` | `.gpl` |
| BASIC, dialect unspecified | | `.bas` |

`.a99` and `.g99` are the extensions xas99 and xga99 already look for, so the
assembly and GPL naming is xdt99 naming rather than something invented here.
`.xb99` is a modern convention introduced by this extension for consistency
with that family; it was never used on the original TI.

`.b99` needs one caution. xbas99 writes it when detokenizing **either**
dialect, because xbas99 does not distinguish them, so an existing `.b99` file
may well hold Extended BASIC. This extension adopts `.b99` for new TI BASIC
source but never assumes an existing one is TI BASIC: project configuration, a
per-file override, or an Extended BASIC construct in the source all take
precedence over the name.

`.bas` says nothing about dialect and is treated as neutral. When the dialect
cannot be established the extension asks, because absence of Extended BASIC
syntax is not evidence of TI BASIC. Every valid TI BASIC program is also a
valid Extended BASIC program, so there is nothing to infer from.

See [docs/source-naming.md](docs/source-naming.md) for the full precedence
rules.

## Commands and menus

Right-clicking a TI source file gives a **TI-99/4A** submenu whose entries
depend on what the file actually is:

- An entry source offers Build, Run, Build and Run, Build and Run As, Package
  and Validate.
- A module belonging to one or more targets offers Build Containing Target
  rather than pretending to be a standalone program.
- A `.bas` file of unknown dialect offers only the dialect question.

`Build and Run` uses the default target, so ordinary work is one click.
`Build and Run As...` always shows the target list. A target that is
compatible but unconfigured stays in the list and names the setting to fix.

The same commands work from the Command Palette. Both surfaces call one
resolver, so they cannot offer different targets for the same file.

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

## Requirements and roadmap

The single authoritative specification for what this product is intended to
be, and where the implementation currently stands, is
[docs/requirements-master.md](docs/requirements-master.md). It carries the
requirements, the implementation status, the product decisions and the phased
roadmap.

Supporting documents: [the implementation audit](docs/audit-2026-08-20.md),
[the BASIC design report](docs/basic-support-design.md), and
[the source naming convention](docs/source-naming.md).

The original assembly-only specification is archived at
[docs/archive/requirements-assembly-original.md](docs/archive/requirements-assembly-original.md)
and is historical reference only.

## Project status

Early but usable. The version number is honest: the language support,
formatting, dialect handling, build pipeline and emulator launching all work
and are used on real projects, but the extension has had few users besides its
author, so expect rough edges on setups unlike mine.

Not yet on the VS Code Marketplace. Install from a
[release](https://github.com/kenfitz/ti99-dev-suite/releases) in the meantime.

Reports from people running different toolchain versions, emulators and source
dialects are the most useful thing anyone can contribute right now.

---

## Reporting bugs and requesting features

Both are welcome, and both go through
[GitHub Issues](https://github.com/kenfitz/ti99-dev-suite/issues).

- **[Report a bug](https://github.com/kenfitz/ti99-dev-suite/issues/new?template=bug_report.yml)** —
  the output from the **TI-99** channel in the Output panel is usually the
  single most useful thing to attach, along with your xdt99 version and
  emulator.
- **[Request a feature](https://github.com/kenfitz/ti99-dev-suite/issues/new?template=feature_request.yml)** —
  describing the TI-99/4A workflow you are trying to complete helps more than
  proposing an implementation.

Suspected security issues should be
[reported privately](https://github.com/kenfitz/ti99-dev-suite/security/advisories/new)
rather than in a public issue. See [SECURITY.md](SECURITY.md).

**A note on code contributions:** the project is maintained directly by KF1TZ
Software and is not currently accepting external pull requests. Please open an
issue rather than sending a patch — [CONTRIBUTING.md](CONTRIBUTING.md) explains
the reasoning. Forking for your own use is welcome under the MIT licence.

---

## Maintainer and licence

Maintained by **KF1TZ Software**.

Released under the [MIT licence](LICENSE.txt) — you may use, modify and
redistribute it, including commercially, provided the copyright notice and
licence text are kept.

Third party software this extension works with, and the trademarks it
references, are recorded in [NOTICE.md](NOTICE.md). Notably xdt99 is GPL v3 and
is invoked as a separate program, never bundled or modified.

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
