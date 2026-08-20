# Source reconstruction — 19 August 2026

The original TypeScript source for this extension was lost. It existed nowhere on
the machine: no `ti99-dev-suite` folder on any drive, no `extension.ts` outside
`node_modules`, no workspace entry in VS Code's history, nothing in the Recycle
Bin. Only the build outputs survived.

## What it was rebuilt from

| Input | Where |
|---|---|
| Installed extension, compiled `out/*.js` | `%USERPROFILE%\.vscode\extensions\your-publisher-id.ti99-dev-suite-0.1.2` |
| Packaged builds 0.1.0 / 0.1.1 / 0.1.2 | `%USERPROFILE%\Downloads\*.vsix` |
| Design docs | [requirements.md](requirements.md), [deep-dive.md](deep-dive.md) |

That first folder no longer exists. 0.1.2 was packaged while `publisher` still
said `your-publisher-id`, so that was the identity it installed under; setting
`publisher` to `kenfitz` changed the identity, and the old copy was uninstalled
rather than left alongside the new one (VS Code keys extensions on
`publisher.name`, so both would otherwise load at once and register the
`tms9900` language twice).

**Use `Downloads/ti99-dev-suite-0.1.2.vsix` as the comparison baseline.** Its
seventeen `extension/out/*.js` entries were confirmed byte-identical to that
install directory before it was removed, and being an immutable file it is the
better reference anyway. It is the only surviving artifact of the original
build — do not delete it.

No source maps and no `src/` directory were present in any `.vsix`, so the
TypeScript was rewritten from the compiled JavaScript. That was tractable because
the build preserved comments and the module layout: `out/` had the same seventeen
modules in the same folders that `src/` now has.

Everything that is not compiled output — `package.json`, the TextMate grammar,
snippets, templates, `language-configuration.json`, icons, readme, changelog,
LICENSE — is the original file, copied across unchanged.

## What was recovered, and how it was verified

Type annotations and interfaces are erased by the compiler, so those were
reintroduced by hand. Everything else is recovered exactly. Two compiler options
were inferred from the shape of the emitted JavaScript:

- `esModuleInterop: true` — the original output contains the `__importStar` helper.
- `noUnusedParameters` off — an unused `r` capture group survives in
  `lang/formatter.ts`, which that flag would have rejected.

Verification, reproducible at any time:

```
npm run compile
```

- **12 of the 17** emitted modules are byte-identical to the shipped 0.1.2
  build. Five have been changed deliberately — see *Intentional divergence*
  below.
- `npx vsce package` produces a `.vsix` with the **same 31 entries**. No file
  appears or disappears; only the deliberately changed ones differ.

This equality is the correctness argument for the reconstruction, and it is worth
re-checking after any refactor meant to be behaviour-preserving. The module
comparison is the sensitive one: compiler output is unaffected by metadata, so
anything beyond the known divergence means you changed behaviour.

## Intentional divergence from 0.1.2

Twelve of the seventeen modules remain byte-identical. Five have changed on
purpose:

| Module | Why |
|---|---|
| `out/lang/dialect.js` | hazard-detection bug fix (below) |
| `out/config/project.js` | `targets`, `resolveTarget`, `basic-program` capability |
| `out/build/coordinator.js` | target-aware build and clean, `${input}`/`${fileType}` |
| `out/toolchain/profiles.js` | `basic-program` command (xbas99) |
| `out/extension.js` | Build Target / Rebuild Target commands |

### Multi-target builds

A project may now declare `targets`: distribution routes that each override
part of the config. `resolveTarget` merges one onto the base and returns an
ordinary `ProjectConfig`, so everything below it is unchanged and a project
without targets behaves exactly as before. The build cache is keyed
`targetId:capability`, and `clean` removes the union of every target's build
and dist folders rather than only the base pair.

Two pre-existing bugs surfaced while wiring this up, both found by generating
the command lines through the real `resolve()` rather than by reading it:

