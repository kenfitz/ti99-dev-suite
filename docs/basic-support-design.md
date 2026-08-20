# TI BASIC and TI Extended BASIC support — research and architecture

Status: **research complete, nothing implemented.** This document is the first
deliverable. Existing assembly behaviour is unchanged.

Everything marked *verified* was established by running the tools on this
machine or by reading their source. Everything marked *unverified* needs an
experiment before it is designed against.

---

## 1. Findings that change the requirements

Listed first because they change the design.

### 1.1 Two native program formats, not one — verified

From `xbas99.py`, `BasicProgram.get_image()`:

| | Standard | Long |
|---|---|---|
| Ends at | `>37D8` | `>FFE8` |
| Lives in | VDP RAM | 32K expansion, high memory |
| Header | 8 bytes: checksum, token-table end, line-table start, top | 10 bytes: `>ABCD` then those four words reordered |
| Stored as | `PROGRAM` | `INT/VAR 254` |
| Needs 32K | no | **yes** |

The suspicion in requirement 21 is correct: `--embed-xb` emits a *long-format*
program; a normal tokenized program is *standard* format. Different header,
different memory target, different file type. Not interchangeable.

### 1.2 Long format corrupts small programs — verified

`get_image()` pads any long-format program under 254 bytes with a fake line
32767, and it is not invisible:

    $ xbas99.py -c -L tiny.bas ; xbas99.py -p tiny.prg
    100 PRINT "HI"
    110 END
    32767 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!! ...

A user typing LIST on real hardware sees that. The build must never force long
format for a small program. Same source: 26 bytes standard, 279 bytes long.

### 1.3 Label mode and round-trip editing are mutually exclusive — verified

Requirements 14 and 23 cannot both hold for one file as things stand:

- xbas99 numbers labelled lines like `RESEQUENCE 100,10` and substitutes.
  Labels are not stored in the tokenized program.
- `-l` is rejected together with `-d`. There is no tokenized-to-labelled path.

A labelled source that is built, edited on the TI, saved and imported comes
back as line numbers. Options, in preference order:

1. **Sidecar map.** The build records line-to-label beside the artifact; import
   re-applies it and reports labels it could not place because the line moved.
   Round trip survives for unmoved lines, which is most of them.
2. **Label mode is build-only.** Import produces line-numbered source into a
   new file. Honest and simple.
3. Reconstruct labels heuristically. Rejected: it invents names.

Recommend 1, falling back to 2 when the map is missing or stale.

### 1.4 Renumbering should not be a text transformation — verified

Requirement 13 warns against rewriting numerals that merely look like line
numbers. The token stream removes the ambiguity: a line reference is stored
under `LINO_VAL` (`>C9`), and the tokenizer already knows which operand
positions are references, from the follow classes `LINO`, `LORS`, `RUNS`,
`GO_PRFX`.

Safe pipeline: **tokenize, renumber in token space, detokenize.** The telling
case is `RUN`, which accepts a line number, a string, or a numeric variable —
so `RUN "DSK1.X"` must not be touched. A text pass gets that wrong; the token
stream gets it right for free.

### 1.5 File extensions: `.b99` is xdt99's; `.tib`, `.xb`, `.xbas` are not — verified

`xbas99.py` emits `.b99` for decoded source and `.prg` for tokenized programs.
The examples and manual use `.bas` for listings, and both historical programs
in this collection are `.bas`. No evidence was found for `.tib`, `.xb` or
`.xbas` as historical conventions; they appear to be modern inventions.

- `.b99` — primary, matches xdt99, mirrors `.a99`
- `.bas` — accepted, dialect ambiguous, resolved from `ti99.json`
- `.prg` — tokenized, opened through the detokenizer, never as text

### 1.6 xbas99 performs no syntax checking — verified

Its manual's own example, `10 CALL PRINT A="X" / INPUT 1,2,3`, tokenizes and
loads perfectly and fails only at RUN. Requirement 3 is therefore not merely
preferable but necessary: the parser is ours, xbas99 is an encoder.

### 1.7 One token table serves both dialects — verified

`Tokens.tokenlist` is a single 128-entry table, and the manual states that
xbas99 does not distinguish the dialects. Dialect membership must come from TI
documentation into our metadata; it cannot be inferred from the tokenizer.

