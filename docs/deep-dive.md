# TI-99/4A Development Suite for VS Code — Technical Deep Dive

A companion to your requirements specification. Your spec is strong on *what* the
product does; this document covers *how*, and corrects a handful of assumptions
that turn out to be wrong when you actually run the tools.

Everything in the "verified" sections below was executed against **xdt99 3.6.5**
(current master) and **your `snakeC.a99`**, not inferred from documentation.

---

## 1. Executive summary

**The good news.** There is no VS Code extension for TI-99/4A assembly. The niche
is genuinely empty. The reference implementation to study is the *xdt99 IDEA
plugin* (`ide/idea/` in the xdt99 repo) — a complete JFlex lexer + Grammar-Kit
parser with completion, formatting, folding, find-usages and rename already
solved for this exact language. You should read `Xas99.flex` before writing a
single line of grammar.

**The bad news, and the single most important finding in this document:** your
existing source does not assemble under xas99's default syntax mode. It needs
`-s` (strict). The cause is a whitespace rule, it affects roughly 15 lines, and
it is the strongest possible argument for building the formatter *first* rather
than last.

**The architectural call:** build a language server, not a bag of
`vscode.languages` providers. Your spec defers this decision to "phase 2 if
needed." The evidence below shows the decision is forced by the language itself,
and retrofitting is expensive.

**The thing your spec is missing entirely:** a *pluggable toolchain model*. You
asked to be able to configure your own assembler, linker and emulator. Your spec
hardcodes xas99/xdm99 into the build coordinator and treats "custom emulator" as
a single escape hatch. Section 8 proposes a declarative tool-profile schema that
makes xdt99 just one profile among several, which is what you actually want if
you intend to keep using Asm994a.

---

## 2. Landscape check — corrections to §1 and §7 of your spec

| Your spec says | Reality |
|---|---|
| "xdt99 documentation covers version 3.6.0" | Current release is **3.6.5**. Version-gate on ≥3.6.0 but parse `xas99.py --help` output (`TMS9900-family cross-assembler, v3.6.5`) for the actual number. |
| Editor plugins: Emacs and IntelliJ IDEA | Correct, and the IDEA plugin is far more capable than the spec implies. It ships **two complete grammars** (`xas99` and `xas99r`) because strict and relaxed syntax cannot share a lexer. This has direct consequences for you — see §5.3. |
| MAME / Classic99 / custom emulator | Add **Win994a** (you use it) and **js99er**. Note Win994a is Windows-only with no documented headless interface; see §9.3. |
| "Python 3.8 or later" | Confirmed. xdt99 is pure Python, no compiled deps, no pip install — it is literally a directory of `.py` files. Your Mode B auto-detection should therefore look for `xas99.py` **as a file**, not as an installed console script. |

**Prior art worth reading before you start**

- `xdt99/ide/idea/src/main/java/net/endlos/xdt99/xas99/Xas99.flex` — the
  authoritative tokenizer. Instruction groupings by format (I–IX), directive
  classes, the lexer state machine `YYINITIAL → MNEMONIC → ARGUMENTS → COMMENT`.
- `Xas99FormattingModelBuilder.java` / `Xas99Block.java` — how they solved
  column alignment.
- `Xas99Annotator.java` — semantic error highlighting without running the
  assembler.
- `jedimatt42/9900dis` — a disassembler whose output is designed to round-trip
  through xas99. Useful for a future "import a ROM" feature.

---

## 3. Verified finding: your source needs `-s`, and why that matters

### 3.1 What happens

```
$ xas99.py -R -c snakeC.a99 -o snake.rpk
***** Error: Bad operand count                    (line 292, 347, 356)
***** Error: Unknown symbol: UP                   (line 159)
***** Error: Unknown symbol: DOWN                 (line 161)
***** Error: Invalid register: R1 * GET THE BODY CHAR.   (line 498)
***** Error: Unknown symbol: RESET THE SNAKE SIZE TO THE STARTING SIZE  (line 241)
15 Errors found.

$ xas99.py -R -s -c snakeC.a99 -o snake.rpk      # strict mode
***** Warning: Possible branch/jump optimization  (line 36 — harmless)
   → snake.rpk written successfully
```

### 3.2 Why

xas99's default mode enables its own extensions, and one of them redefines
whitespace:

> Two or more spaces **as well as a tab character** introduce the comment field.

Under TI's Editor/Assembler, a *single* blank ends the operand field. Under
xas99 default, a single blank is legal *inside* an expression. So this line:

```
       MOV  @SSNKSZ,@SNKSIZ * Reset the snake size to the starting size
                            ↑ one space
```

