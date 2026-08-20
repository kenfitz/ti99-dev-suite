# {{NAME}}

A TI BASIC project.

TI BASIC lives in the console ROM, so this is the one route that needs no
cartridge file and no memory expansion. If you have Classic99 configured, it
will run.

## Building

`TI-99: Build and Run` from the Command Palette, or right-click
`src/main.b99` and use the **TI-99/4A** menu.

Two targets:

| Target | What you get |
|---|---|
| **Program** | The tokenised program, dropped into DSK1 |
| **Disk** | A disk image holding it, for a real drive or an emulator |

## Running it

TI BASIC has no auto-run, so after the emulator starts:

1. Choose **TI BASIC** from the console menu.
2. `OLD DSK1.{{TINAME}}`
3. `RUN`

## The source

`src/main.b99` is a working program. Edit it and build again.

Diagnostics appear as you would expect: an unknown subprogram, an argument
out of its documented range, a branch to a line that does not exist. If you
use something Extended BASIC has and TI BASIC does not, the message says so
rather than reporting a syntax error.

## Naming

`.b99` is the canonical extension for new TI BASIC source. `.bas` is accepted
and treated as dialect-neutral, so the extension asks which dialect it is
rather than guessing.