### 1.8 Protection is a negated checksum — verified

`if self.protected: checksum = -checksum % 0x10000`. A flag, trivially
detectable and reversible. Surface it as metadata, support producing it, and
say plainly that it is not security.

### 1.9 Auto-run LOAD — one experiment outstanding

Verified: an `INT/VAR 254` long-format program named LOAD does **not** auto-run;
`RUN "DSK1.LOAD"` is required. That is the current XB assembly disk.

Unverified: whether a *standard-format* `PROGRAM` named LOAD auto-runs at
startup. This is the one experiment that must precede designing requirement 21.

### 1.10 Other verified constraints

- 254 bytes maximum per tokenized line; a long source line is a build error and
  should be a diagnostic first.
- MERGE format is `DIS/VAR 163`: line number, tokens, zero, terminated `>FFFF`.
- Round-trip fidelity is otherwise exact. `nim.bas` tokenized and detokenized is
  byte-identical apart from line endings, since xbas99 writes CRLF on Windows.
- `GO TO` as two words tokenizes and round-trips correctly, despite a note in
  xdt99's own test data suggesting otherwise.

---

## 2. Language inventories and dialect differences

The token table gives the encodable vocabulary. Dialect membership must be
sourced from the TI manuals; entries marked "confirm" need a documentation pass
before they are relied on.

Statement and function tokens present in the table:

    ELSE :: ! IF GO GOTO GOSUB RETURN DEF DIM END FOR LET BREAK UNBREAK
    TRACE UNTRACE INPUT DATA RESTORE RANDOMIZE NEXT READ STOP DELETE REM
    ON PRINT CALL OPTION OPEN CLOSE SUB DISPLAY IMAGE ACCEPT ERROR WARNING
    SUBEXIT SUBEND RUN LINPUT THEN TO STEP
    OR AND XOR NOT EOF ABS ATN COS EXP INT LOG SGN SIN SQR TAN LEN CHR$
    RND SEG$ POS VAL STR$ ASC PI REC MAX MIN RPT$
    NUMERIC DIGIT UALPHA SIZE ALL USING BEEP ERASE AT BASE VARIABLE
    RELATIVE INTERNAL SEQUENTIAL OUTPUT UPDATE APPEND FIXED PERMANENT
    TAB # VALIDATE

Extended BASIC only (confirm):

    :: ! ELSE on IF, LINPUT, SUB SUBEND SUBEXIT, user CALL
    DISPLAY AT, ACCEPT AT, IMAGE, USING, VALIDATE, BEEP, ERASE, SIZE
    ON ERROR, ERROR, WARNING, RUN, DELETE, MAX, MIN, RPT$, PI
    sprites: SPRITE MOTION LOCATE POSITION PATTERN MAGNIFY
             COINC DISTANCE DELSPRITE
    assembly integration: INIT LOAD LINK PEEK

TI BASIC only, or behaviourally different (confirm):

    CALL limited to CLEAR SCREEN COLOR CHAR HCHAR VCHAR GCHAR KEY JOYST SOUND
    no statement separator; one statement per line except IF THEN ELSE
    no subprograms, no ON ERROR, no sprites

This table is the single source of truth for requirement 8's metadata and drives
validation, completion, hover and signature help alike.

---

## 3. Parser architecture

    text
     -> Lexer       dialect-independent tokens, positions preserved
     -> Parser      recursive descent, dialect-parameterised
     -> AST         lossless enough to re-emit unchanged
     -> Binder      line table, labels, SUB scopes, variables
     -> Diagnostics syntactic, then dialect, then semantic

One lexer and one parser serve both dialects. The dialect is a parameter, not a
fork: it selects a keyword set and enables or rejects constructs. Two parsers
would drift apart.

### 3.1 Lexing is context-sensitive, and that is the hard part

The tokenizer's follow classes exist because the meaning of text after a keyword
depends on that keyword:

| Class | After | Lexed as |
|---|---|---|
| `DATA_STR` | DATA | operand list, commas significant, quoting optional |
| `IMAGE_STR` | IMAGE | format string, quoted or not, to end of line |
| `COMMENT` | REM, ! | raw text to end of line |
| `QSTR` / `USTR` | strings, CALL names | quoted or unquoted run |
| `LINO` | GOTO GOSUB RESTORE THEN ELSE | line reference |
| `RUNS` | RUN | line number, string, or numeric variable |