is read by xas99 as `@SNKSIZ * Reset` — a multiplication — and it goes looking
for a symbol named `RESET THE SNAKE SIZE TO THE STARTING SIZE`. The xdt99 manual
calls this out explicitly; it is the same reason TI's own *Tombstone City* source
requires `-s`.

Affected lines in `snakeC.a99`: **159, 161, 163, 165, 201, 241, 292, 347, 356,
498, 656, 658, 710** (line 201 uses a tab, which fails the same way).

### 3.3 Why this is a product requirement, not a footnote

Three things follow.

1. **The project template must record a syntax dialect**, and the default for an
   *imported* project must be strict. Your §30 "Project Import" says nothing
   about this; it is the number-one reason an import will appear broken.

2. **The formatter is a migration tool, not a cosmetic one.** Normalising the
   comment column to ≥2 spaces converts legacy E/A source into source that
   assembles under xas99's default mode, unlocking local labels, macros, `BANK`,
   `SAVE`, and the rest of the extensions. I built and ran this — see §7.4. The
   reformatted file produces a **byte-identical** binary
   (`md5 6f56e3c61f38bd8a713bd185a958c037`).

3. **The formatter must never emit a single space before a comment.** That is a
   correctness invariant, not a style preference. Your §22.12 defaults don't
   express it. Add `minCommentGap: 2` and clamp it.

---

## 4. Verified toolchain reference

Every command below was run and its output inspected. Use these as the seed for
your toolchain adapter's test fixtures.

### 4.1 xas99 output formats

| Goal | Command | Produces |
|---|---|---|
| E/A option 3 object | `xas99.py -R -s src.a99 -o OBJFILE` | tagged object, 14,640 B |
| E/A option 5 image | `xas99.py -R -s -i src.a99 -o SNAKE` | 3,972 B (6-byte header + code); auto-splits at 8 KB into `SNAKE`, `SNAKF`, `SNAKG`… |
| Raw binary | `xas99.py -R -s -b -a ">6000" src.a99 -o snake.bin` | 3,966 B, unpadded |
| **Padded cart binary** | `xas99.py -R -s -B -a ">6000" src.a99 -o SNAKEC.BIN` | **exactly 8,192 B**, starts `AA 01 01 00` |
| MAME RPK | `xas99.py -R -s -c src.a99 -o snake.rpk` | ZIP: `SNAKEC.bin`, `layout.xml`, `meta-inf.xml` |
| Listing | add `-L snake.lst -S` | E/A-style listing + symbol table |
| Symbols as EQUs | add `-E snake.equ` | `ADVTM0 EQU  >622A` … |

Notes that will bite you:

- **`-B` is the one you want for Classic99 carts.** It aligns to `>2000` and pads
  to a multiple of 8 KB. `-b` does not pad, and Classic99 will load a short ROM
  and behave oddly. Add `-M` only if you *want* it minimized.
- **`-c` ignores `-n` when the source already has a GPL header.** Your snake has
  one at `>6000` (`STDHDR BYTE >AA`), so the RPK is named from the *filename*
  (`SNAKEC`), not from `-n "TI SNAKE"`. Your §31 cartridge validation should
  detect an existing header and warn that `-n` will be a no-op.
- **`-S` writes symbol values in decimal** with dot padding (`TMVUP. 25648`).
  For a memory-map view, parse **`-E`** instead — it gives hex.
- The `-i` path honours `SLOAD`/`SFIRST`/`SLAST`. If those symbols are absent it
  emits one image *per `AORG` segment*, which surprises people. Detect and
  surface this in the artifacts view.
- **`COPY` files are found relative to the including file plus `-I` paths plus
  xdt99's own `lib/`.** That third location matters for dependency tracking.

### 4.2 Exit codes and where output goes

```
clean build            → exit 0
6 errors               → exit 1, and NO output file is written
missing source file    → exit 1
warnings only          → exit 0
```

Everything — banner, errors, warnings, summary — goes to **stderr**. `stdout` is
used only for `-o -`. Do not merge the streams; you will corrupt the diagnostic
parse.

Exit code is reliable, but **do not rely on it alone**: verify the expected
artifact exists on disk afterwards (your `TI99_OUTPUT_MISSING` error code is
correct and should be exercised on every build).

### 4.3 xdm99 disk pipeline

```bash
xdm99.py -X sssd snake.dsk -n SNAKE          # create 90 KB SSSD, volume name SNAKE
xdm99.py snake.dsk -a SNAKE  -f PROGRAM      # add E/A5 image
xdm99.py snake.dsk -a SNAKEO -f "DIS/FIX 80" # add E/A3 object
xdm99.py snake.dsk                           # catalog
xdm99.py -T SNAKE -o SNAKE.tfi               # → TIFILES for Classic99 FIAD
```

