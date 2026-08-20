# {{NAME}}

A TI Extended BASIC project.

Extended BASIC adds sprites, subprograms, `::` for several statements on one
line, and `!` end-of-line comments. It needs the Extended BASIC cartridge.

## Building

`TI-99: Build and Run`, or right-click `src/main.xb99` and use the
**TI-99/4A** menu.

Three targets:

| Target | What you get |
|---|---|
| **Program** | The tokenised program, dropped into DSK1 |
| **Disk** | A disk image holding it |
| **Auto-Run Disk** | A disk whose program is named `LOAD`, which Extended BASIC starts by itself at power-up |

## The auto-run disk

Extended BASIC runs a program called `LOAD` on DSK1 when it starts. Two things
have to be true, and this target arranges both:

- the program is named `LOAD`
- it is in **standard** format

Long format needs the 32K expansion and does **not** auto-run. That is why
`basicFormat` is `standard` and should stay that way unless a program grows
too large, in which case it will no longer auto-run and the target stops being
the right one.

Do not confuse this with the assembly Extended BASIC loader, which also puts a
file called `LOAD` on a disk. That one carries machine code inside a BASIC
wrapper; this one is a BASIC program the interpreter runs directly.

## The source

`src/main.xb99` draws a sprite and calls a subprogram. Edit it and build again.

## Naming

`.xb99` is the canonical extension for new Extended BASIC source, and `.xb` is
accepted as an alias. `.b99` also works: it is the historical xdt99 extension
for both dialects, so a `.b99` file in this project is treated as Extended
BASIC because the project says so.