The lexer must be parser-driven or mode-based. This is the concrete reason
regular expressions cannot carry the language, and it is worth mirroring
xbas99's classification exactly so that anything we accept is something it can
encode.

### 3.2 AST

The node list in requirement 5 is close to complete. Additions the languages
actually require:

    ImageFormat, PrintSeparator (comma, semicolon, colon), PrintTab,
    FileNumber, RelativeRecord, OnErrorStatement, LinputStatement,
    OptionBaseStatement, RandomizeStatement, BreakStatement,
    UnbreakStatement, TraceStatement, UntraceStatement, DeleteStatement,
    StatementSeparator, LabelDefinition, LabelReference

Every node carries an exact source range, and the tree must re-emit the original
text unchanged when no edit is requested. Formatting and renumbering are unsafe
otherwise.

### 3.3 Symbols and control flow

- **Line table** — number to line, and every reference with its range. Drives
  go-to-definition, find-references, missing-target diagnostics, renumbering.
- **Label table** — label to line, definitions and references.
- **SUB table** — name, parameters, body range, locals, call sites. XB only.

Variables are modelled per scope: the main program, and one per SUB. Numeric and
string are distinguished by the `$` suffix, arrays by DIM and subscripting. TI
BASIC has no scoping, so it has one table.

---

## 4. Diagnostics

Three tiers, separately toggleable:

1. **Syntactic** — errors. The parser could not accept the text.
2. **Dialect** — errors. The construct does not exist in the selected dialect,
   for example `CALL SPRITE` or `::` in TI BASIC.
3. **Semantic** — warnings, only where certainty is high: missing branch target,
   duplicate line number, unpaired FOR/NEXT, SUB without SUBEND, line over 254
   tokenized bytes, wrong argument count for a documented built-in.

Requirement 37's caution becomes a rule: no diagnostic that cannot be
established statically. Specifically excluded are "variable never assigned"
across DATA and READ, anything depending on run-time RESTORE, and any device
name validation, since third-party DSRs add devices.

---

## 5. Build pipelines

Both dialects share a shape, close enough to the assembly model to reuse the
capability system rather than parallel it.

    source (.b99 or .bas)
      -> our parser, rejecting on error so xbas99 never sees invalid input
      -> xbas99 -c, optionally -l, --protect, -L
      -> tokenized PROGRAM, standard or long
      -> xdm99: TIFILES for a FIAD drop, or -a onto a .dsk
      -> Classic99 or MAME

New capabilities, following the existing naming:

| Capability | Tool | Produces |
|---|---|---|
| `basic-tokenize` | `xbas99 -c` | native PROGRAM, standard format |
| `basic-tokenize-long` | `xbas99 -c -L` | long format, INT/VAR 254 |
| `basic-merge` | `xbas99 -c --merge` | DIS/VAR 163 merge file |
| `basic-listing` | `xbas99 -d` | text listing, for export |

`basic-program` and `basic-tifiles` already exist and keep their meaning.

New emulator profiles: `classic99-tibasic`, console TI BASIC with no cartridge,
and `classic99-xb-basic`, the Extended BASIC cartridge. Both stage into DSK1 as
the existing profiles do, with hints giving the OLD and RUN steps.

---

## 6. Round-trip architecture

    source  --parse-->  AST  --xbas99 -c-->  PROGRAM  --xdm99-->  .dsk
                                                                    |
                                                            Classic99 or TI
                                                                    |
                                                                  SAVE
                                                                    |
    source  <--merge--  AST  <--parse--  listing  <--xbas99 -d--  extract

Import is never a silent overwrite:

1. Extract the named program from the .dsk with xdm99.
2. Detokenize with `xbas99 -d` into a temporary document.
3. Normalise both sides: line endings, and the trailing spaces the detokenizer
   leaves after keywords such as `END `.
4. If the normalised forms match, say so and do nothing.
5. Otherwise open the diff editor, source left and disk right, and offer
   Import, Keep, or Cancel.

Step 3 is load-bearing. Without it every import reports differences, because the
detokenizer does not reproduce original spacing exactly. Verified: `nim.bas`
differs only in line endings after a full round trip.