Catalog output is fixed-width and trivially parseable for your §25.4 disk view:

```
SNAKE     :     81 used  279 free   90 KB  1S/1D 40T  9 S/T
SNAKE        17  PROGRAM       3972 B             2026-07-26 20:24:16 C
SNAKEO       62  DIS/FIX 80   15600 B  183 recs   2026-07-26 20:24:16 C
```

**Gotcha:** the disk image name must come *before* any list-argument option
(`-a`, `-I`, `-D`). xdm99 and xas99 both use Python `argparse` with `nargs='+'`,
so `xdm99.py -a file.obj snake.dsk` silently treats `snake.dsk` as another file
to add. Your toolchain adapter should always emit positional arguments first and
should append `;` terminators when it can't.

---

## 5. Language architecture — the decision your spec defers

### 5.1 Recommendation: language server from day one

Your §22.13 says start with in-process providers and consider a server later.
I'd invert that. Reasons, in order of weight:

1. **The language is field-sensitive and dialect-sensitive.** Correct tokenizing
   requires knowing which of three syntax modes the project uses. That state
   belongs in one place with a document cache, not scattered across six provider
   callbacks.
2. **`COPY` creates a cross-file symbol graph.** Hover, go-to-definition and
   completion all need the transitive closure of includes, and `-I` paths come
   from project config. A server owns this naturally.
3. **Retrofitting is a rewrite.** Every provider you write against
   `vscode.languages` gets thrown away, plus you inherit an extension-host
   blocking problem the first time someone opens a 5,000-line file.
4. **Reuse.** A server built on `vscode-languageserver` runs unmodified in
   Neovim, Emacs (eglot), Helix and Zed. For a community this small, that
   materially expands your user base for almost no extra work.

Cost: roughly two extra days of scaffolding. Take the hit.

### 5.2 Evidence that TextMate alone is insufficient

I wrote a TextMate grammar (shipped as `tms9900.tmLanguage.json`) and ran it
through `vscode-textmate` against your 1,487-line source.

First attempt included the natural-looking rule "two or more spaces begins the
comment field." Result on your line 24:

```
MAIN   LI   R1,REGLD   * SET BYTE ADDRESS
MAIN                       → entity.name.function.label
"   LI   R1,REGLD   * ..."  → comment.line.field      ← the entire instruction
```

The three spaces after the label `MAIN` matched the comment rule. Line 159 broke
the same way (`BYTE  0,3,0,…` — two spaces after `BYTE`). Register hits across
the file: **41**.

Removing that rule and keeping only anchored `*`- and `;`-comments:

| Scope | Before | After |
|---|---|---|
| `variable.language.register` | 41 | **313** |
| `keyword.operator.addressing.symbolic` (`@`) | 55 | **303** |
| `constant.numeric.decimal` | 158 | **414** |

**Conclusion.** A regex grammar can colour the unambiguous 90% — mnemonics,
directives, registers, `>hex`, `:binary`, `'text'`, `"filename"`, `@`/`*`/`+`
operators, and comments that begin with `*` or `;`. It cannot determine *field
boundaries*, because that requires knowing where the operand ended, which
requires a parser.

### 5.3 The hybrid: TextMate + semantic tokens

```
TextMate grammar   → instant colouring, works before the server starts,
                     works in untrusted workspaces, ~90% correct

Semantic tokens    → field-accurate overlay from the server:
  (LSP)              · comment field regardless of leading character
                     · label vs. EQU-constant vs. macro
                     · DEF-exported / REF-imported symbols
                     · unresolved symbol (theme it as an error hint)
                     · register-alias symbols created by REQU
```

VS Code merges these automatically; semantic tokens win where present. This is
the same layering the Rust and C++ extensions use.

Suggested token types / modifiers:

```
tokenTypes:     label, constant, macro, register, instruction,
                directive, address, comment
tokenModifiers: exported (DEF), imported (REF), unresolved,
                relocatable, extension (xdt99-only feature)
```

The `extension` modifier is worth the effort: it lets you dim or flag anything
that won't assemble under strict mode, which is exactly the feedback someone
porting Asm994a sources needs.

### 5.4 Three dialects, not one

| Dialect | Flag | Comment starts at | Whitespace in operands |
|---|---|---|---|
| E/A strict | `-s` | first blank after operand | not allowed |
| xas99 default | *(none)* | 2+ blanks or a tab | single blanks allowed |
| xas99 relaxed | `-r` | `;` only | anywhere |

