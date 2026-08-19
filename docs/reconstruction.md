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

That first folder name is literal, not a stale placeholder: 0.1.2 was packaged
while `publisher` still said `your-publisher-id`, so that is the identity it was
installed under. It stays the reference build now that `publisher` is set.

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

- All **17 emitted modules are byte-identical** to the shipped 0.1.2 build.
- `npx vsce package` produces a `.vsix` with the **same 31 entries**, of which
  **29 are byte-identical** to `ti99-dev-suite-0.1.2.vsix`.

The two that differ are `extension/package.json` and `extension.vsixmanifest`,
and they differ *only* by the publisher/repository substitution recorded below —
no other line changes. That is an intended edit, not drift.

This equality is the correctness argument for the reconstruction, and it is worth
re-checking after any refactor meant to be behaviour-preserving. The 17-module
comparison is the sensitive one: compiler output is unaffected by metadata, so it
should stay at 17/17 forever unless you actually changed behaviour.

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
