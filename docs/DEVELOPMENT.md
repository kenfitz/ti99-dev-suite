# Development

Working on the extension itself. For using it, see the
[readme](../readme.md). For the Marketplace account and the first publish, see
[publishing.md](publishing.md), which this file does not repeat.

## Setup

Requires Node 22 or newer and Python 3.8+ with
[xdt99](https://github.com/endlos99/xdt99) if you want to build TI projects.

```
git clone https://github.com/kenfitz/ti99-dev-suite.git
cd ti99-dev-suite
npm ci
```

`npm ci` rather than `npm install`, so you get exactly the locked versions CI
uses.

## Everyday commands

| Command | Does |
|---|---|
| `npm run build` | compile TypeScript to `out/` |
| `npm run watch` | recompile on save; leave running while developing |
| `npm run check-types` | type-check without emitting |
| `npm run lint` | ESLint over `src/` |
| `npm test` | compile, then run the test suite |
| `npm run package` | produce a `.vsix` |

## Running it

Press **F5**. Two launch configurations are available:

- **Run Extension (snake project)** — opens the Extension Development Host with
  a sibling `../ti99-snake` project already loaded, so the extension activates
  on a real `ti99.json` immediately. Adjust or remove if you keep your test
  project elsewhere.
- **Run Extension (empty window)** — a blank window, for exercising the New
  Project and Import wizards from nothing.

Run `npm run watch` alongside so edits recompile; reload the host window with
**Ctrl+R** to pick them up.

The packaged copy of the extension is not needed for this and is not used by
F5. If you have it installed and see duplicated TI-99 commands in the
development host, uninstall the packaged copy.

## Tests

```
npm test
```

The suite uses Node's built-in test runner, so there is no test framework
dependency. Tests live in `test/` and run against the compiled output in
`out/`, which is why `pretest` compiles first.

They cover the parts that can be exercised without the VS Code API:

- `dialect.test.js` — dialect detection and hazard scanning, including the
  specific false positives and false negatives that a regex-based
  implementation produced
- `project.test.js` — project validation and distribution-target resolution
- `manifest.test.js` — consistency between the code and `package.json`: every
  registered command is contributed and vice versa, emulator profiles only
  reference settings that exist, and any flag taking a config value declares it
  in `requires` so it cannot silently lose its argument

Anything that imports `vscode` cannot be unit tested this way. Those paths are
covered by running the extension.

## A note on byte-identical output

Twelve of the seventeen compiled modules are byte-for-byte identical to the
shipped 0.1.2 build, and that equality is the correctness argument for the
source reconstruction. See [reconstruction.md](reconstruction.md).

The practical consequence: **the compiler preserves comments**, so adding or
editing a comment in `src/` changes the compiled output. That is fine for code
you are deliberately changing, but it means you should not, for example, add an
`eslint-disable` comment to a module you did not otherwise touch. ESLint's
config carries a file-scoped override for exactly this reason.

## Packaging

```
npm run package
```

`.vscodeignore` decides what ships. The package should contain only `out/`,
`syntaxes/`, `snippets/`, `templates/`, `resources/`, `package.json`,
`readme.md`, `changelog.md` and `LICENSE.txt` — 31 entries in total. Check with:

```
npx vsce ls --tree
```

Anything under `src/`, `docs/`, `test/`, `.github/` or `.vscode/` appearing in
that list is a `.vscodeignore` bug.

## Releasing

The release is tag-driven and runs in GitHub Actions. Nothing is published to
the Marketplace automatically.

1. Update `changelog.md` with the new version and what changed.
2. Bump the version and tag it:

   ```
   npm version 1.0.0 -m "Release %s"
   ```

   `npm version` writes `package.json`, commits it, and creates a `v1.0.0` tag.
3. Push the commit and the tag:

   ```
   git push origin main --follow-tags
   ```
4. The **Release** workflow lints, type-checks, compiles, tests, packages, and
   creates a GitHub Release with the `.vsix` attached.

The workflow fails if the tag does not match `package.json` — a `v1.0.1` tag on
a `1.0.0` package produces a release whose asset contradicts its name, so it
stops rather than publishing something confusing.

To rebuild a release from an existing tag, run the workflow manually from the
Actions tab and give it the tag name.

A tag containing a hyphen, such as `v1.0.0-beta.1`, is marked as a prerelease.

## Publishing to the VS Code Marketplace

This is deliberately manual. Automating it means putting a token that can
publish under your publisher identity into repository secrets, which is worth
doing consciously rather than by default.

Full instructions are in [publishing.md](publishing.md). In short:

```
npx vsce login kenfitz     # paste a Personal Access Token when prompted
npm run package
npx vsce publish
```

The `publisher` field in `package.json` is `kenfitz`. That ID must exist at
<https://marketplace.visualstudio.com/manage> before the first publish, and it
is permanent once created.

### If you later want to automate it

Add a repository secret named `VSCE_PAT` holding an Azure DevOps Personal
Access Token scoped to **Marketplace → Manage**, then add a step to the release
workflow:

```yaml
- name: Publish to Marketplace
  run: npx vsce publish --packagePath ${{ steps.v.outputs.vsix }}
  env:
    VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

Do that only when you are ready for every pushed tag to go live.

## Secrets and credentials

Nothing is required today. CI uses only the automatic `GITHUB_TOKEN`, and the
release workflow needs `contents: write`, which it already declares.

| Secret | Needed for | Status |
|---|---|---|
| `GITHUB_TOKEN` | creating releases | automatic, nothing to configure |
| `VSCE_PAT` | automated Marketplace publishing | not configured; only needed if you automate publishing |

## GitHub Sponsors

Not configured yet. Once a Sponsors profile is approved:

1. Create `.github/FUNDING.yml`:

   ```yaml
   github: [your-sponsors-username]
   ```

2. Add the URL to `package.json` so VS Code shows a Sponsor button on the
   extension page:

   ```json
   "sponsor": { "url": "https://github.com/sponsors/your-sponsors-username" }
   ```

Both are one-line additions. Neither has been guessed at, because a wrong
sponsor URL is worse than none.