Model this as a per-project setting that flows into: the tokenizer, the
formatter's *input* parser, the formatter's *output* rules, and the assembler
command line. Do not let them drift apart — a formatter configured for one
dialect operating on a file assembled in another will silently corrupt code.

The IDEA plugin ships two entire grammars for this (`xas99` and `xas99r`). In an
LSP you can parameterise a single hand-written tokenizer, which is why I'd
hand-write the lexer rather than generate one.

---

## 6. Symbol index and IntelliSense data model

```ts
interface SymbolDef {
  name: string;
  kind: 'label' | 'constant' | 'macro' | 'registerAlias' | 'external';
  uri: string;
  range: Range;
  value?: number;            // resolved after a build, from the -E file
  relocatable?: boolean;
  exported: boolean;         // DEF
  imported: boolean;         // REF
  comment?: string;          // trailing comment on the defining line → hover doc
  references: Location[];
}
```

Three practical points.

**Harvest hover docs from trailing comments.** Your source is full of
`SUBWS  EQU >8300        * MY OWN WORKSPACE.` — that comment is documentation.
Attach it to the symbol and show it on hover. It costs nothing and makes the
feature feel finished. This is the single highest-value-per-line-of-code feature
in the whole language server.

**Two-tier resolution.** Parse-time gives you names, kinds and locations
immediately. Build-time gives you *values* — parse the `-E` EQU file after every
successful build and merge addresses into the index. Hover then reads
`SNKSIZ — constant, >8346, defined snakeC.a99:96, 14 references`.

**Include graph.** Build a `COPY` dependency DAG per project. You need it for
(a) cross-file completion, (b) invalidating the index when an include changes,
(c) incremental rebuild decisions, and (d) the "unused include" hint. Resolve
TI-style paths (`DSK1.SOUND`) by trying `SOUND`, `SOUND.A99`, `SOUND.ASM`,
`SOUND.S` and lower-case variants, in the including file's directory, then `-I`
paths, then xdt99's `lib/`.

**Ship a symbol library for the E/A environment.** `VSBW`, `VMBW`, `VSBR`,
`VMBR`, `VWTR`, `KSCAN`, `GPLLNK`, `XMLLNK`, `DSRLNK`, `NUMREF`, `STRREF`,
`NUMASG`, `STRASG` plus the scratchpad addresses on the cheat sheet you attached
(`>8800` VDPRD, `>8C00` VDPWD, `>8C02` VDPWA, `>83C0` RAND16, `>837A` sprite
motion, …). Register these as builtin externals so `REF VMBW` resolves, hovers
with documentation, and doesn't produce a spurious "unresolved" squiggle.

---

## 7. The formatter

This is the feature you asked about first and it's the one with the most hidden
depth. A working prototype ships as `formatter.js`; it has been run against your
full source.

### 7.1 Column model

Your spec proposes `label 1 / opcode 8 / operand 16 / comment 40`. Your actual
code uses `1 / 8 / 13`, measured across 812 instruction lines:

```
opcode column:  col 8  → 812 lines,  col 9 → 2 lines
operand column: col 13 → 662 lines,  col 12 → 49, col 14 → 80
```

That's the TI convention and it's what the E/A listing format assumes. Change the
defaults to **1 / 8 / 13 / 31**. Labels are 6 characters in strict mode, so an
operand at column 16 wastes half a screen on a 40-column-minded language.

Also add a `preserveExisting` mode for people whose sources are already aligned
differently — the formatter should be adoptable file-by-file.

### 7.2 The hard part is splitting, not padding

Padding is trivial. Deciding where the operand ends is the whole problem, and it
depends on the dialect *of the input*:

```js
if (c === ' ') {
  if (dialect === 'ea' || line[i+1] === ' ') { comment starts here; break; }
}
```

with literal-awareness so `TEXT '* Congratulations! *'` and
`COPY "C:\TI Stuff\Sound.asm"` survive. Your line 1301 is exactly this case and
the prototype handles it.

### 7.3 Instructions with no operand

`RT`, `NOP`, `RTWP`, `EVEN`, `END`, `IDLE`, `CKON`, `CKOF`, `LREX`, `RSET`,
`RET`. Everything after the mnemonic is comment. Miss this and you'll reformat
`RT   * return to caller` into something that looks like it has an operand.

### 7.4 Verified result

Running the prototype over `snakeC.a99` with `inputDialect: 'ea'`:

