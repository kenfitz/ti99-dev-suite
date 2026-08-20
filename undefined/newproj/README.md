# hello

TMS9900 assembly for the TI-99/4A, built into three distribution routes from
one source.

## Layout

```
src/
  main.a99             the program - THIS IS THE FILE YOU EDIT
  targets/
    cart.a99           cartridge            ->  dist/cart/
    ea.a99             Editor/Assembler     ->  dist/ea/
    disk-xb.a99        Extended BASIC disk  ->  dist/disk-xb/
boot/
  LOAD.b99             the Extended BASIC loader, tokenised onto the disk
```

`src/main.a99` holds the whole program and nothing loader-specific. Each file
in `src/targets/` supplies only the prologue its loader needs and then `COPY`s
the body, so one source ships three ways without three copies to keep in step.

## Building

| Command | Does |
|---|---|
| `TI-99: Build` | builds every route |
| `TI-99: Build Target...` | pick one |
| `TI-99: Build and Run` | build a route and launch it |
| `TI-99: Clean` | remove every build and dist folder |

## The routes

| Target | Your user needs | They get |
|---|---|---|
| `cart` | nothing | `HELLOC.BIN` for Classic99 or FinalGROM 99, `.rpk` for MAME |
| `ea` | Editor/Assembler + 32K | option 3 object, option 5 image |
| `disk-xb` | Extended BASIC + 32K | a disk: `RUN "DSK1.LOAD"` |

Extended BASIC was in far more homes than the Editor/Assembler module, so the
XB disk usually reaches more people. A cartridge reaches everybody.

The extension prints the exact steps for each route when it launches the
emulator, and prints how to write a disk image to real media after any build
that produces one.

## Requirements

Python 3.8+ and [xdt99](https://github.com/endlos99/xdt99). Run
**TI-99: Configure Toolchain** if the extension cannot find them.

Cartridge ROMs are not distributed with the extension. The Editor/Assembler
and Extended BASIC routes need their cartridge images, set in the TI-99
emulator settings.

## Writing assembly here

`src/main.a99` is commented for someone new to the machine, and for an
assistant helping you write it. In short:

- `MAIN` is the entry point, reached the same way by every target.
- The utility routines at the bottom mean the program needs nothing from the
  Editor/Assembler, which is what lets it run from a cartridge.
- Screen position is `row*32+column`, 24 rows of 32 columns, counted from zero.
- On a cartridge the code is in ROM. Anything written at run time belongs in
  scratchpad RAM, `>8320` upwards, or in VDP RAM.
- `LIMI 2` enables interrupts, needed for sound and automatic sprite motion.