- **`tifiles` could never have worked.** The profile template referenced
  `${input}` and `${fileType}`, but neither was in the scalar map, so the
  command expanded to `xdm99.py -T -f -o out.tfi` — no input file and no file
  type. Both values are now supplied. `tifiles` wraps the memory image when the
  target builds one, since that auto-starts under E/A option 5, and otherwise
  the tagged object, which is what Extended BASIC's `CALL LOAD` reads.
- **Nothing could tokenise a BASIC program.** An Extended BASIC boot disk needs
  a program named `LOAD`, which XB runs at power-up. The new `basic-program`
  capability calls `xbas99.py -c`, and `disk.files` can reference it like any
  other artifact.

### Dialect hazard detection

`detectDialect` counted dialect hazards with a regex over the raw source line.
It had four defects, each demonstrable on a real file:

1. Its guard against indirect addressing, `!/^\s*\S+\s+\S*\*[Rr]/`, expects the
   first field to be the mnemonic. On a *labelled* line the first field is the
   label, so the guard can never fire — `VMBWLP MOVB *R1+,@VDPWD` was counted as
   a hazard while the identical unlabelled line was not.
2. A `*` inside a `;` comment counted, so a `DATA` row documenting ASCII 42
   registered as a hazard.
3. The separator test used `\s`, which matches a tab. A tab is a *legal*
   extended-syntax separator, so tab-aligned comments were flagged.
4. The guard was line-scoped, so any `*Rn` anywhere on a line suppressed a real
   hazard elsewhere on that same line — a false negative, the direction that
   actually costs a broken build.

`splitLine` in `lang/formatter.ts` already parsed the line into fields properly,
tracking quoted literals, `''` escapes, tab separators and no-operand opcodes.
`findDialectHazards` used it; `detectDialect` did not. The fix deletes the regex
and calls the parser, so there is one implementation rather than two. The
semicolon count in the same function now goes through the parser too, so a `;`
inside a `TEXT` literal is no longer read as a comment.

The import direction is safe: `formatter.ts` refers to `dialect.ts` only through
`import type`, which the compiler erases — `out/lang/formatter.js` has no runtime
`require("./dialect")`, so there is no cycle.

### Evidence

The parser's hazard set for `snakeC.a99` is *exactly* the set of lines xas99
rejects in extended mode — 12 lines, no more and no fewer. For `snake-a.a99` it
reports zero, which is independently confirmed: that file assembles at exit 0
under extended syntax and yields an object byte-identical to the strict build,
so nothing in it is misparsed. The old regex claimed 2.

| File | old regex | fixed | xas99 errors |
|---|---|---|---|
| `snake-a.a99` | 2 | 0 | 0 |
| `snakeC.a99` | 13 | 12 | 12 |
| `tombstone.a99` | 90 | 91 | — |
| `template.a99` | 4 | 4 | — |

Note `tombstone.a99` went *up*: defect 4 had been hiding a genuine hazard on
line 1418, `MOV @GENREL,*R8+ * PUT MONST IN TABLE`, where `*R8+` is a real
operand and the trailing `* PUT MONST` is a real single-blank comment.

### What this means for verification

The 16 unchanged modules must stay byte-identical; that check still holds and
still catches accidental drift. `dialect.js` is now out of the comparison, and
its correctness rests on the xas99 cross-check above rather than on equality
with 0.1.2. Re-run that cross-check if you touch dialect or formatter.

## Placeholders

`publisher`, `repository`, `bugs` and `homepage` were never filled in in the
original. They are now set to `kenfitz`. The Marketplace publisher ID must match
a publisher actually registered at <https://marketplace.visualstudio.com/manage>;
if you register a different ID, update `publisher` to match.

Still outstanding: `LICENSE.txt` carries `Copyright (c) 2026 <YOUR NAME>` and
needs your real name. See [publishing.md](publishing.md).

## Packaging fix

`docs/` was written as part of this reconstruction and did not exist in 0.1.2.
`.vscodeignore` had no rule for it, so `vsce package` began sweeping all five
files — 110 KB of internal design and reconstruction notes — into the shipped
extension. `docs/**` and `.gitattributes` are now excluded, which is what
restores the 31-entry package above.