```
before:  MOV  @SSNKSZ,@SNKSIZ * Reset the snake size to the starting size
after:   MOV  @SSNKSZ,@SNKSIZ   * Reset the snake size to the starting size
```

```
$ xas99.py -R -c snake_formatted.a99      # DEFAULT mode, no -s
***** Warning: Possible branch/jump optimization
   → fmt.rpk written

$ cmp orig.bin fmtd.bin
   → identical
```

The formatter migrated a legacy E/A source into xas99 extended syntax with zero
semantic change. Make this an explicit command: **`TI-99: Convert Source to
xas99 Syntax`**, with a diff preview. It is a genuinely compelling reason to
install the extension.

### 7.5 Safety rules

- Never touch a line whose first character is `*` or `;`.
- Never alter text inside `'…'` or `"…"`.
- Never change symbol case (only mnemonics/registers, and only if configured).
- Never reduce the comment gap below 2 spaces.
- Preserve the file's existing EOL convention (your file is mixed — 229 lines
  contain tabs).
- Offer `formatOnSave` off by default. Retro programmers are territorial about
  their formatting and you only get one chance to make a bad first impression.

---

## 8. Pluggable toolchain — the missing piece

Your requirement "configure your own assembler/linker and emulator" deserves a
first-class model rather than a `customEmulatorPath` setting. Treat xdt99 as a
*profile*, not as the architecture.

### 8.1 Tool profile schema

```jsonc
{
  "id": "xdt99",
  "displayName": "xdt99 (xas99 / xdm99)",
  "capabilities": ["assemble", "link", "listing", "symbols",
                   "cart-rpk", "cart-bin", "ea3-object", "ea5-image",
                   "disk-image", "tifiles"],
  "detect": {
    "files": ["xas99.py"],
    "searchPaths": ["${config:ti99.toolchain.path}", "${env:PATH}",
                    "${env:XDT99_HOME}", "${workspaceFolder}/tools/xdt99"],
    "versionCommand": ["${python}", "${tool}/xas99.py", "--help"],
    "versionPattern": "cross-assembler,\\s+v([0-9.]+)"
  },
  "commands": {
    "assemble": {
      "program": "${python}",
      "args": ["${tool}/xas99.py", "${dialectFlag}", "${registerFlag}",
               "${sources}", "-o", "${output}",
               "-L", "${listing}", "-S", "-E", "${symbols}",
               "-I", "${includePaths}", ";", "--color", "off"],
      "cwd": "${projectRoot}",
      "problemMatcher": "xas99",
      "successRequiresArtifact": "${output}"
    },
    "cart-bin": {
      "program": "${python}",
      "args": ["${tool}/xas99.py", "-B", "-a", "${cartBase}",
               "${sources}", "-o", "${output}"]
    }
  },
  "variables": {
    "dialectFlag":  { "ea": "-s", "xdt99": "", "relaxed": "-r" },
    "registerFlag": { "true": "-R", "false": "" },
    "cartBase": ">6000"
  }
}
```

Three details that make this work rather than merely look tidy:

- **`capabilities` drives the UI.** Project types offer only the output formats
  the selected toolchain declares. If someone plugs in an assembler that can't
  make RPKs, the cartridge template greys out rather than failing at build time.
- **`successRequiresArtifact`** encodes the "exit code isn't enough" rule from
  §4.2 declaratively.
- **`problemMatcher` is a named, registered parser**, not a regex in the JSON.
  Regex-only matchers cannot express xas99's two-line records with cross-pass
  deduplication. Ship `xas99` as a built-in matcher; allow user-defined regex
  matchers for simple tools.

### 8.2 Asm994a — manage expectations

Asm994a is the assembler bundled with Win994a. It is a Windows GUI application.
Before promising integration, verify from a terminal whether it accepts a source
path and options as arguments and whether it returns a meaningful exit code and
machine-readable errors. If it only drives from its own window, the honest
integration is:

- a **"Launch Asm994a"** command that opens it with the file, and
- a **"Watch output directory"** mode that picks up artifacts when they appear
  and runs the packaging/emulator steps.

That's still useful. Pretending it's a headless toolchain is not.

My recommendation: **make xas99 the default, keep Asm994a as a launch target.**
Your source already assembles under xas99 with `-s`, and xas99 gives you machine-
readable diagnostics, listings, symbol tables, RPK output and disk images from
one cross-platform tool. That is the whole extension's value proposition.

### 8.3 Other toolchains worth a profile stub

