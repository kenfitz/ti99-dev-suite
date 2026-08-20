# TI-99/4A Development Suite 0.3.0-beta.1

**A preview build for hands-on testing.** Three languages now build and run
from source. Please try it and tell me what breaks.

This is a beta. It is not a finished product, and the list of what is missing
below is deliberately specific.

---

## What is new: TI BASIC and TI Extended BASIC

Both are now first-class languages, not syntax colouring. You can create a
project, write a program, see mistakes before you build, produce a native
tokenised program, put it on a disk image, and run it.

### The editing experience

- **Syntax highlighting** for both dialects.
- **Live diagnostics** as you type, from a real parser rather than pattern
  matching. Unknown subprograms, wrong argument counts, arguments outside their
  documented ranges, duplicate line numbers, branches to lines that do not
  exist, unclosed `SUB`, and Extended BASIC constructs in TI BASIC source.
- **Completion** that knows where you are: after `CALL` you get subprograms,
  including the ones your own program defines.
- **Hover** with syntax, parameter ranges, restrictions and which dialect a
  thing belongs to.
- **Signature help** while typing arguments.
- **Go to definition** and **find references** for line numbers and
  subprograms. Hovering a line number shows the line and how many places branch
  to it.
- **Outline** showing subprograms and the lines something branches to.

The diagnostics are deliberately conservative. Ranges are checked only for
values written literally, because a variable might hold anything and a
validator that guesses becomes noise people stop reading. If you find a false
positive, that is a bug and I want to hear about it.

### Building and running

| Target | What you get |
|---|---|
| TI BASIC Program | Tokenised program, dropped into DSK1 |
| TI BASIC Disk | Disk image holding it |
| Extended BASIC Program | Tokenised program |
| Extended BASIC Disk | Disk image |
| Extended BASIC Auto-Run Disk | A disk whose program is named `LOAD`, which Extended BASIC starts by itself |

TI BASIC needs no cartridge at all, since it lives in the console ROM. That
makes it the quickest way to see something run.

### Native format

Standard format is the default and is preferred whenever the program fits: it
loads on an unexpanded console and it is what Extended BASIC auto-runs from
`DSK1.LOAD`. Long format needs the 32K expansion and does **not** auto-run, so
it is opt-in through `basicFormat` rather than chosen because 32K happens to be
present.

The build log tells you which format you actually got, measured from the
artifact rather than assumed.

### Project files

`ti99.json` now has a published JSON Schema, so it completes and validates as
you edit it.

---

## Source file naming

| Language | Canonical | Also accepted |
|---|---|---|
| TMS9900 Assembly | `.a99` | `.asm` |
| TI BASIC | `.b99` | |
| TI Extended BASIC | `.xb99` | `.xb` |
| GPL | `.g99` | `.gpl` |
| BASIC, dialect unspecified | | `.bas` |

`.a99` and `.g99` are the extensions xdt99 itself looks for. `.xb99` is a
convention this extension introduces; it was never used on the original TI.

`.b99` needs one note. xdt99 writes it for **both** BASIC dialects, so an
existing `.b99` file may well hold Extended BASIC. New TI BASIC projects use
it, but an existing file is never assumed to be TI BASIC: your project
configuration, a per-file setting, or an Extended BASIC construct in the source
all take precedence over the name.

`.bas` says nothing about dialect, so the extension asks rather than guessing.
Absence of Extended BASIC syntax is not evidence of TI BASIC: every valid TI
BASIC program is also a valid Extended BASIC program.

---

## Assembly is unchanged

All five distribution routes still work exactly as before, and the Snake
cartridge used as the regression reference remains byte-identical to its
known-good original.

### The Extended BASIC loader guard

If you build the Extended BASIC assembly loader with xdt99 3.6.5 or earlier and
your program is over 257 bytes, xas99 aborts with an internal Python error and
writes nothing. The extension now detects this before starting, by probing what
your installation can actually do rather than checking a version string, and
explains what is wrong and what would fix it.

**It does not modify your xdt99 installation.** It never will.

---

## Supported emulators

Classic99 across cartridge, Editor/Assembler, Editor/Assembler disk, Extended
BASIC, Extended BASIC disk, TI BASIC and Extended BASIC program profiles; MAME
for cartridge and disk; JS99er and Win994a; and a configurable custom profile.

Where a step has to happen on the TI side, the extension tells you exactly what
to type instead of pretending it automated it.

---

## Known limitations

Please read this section before reporting something as broken.

**Verified on Windows only.** macOS and Linux have never been run. Path
handling is normalised and tested, but toolchain discovery differs per platform
and has not been executed there. Do not treat this build as cross-platform.

**No round-trip disk editing.** You cannot yet import a program off a disk,
diff it against your source, or update a program on a disk from source.
Detokenisation is not implemented. That is the next phase.

**No memory map.** `Show Symbols` shows the symbol table. The address-range and
overlap analysis described in the requirements does not exist. The command that
used to be called `Show Memory Map` was renamed because it never did that; the
old command id still works.

**No GPL support.** `.g99` and `.gpl` resolve as GPL for naming purposes only.
xga99 is not integrated and no GPL project can be built.

**No semantic highlighting for BASIC.** The grammars are presentation-only; the
parser is not yet driving colour.

**No renumbering or label mode.** Both are designed and neither is built.

**No MERGE format and no protected-program handling.**

**Four subprogram entries were reconciled against real programs rather than the
manual.** `CALL CHAR` is documented as accepting character codes 32 to 143, but
published Extended BASIC programs define characters up to 155, so the check
uses the character-set limit instead. If you know the authoritative answer, I
would like to hear it.

**No automated emulator testing.** Builds are verified structurally: format,
headers, disk catalogs and file types. Whether a program looks right on screen
is checked by hand.

---

## Deferred to later phases

Round-trip disk workflows; the managed SDK and library system; hardware
capability profiles; SAMS; TIPI; DSR and file-I/O services; the graphics,
sound and speech studios; F18A; source-level debugging; C and GCC; GPL; Forth.

None of these are started. They are listed so you know they are planned rather
than forgotten.

---

## Reporting problems

A false diagnostic on a program that really works is the most valuable thing
you can report, followed by anything where the extension claims to have done
something it did not do.

`TI-99: Show Toolchain Status` reports the versions worth including.