Disk watching uses a FileSystemWatcher over the project's own `dist/**/*.dsk`,
debounced, comparing *detokenized source* and never sectors. A .dsk changes on
every write; only a program difference is worth a prompt.

---

## 7. Editor services

All driven by the single metadata table required by requirement 8.

- **Completion** — dialect-filtered keywords; `CALL ` completes to the CALL
  subprograms of the active dialect plus user SUBs; snippets for FOR/NEXT,
  IF/THEN/ELSE, OPEN, SUB/SUBEND.
- **Hover** — syntax, parameters, dialect availability, ranges, a one-line
  description and a manual reference. Summarised, not reproduced.
- **Signature help** — parameter index tracking for CALL SOUND, CALL CHAR,
  CALL COLOR, CALL SPRITE, SEG$, POS, and user SUBs.
- **Semantic tokens** — line numbers, branch targets, user subprograms and
  labels: the four TextMate cannot get right and the four that matter most.
- **Formatting** — keyword casing, spacing around operators, commas and `::`,
  FOR and SUB indentation. Strings, DATA, IMAGE and comments are never touched,
  enforced by formatting from the AST rather than from text.
- **Outline** — SUBs as symbols, plus REM headings that follow a recognisable
  convention.

---

## 8. Tooling opportunities

- **Character editor** — `CALL CHAR(n, "hex")` with an 8 by 8 grid webview
  writing back sixteen hex digits, and a rendered preview on hover.
- **Sprite tooling** — the same editor, plus CALL MAGNIFY awareness.
- **Colour names** — sixteen fixed values; hover and signature help name them.
  Values must come from the manual.
- **Sound** — CALL SOUND duration, frequency and volume ranges and the noise
  encodings, validated against documented ranges only. Note-to-frequency is a
  natural later addition.
- **File I/O** — OPEN attribute combinations are a small grammar and some
  combinations are definitively illegal; those are worth diagnosing. Device
  names are not.

---

## 9. Extension architecture changes

The extension is single-language in one specific place:

    src/extension.ts:30   const LANGUAGE_ID = 'tms9900';
    src/extension.ts:111  const selector = { language: LANGUAGE_ID, scheme: 'file' };

Every provider registers against that one selector. Three languages means a
registry keyed by language id, each contributing its own provider set. That is a
contained refactor of `extension.ts` and touches nothing else.

Reused unchanged: the toolchain profile system, the capability and command
template model, `resolveTarget` and the whole target mechanism, the emulator
profile system including requires, hint and staging, the build coordinator, and
the diagnostics plumbing.

New: `src/lang/basic/` with lexer, parser, AST, binder and metadata, plus
per-language providers.

Scale: the extension is 5,318 lines today. A parser, binder, metadata table and
language services for two dialects is comparable to everything that exists now.

---

## 10. Testing

The existing 45 tests stay green as a condition of every change. New tests in
the same dependency-free `node:test` style:

- lexer and parser units per statement family
- metadata: every documented built-in appears once, with dialect, category and
  parameter list
- **round trip**: source, tokenize, detokenize, normalise, compare
- **disk round trip**: source, tokenize, write .dsk, extract, detokenize,
  compare
- renumbering in token space, confirming string and numeric literals untouched
- negative corpus: every file must produce at least one diagnostic

A corpus exists and should be adopted rather than invented. xdt99 ships 40 BASIC
test files in `test/basic/`, including `keywords.txt` and a 139-line
`statmnts.txt` syntax exercise, plus six deliberate error cases. Two historical
programs are also to hand in this collection. Target: zero false positives on
every valid file.

---

## 11. Performance

Parse on a debounce, as the assembly analyser already does. BASIC programs are
small — the historical corpus here is 2 to 3 KB, and the standard format caps a
program near 14 KB — so a full reparse per keystroke pause is affordable.
Incremental parsing is not needed; revisit only if a real program proves
otherwise.

---

## 12. Phasing

1. Metadata table and both dialect inventories, with tests.
2. Lexer, parser, AST, binder. No editor features yet.
3. Diagnostics, then completion, hover, signature help, semantic tokens.
4. Build pipeline: capabilities, targets, emulator profiles, wizard, templates.
5. Round trip: import, compare, disk watching, update on disk.
6. Disk browsing tree.
7. Character and sprite editors.

Each phase ends with the full suite green, including the assembly tests.
