# Verification log

Everything below was executed, not inferred. Tool versions: xdt99 3.6.5,
Python 3.12, Node 22, TypeScript strict mode.

## 1. The source-compatibility finding

```
$ xas99.py -R -c snakeC.a99 -o snake.rpk
15 Errors found.                              <- default (extended) syntax

$ xas99.py -R -s -c snakeC.a99 -o snake.rpk
***** Warning: Possible branch/jump optimization
   -> snake.rpk written                       <- strict syntax
```

Hazard lines in `snakeC.a99` (12 total):
159, 161, 163, 165, 241, 292, 347, 356, 498, 656, 658, 710

That set is **exactly** the set of lines xas99 reports an `Error` on in
extended mode — verified by pairing each `<2> NNNN` line in its output with the
severity on the following line. Not a heuristic that happens to agree: the same
twelve lines, no more and no fewer.

> An earlier revision of this file listed 19 lines here, adding 272, 299, 323,
> 362, 437, 449 and 672. Those seven have no comment field at all
> (`LOOP02 MOVB @FALSE,@KEYPRS`) and are not hazards. The figure came from the
> regex heuristic in `detectDialect`, which has since been replaced by the
> field parser — see [reconstruction.md](reconstruction.md).

Cause: a single blank between the operand and a `*` comment. xas99's extended
syntax requires two blanks or a tab, so the blank is read as part of the
expression and `*` becomes a multiplication operator.

## 2. The formatter is semantics-preserving

```
$ node out/lang/formatter.js  (convertEaToXdt99)
$ xas99.py -R snake_ts.a99 -B -a ">6000" -o ts.bin     # NO -s flag
   -> assembles, one harmless optimisation warning

$ cmp orig.bin ts.bin
   -> identical
```

`orig.bin` is the strict-mode build of the untouched source.
Both are 8192 bytes, md5 `6f56e3c61f38bd8a713bd185a958c037`.

The TypeScript port reproduces the JavaScript prototype exactly.

## 3. xas99 output formats, all executed

| Command | Result |
|---|---|
| `xas99.py -R -s src.a99 -o OBJ` | tagged object, 14,640 B |
| `xas99.py -R -s -i src.a99 -o SNAKE` | E/A5 image, 3,972 B |
| `xas99.py -R -s -b -a ">6000" src.a99` | raw binary, 3,966 B, **unpadded** |
| `xas99.py -R -s -B -a ">6000" src.a99` | **8,192 B exactly**, starts `AA 01 01 00` |
| `xas99.py -R -s -c src.a99 -o snake.rpk` | ZIP: `SNAKEC.bin`, `layout.xml`, `meta-inf.xml` |
| `-L file.lst -S` | E/A-style listing plus symbol table (decimal) |
| `-E file.equ` | `ADVTM0 EQU  >622A` ... (hex — use this for the memory map) |

Exit codes: 0 clean, 0 warnings-only, 1 on errors, and **no output file is
written when errors occur**.

## 4. xdm99 disk pipeline, executed

```
$ xdm99.py -X sssd snake.dsk -n SNAKE
$ xdm99.py snake.dsk -a SNAKE  -f PROGRAM
$ xdm99.py snake.dsk -a SNAKEO -f "DIS/FIX 80"
$ xdm99.py snake.dsk
SNAKE     :     81 used  279 free   90 KB  1S/1D 40T  9 S/T
SNAKE        17  PROGRAM       3972 B             2026-07-26 20:24:16 C
SNAKEO       62  DIS/FIX 80   15600 B  183 recs   2026-07-26 20:24:16 C
$ xdm99.py -T SNAKE -o SNAKE.tfi        # TIFILES for Classic99 FIAD
```

## 5. Diagnostics parser

Input: live xas99 stderr with 8 emitted records across two passes.
Output: 5 unique errors + 2 warnings, correct columns.

```
error      3:  7+13  Bad operand count
error      7:  0+4   Duplicate symbol: LOOP
error      2: 15+6   Unknown symbol: NOSUCH
error      4:  7+13  Invalid '@' found in expression
error      5: 13+2   Invalid hex integer literal: GG
warning    9:  7+14  Treating >000A as register, did you intend an @address?
warning  null: 0+0   Unused constants: loop:6   (related: loop @ line 6)
```

xas99 reported `6 Errors found.` because it counts emissions, not unique
diagnostics. Show the deduplicated count.

## 6. TextMate grammar

Tokenised the full 1,487-line source with `vscode-textmate`.

A natural-looking "two or more spaces begins the comment field" rule swallowed
entire instruction lines (line 24: `MAIN   LI   R1,REGLD   * SET BYTE ADDRESS`
became one comment token, because of the three blanks after the label).
Removing that rule:

| Scope | Before | After |
|---|---|---|
| `variable.language.register` | 41 | 313 |
| `keyword.operator.addressing.symbolic` | 55 | 303 |
| `constant.numeric.decimal` | 158 | 414 |

Field-accurate colouring needs semantic tokens from a parser; TextMate handles
the unambiguous majority.

## 7. Dialect detection

Run over `snakeC.a99`:

```
{ dialect: 'ea',
  confidence: 1,
  reason: '12 line(s) separate a comment from the operand by a single blank,
           which only assembles with -s (strict).' }
```

Over `snake-a.a99`, which has no hazards:

```
{ dialect: 'ea',
  confidence: 0.3,
  reason: 'No strong signal; defaulting to the compatible dialect.' }
```

## 8. Starter template

`templates/cartridge/src/main.a99` assembles with **zero warnings**:

```
$ xas99.py -R -c src/main.a99 -o tpl.rpk        -> 1,092 B RPK
$ xas99.py -R -B -a ">6000" src/main.a99        -> 8,192 B, header AA 01 01 00
```

## 9. Compilation

```
$ npx tsc --noEmit        # strict: true
   (no output)
```