`Ralph Benzinger's xas99` is the same thing. Others in circulation: **A99/L99**
(Fred Kaal — tagged-object assembler + linker), **XA99**, **TIasm** (V9T9),
**asm990 / lnk990** (Dave Pitts), and **gcc-9900** if anyone wants C. Ship
xdt99 + a generic template and let the community contribute the rest.

---

## 9. Emulator profiles — verified details

### 9.1 Classic99 — the undocumented flag

The Classic99 manual documents no command line. It has one. From the author
(tursilion, classic99 issue #3):

```
classic99.exe -rom "path\to\rom.bin"
```

ROM identification follows the same rules as `Cartridge → User → Open`:
`xxxxxC.BIN` for plain ROM, `xxxxxD.BIN` for the second bank, `xxxxxG.BIN` for
GROM, `xxxxx8.BIN` for non-inverted 378 banking, `xxxxx3.BIN` for inverted 379 /
SuperSpace. Selecting one file loads the whole set.

So for your snake:

```bash
xas99.py -R -s -B -a ">6000" snakeC.a99 -o SNAKEC.BIN   # exactly 8192 bytes
classic99.exe -rom "C:\proj\dist\SNAKEC.BIN"
```

That's a one-keystroke build-and-run, verified end to end here except for the
final launch.

For **disk** projects, Classic99's native format is FIAD, and it cannot write to
`.dsk` images. The right integration is to point a `DSKn` folder at your build
output directory and emit TIFILES there:

```bash
xdm99.py -T build/SNAKE -o "C:\classic99\DSK1\SNAKE"
classic99.exe        # then E/A → 5 → DSK1.SNAKE
```

Add a `classic99.dskFolders` setting mapping DSK1–DSK9 to host paths so the
extension can drop artifacts straight into the emulator's search path. Also
consider generating a `[UserCart*]` block for `Classic99.ini` as an export
option (the format is documented in §10.2 of the Classic99 manual and is
straightforward).

Detail worth knowing: Classic99's `AutomapDSK1` option rewrites the literal
string `DSK1` in loaded records to whatever drive is actually in use — helpful
when your build lands in DSK2 or DSK3.

### 9.2 MAME — from the xdt99 manual, verified syntax

```bash
mame ti99_4a \
  -ioport peb -ioport:peb:slot2 32kmem \
  -ioport:peb:slot8 hfdc -ioport:peb:slot8:hfdc:f1 525dd \
  -cart EA.rpk -flop1 work.dsk
```

Template variables you need: `${systemDriver}` (`ti99_4a`, `ti99_4ae` for PAL,
`ti99_4` , `ti99_8`), `${cart}`, `${flop1..4}`, plus a raw `${extraArgs}` string.
Expose the PEB slot configuration as a checkbox set (32K RAM, disk controller,
speech, RS232) rather than making people memorise `-ioport:peb:slot8:hfdc:f1`.

MAME is the right default for **cartridge** targets: it takes RPK directly, it's
cross-platform, and it has a real debugger.

### 9.3 Win994a

Windows-only; won't run acceptably under Wine per Ninerpedia. The documented
workflow for getting PC files in is the **Win994a Disk Manager** GUI
(import/export text, FIAD and BASIC source). Treat it as launch-only unless you
can confirm CLI arguments on your installation.

### 9.4 js99er

Browser-based, so it can't be launched as a process — but it *can* be opened
with a URL. Worth a profile type `"browser"` that opens
`vscode.env.openExternal(uri)`. Cheap to add, and it's the only "run" path that
would work in a future web build of the extension.

### 9.5 Profile model

```jsonc
{
  "id": "classic99-cart",
  "type": "process",           // process | browser | fiad-drop
  "executable": "${config:ti99.emulator.classic99Path}",
  "args": ["-rom", "${artifact:cart-bin}"],
  "accepts": ["cart-bin"],
  "preLaunch": [
    { "action": "copy", "from": "${artifact:ea5-image}",
      "to": "${config:ti99.classic99.dsk1}" }
  ],
  "singleInstance": true,      // reuse or kill-and-restart
  "detached": true             // don't block the extension host
}
```

`accepts` lets the Run command filter emulators by the current build output, so
"Build and Run" never offers a combination that can't work.

---

## 10. Build graph and incrementality

Your spec's §33 performance requirements imply incremental builds but §15
describes a monolithic pipeline. Model the build as a DAG:

```
sources + COPY includes  ──xas99──▶  .obj / .img / .bin / .rpk
                                          │
                          ┌───────────────┼──────────────┐
                          ▼               ▼              ▼
                    xdm99 -X dsk    xdm99 -T tfi    copy to FIAD dir
                          │
                          ▼
                     emulator launch
```

Rules:

- Hash inputs (source mtimes + resolved include closure + the full argv). Skip a
  node only when the hash matches *and* the artifact still exists.
- `argv` must be part of the hash: changing `-R` or the dialect flag changes
  output without touching a source file.
- Always re-run the artifact-existence check even on a cache hit.
- **Clean must never delete outside the configured build/dist directories** —
  make this a hard-coded guard, not a config option. A retro project directory
  often contains irreplaceable hand-typed source.

---

## 11. Diagnostics parser — exact specification

Shipped as `diagnostics.js`, tested against real output.

### 11.1 Wire format

```
> errs.a99 <2> 0002 - START  LI   R1,NOSUCH
***** Error: Unknown symbol: NOSUCH
```

```
HEADER  /^>\s+(\S+)\s+<([0-9L]+)>\s+(\d+|\*+)\s+-\s?(.*)$/
BODY    /^\*{5}\s+(Error|Warning):\s+(.*)$/
SUMMARY /^(\d+)\s+Errors?\s+found\.$/
BANNER  /^:\s+x[a-z]{2}99,\s+version/
```

- pass is `1`, `2`, or `L` (link/global)
- file may be `---`, line may be `****` → project-scoped diagnostic
- **the same diagnostic is emitted once per pass** — dedupe on
  `file|line|severity|message`. In my test, 8 emitted records collapsed to 6
  unique diagnostics while `N Errors found.` reported 6 *emissions*. Report your
  deduped count in the UI, not xas99's.

### 11.2 Column ranges

xas99 gives you a line, not a column. Recover the span by searching the echoed
source text for the token named in the message:

```
Unknown symbol: NOSUCH      → col 15, len 6
Duplicate symbol: LOOP      → col 0,  len 4
Invalid register: R1        → col …,  len 2
Bad operand count           → whole statement
```

Underlining the token instead of the line is a large perceived-quality
difference for a small amount of code.

### 11.3 Structured warnings

```
Unused constants: loop:6           → related location, line 6
Unresolved references: VSBW, VMBW  → project-scoped
```

`Unresolved references` is the one that needs your §24.5 policy setting. For E/A
option-3 projects it is *expected* (the cartridge supplies those routines) and
must default to `information` or `ignore`. For cartridge and E/A option-5
projects it is usually a real bug and should default to `warning`. Make the
default **depend on project type**, not a single global setting.

### 11.4 Static diagnostics (no assembler run)

Fast checks the server can do on every keystroke:

- unknown mnemonic (with did-you-mean over the instruction table)
- wrong operand count for the instruction format
- register operand where an address was likely meant, and vice versa — mirror
  xas99's own `Treating >000A as register` warning
- byte instruction (`MOVB`, `AB`, `CB`, `SB`, `SOCB`, `SZCB`) with a symbol that
  resolves to an even word address — a classic TI bug
- odd address in `AORG`/`DATA` context without `EVEN`
- **jump out of range**: `Jxx` is a ±128-word relative displacement; flag targets
  beyond it before the assembler does
- duplicate label in the same file
- **`*` comment preceded by exactly one space when dialect ≠ strict** — the §3
  bug, with a quick fix that inserts a space

That last one is worth building early. It's the diagnostic that would have saved
you the 15 errors, and the quick-fix is a one-character edit.

---

## 12. Revised phase plan

Your §38 has nine phases. I'd resequence around the finding in §3 — pull the
formatter forward and merge the language work, because the compatibility problem
is what a new user hits in the first ten minutes.

| Phase | Content | Est. |
|---|---|---|
| **0** | Toolchain detection, version probe, status bar, workspace trust, output channel | 1 wk |
| **1** | TextMate grammar, language config, snippets, file associations | 1 wk |
| **2** | **Formatter + dialect model + "Convert to xas99 syntax" command** | 1–2 wk |
| **3** | Build pipeline (assemble → artifact verify), diagnostics parser, Problems panel, task provider | 2 wk |
| **4** | Packaging: RPK, padded BIN, EA5, EA3, disk image via xdm99 | 1–2 wk |
| **5** | Emulator profiles: MAME, Classic99 `-rom`, FIAD drop, custom, browser | 1 wk |
| **6** | Language server: symbol index, COPY graph, hover, definition, references, completion, outline, semantic tokens | 3–4 wk |
| **7** | Sidebar, artifacts view, disk catalog, listing viewer, memory map from `-E` | 2 wk |
| **8** | Project templates + import wizard (with dialect detection) | 1 wk |
| **9** | Pluggable tool profiles, hardware export (FinalGROM/FlashROM/HFE/CF7+) | 2 wk |

Phases 0–5 is a genuinely useful v0.1 you'd use daily. Phase 6 is what makes it
feel like a real IDE.

**Ship phase 2 early even if nothing else is ready.** A standalone "format and
convert TI assembly" extension is independently valuable and gets you users and
feedback while the rest is built.

---

## 13. Risks and gotchas

**Dialect drift.** The formatter, tokenizer and assembler flags must agree.
Derive all three from one project setting. Consider refusing to format when the
project dialect is unset.

**Windows path quoting.** `COPY "C:\TI Stuff\ASM\Sound.asm"` — spaces are common
in TI paths. Use `child_process.spawn` with an argv array, never a shell string.
Never `shell: true`.

**Argparse list options.** Covered in §4.3. Positionals first; append `;` after
`-I`/`-D`/`-a` lists.

**Case insensitivity.** xas99 is case-insensitive for symbols and mnemonics but
*not* for text literals. Your symbol index must fold case for lookup while
preserving the original spelling for display and rename.

**Labels starting with `!`.** xdt99 local labels (`!`, `!!`, `!foo`) are scoped
between named labels. Handle them in the index or go-to-definition will jump to
the wrong one.

**Banked cartridges.** Once you support `BANK`, `XORG` and `-X` cross-bank
checks, the memory-map view needs a bank dimension. Design the artifact model for
it now even if the UI comes later.

**GPL header collision.** `-c` overwrites `>6000`–`>602F`. Warn if user code
lands there. Your snake starts its header at `>6000` deliberately, so `-c`
correctly leaves it alone — but a beginner writing `AORG >6000` followed by code
will get silently clobbered bytes.

**Licensing.** xdt99 is GPLv3. Invoking it as a separate process is fine and
your spec's Mode A is the right default. Do not bundle it in the VSIX without a
proper review — your §44 already says this and it's correct.

**ROM copyright.** Never ship or auto-download E/A, XB or console ROMs. Detect
their absence and link to instructions instead.

---

## 14. Concrete deltas to your requirements document

| § | Change |
|---|---|
| 1 | xdt99 version 3.6.0 → **3.6.5**; detect at runtime |
| 7.2 | Add Win994a and js99er to optional emulators |
| 12.3 | Add `syntaxDialect: "ea" \| "xdt99" \| "relaxed"` as a **required** field |
| 12.3 | Add `toolchainProfile: string` referencing a tool profile (§8) |
| 18.4 | Specify `-B` (padded, `>2000`-aligned) for cartridge binaries, not `-b` |
| 20.6 | Classic99 launch is `classic99.exe -rom <path>`; add `dskFolders` mapping |
| 22.12 | Defaults → `opcodeColumn 8, operandColumn 13, commentColumn 31`; add `minCommentGap: 2` (clamped) and `inputDialect` |
| 22.13 | Reverse the recommendation: LSP first |
| 24.5 | `unresolvedReferencePolicy` default should vary by project type |
| 29.1 | Parse `-E` output (hex) for the memory map, not `-S` (decimal) |
| 30.2 | Import must detect dialect and default to strict; offer the conversion command |
| 31 | Detect an existing GPL header and warn that `-n` becomes a no-op |
| 38 | Resequence — formatter to phase 2 (see §12) |
| new | §8 pluggable toolchain profiles |
| new | Static-diagnostic catalogue (§11.4) |

---

## 15. Shipped alongside this document

| File | Status |
|---|---|
| `formatter.js` | Working prototype. Field splitter with dialect support, literal-aware, no-operand instruction table. Run against your full source; output assembles under default mode and produces a byte-identical binary. |
| `diagnostics.js` | Working prototype. Two-line record parser, cross-pass dedup, token column recovery, related-location extraction. Tested against real xas99 error output. |
| `tms9900.tmLanguage.json` | Working grammar. Validated with `vscode-textmate` against 1,487 lines; instruction set grouped by format, xdt99 directives scoped separately from E/A directives so they can be themed or linted. |

Port `formatter.js` and `diagnostics.js` to TypeScript as-is — the logic is the
hard part and it's tested. The grammar drops into `syntaxes/` unchanged.

---

## 16. First thing to do

Before writing extension code, run this once and keep the output:

```bash
xas99.py -R -s -c snakeC.a99 -o snake.rpk -L snake.lst -S -E snake.equ
xas99.py -R -s -B -a ">6000" snakeC.a99 -o SNAKEC.BIN
classic99.exe -rom SNAKEC.BIN
```

If snake runs, you have a verified reference pipeline and a regression fixture
for every build path in the extension. Everything else is UI over that.
