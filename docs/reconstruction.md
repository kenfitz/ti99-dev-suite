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
- `npx vsce package` produces a `.vsix` whose **31 files are byte-identical** to
  `ti99-dev-suite-0.1.2.vsix`.

That equality is the correctness argument for this reconstruction, and it is
worth re-checking after any refactor that is meant to be behaviour-preserving.

## Known placeholders, carried over from the original

These were never filled in and are unchanged here:

- `publisher` is `your-publisher-id`
- `repository`, `bugs` and `homepage` point at `YOUR-GITHUB-USER`

They must be set to real values before publishing. See [publishing.md](publishing.md).
