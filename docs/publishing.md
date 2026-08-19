# Installing and Publishing

Two separate things:

- **[Part 1: Install it on your own machine](#part-1-install-it-on-your-own-machine)** — do this today.
- **[Part 2: Publish it to the Marketplace](#part-2-publish-it-to-the-marketplace)** — do this when you are ready for other people to use it.

---

# Part 1: Install it on your own machine

## Option A — run it from source (best while developing)

This is how you should work day to day. Changes take effect on reload, and you
get a debugger attached to the extension itself.

```bash
cd ti99-dev-suite
npm install
npm run compile
code .
```

Press **F5**. A second VS Code window opens titled *[Extension Development
Host]* with your extension loaded. Open a folder containing `.a99` files in
that window to try it.

While developing, run `npm run watch` in a terminal so TypeScript recompiles on
save. Then in the Extension Development Host press **Ctrl+R** (Cmd+R on macOS)
to reload after each change.

To debug the extension itself, set breakpoints in the `src/` files in the first
window — they will hit while the second window runs.

## Option B — build a .vsix and install it properly

This gives you a real installation that survives restarts and does not need the
source tree open.

```bash
npm install -g @vscode/vsce      # once
cd ti99-dev-suite
npm install
vsce package
```

That produces `ti99-dev-suite-0.1.0.vsix`. Install it either way:

**From the UI**
Extensions view → `...` menu at the top → **Install from VSIX...** → pick the file.

**From the command line**
```bash
code --install-extension ti99-dev-suite-0.1.0.vsix
```

To remove it:
```bash
code --uninstall-extension your-publisher-id.ti99-dev-suite
```

## Option C — share the .vsix with a few people

A `.vsix` is just a file. Email it, drop it in a Dropbox folder, or attach it to
a GitHub release. Anyone can install it with Option B. No Marketplace account,
no review, no publisher identity required.

For a small retro-computing community this is often all you need, and it is the
right way to circulate a beta.

## First run

1. Install Python 3.8 or later if you have not already.
2. Download xdt99 from <https://github.com/endlos99/xdt99> and unzip it
   somewhere permanent, for example `C:\ti99\xdt99`. It is a folder of `.py`
   files — there is nothing to install.
3. In VS Code run **TI-99: Configure Toolchain** → *Set the xdt99 directory*,
   and point it at the folder containing `xas99.py`.
4. Run **TI-99: Show Toolchain Status** to confirm everything is found.
5. Run **TI-99: Create New Project**, then press **F5**.

---

# Part 2: Publish it to the Marketplace

## What you are signing up for

Publishing is free, but it is a commitment. Once the extension is public,
people will file issues, and an abandoned extension with a broken build is
worse for the community than no extension. Consider circulating a `.vsix` for a
few weeks first.

## Step 1 — Create an Azure DevOps organisation

The VS Code Marketplace runs on Azure DevOps identity. You need an account even
though you will never use the rest of Azure DevOps.

1. Go to <https://dev.azure.com> and sign in with a Microsoft account. Create
   one if you do not have one — use an address you will keep.
2. Create an organisation when prompted. The name does not matter and is not
   shown to users; something like `yourname-dev` is fine.

## Step 2 — Create a Personal Access Token

This is the credential `vsce` uses to publish. Get the scope wrong and you will
see a confusing 401.

1. In Azure DevOps, click your avatar (top right) → **Personal access tokens**.
2. **+ New Token**.
3. Fill it in exactly like this:
   - **Name**: `vsce publish`
   - **Organization**: **All accessible organizations** ← this one matters. The
     default is your single org, and publishing will fail with it.
   - **Expiration**: up to a year. Diarise the renewal.
   - **Scopes**: click **Show all scopes**, find **Marketplace**, tick
     **Manage**.
4. **Create**, then copy the token immediately. It is shown once.

Store it in a password manager. Anyone with this token can publish as you.

## Step 3 — Create your publisher

1. Go to <https://marketplace.visualstudio.com/manage>.
2. Sign in with the same Microsoft account.
3. **Create publisher**.
   - **ID**: lowercase, no spaces, permanent, and part of your extension's
     public identity forever (`publisher-id.ti99-dev-suite`). Choose carefully —
     it cannot be renamed.
   - **Display name**: shown on the extension page; this one can change.
4. Save.

## Step 4 — Fill in the placeholders

Search the project for these and replace every one:

| Placeholder | Where | Replace with |
|---|---|---|
| `your-publisher-id` | `package.json` → `publisher` | Your publisher ID from step 3 |
| `YOUR-GITHUB-USER` | `package.json` → `repository`, `bugs`, `homepage` | Your GitHub user or org |
| `<YOUR NAME>` | `LICENSE` | Your name |

The `publisher` field must match your publisher ID exactly or publishing fails.

Push the repository to GitHub before publishing. The Marketplace renders your
`README.md` on the extension page, and relative image links only resolve if the
repository URL is correct and public.

## Step 5 — Check what will actually ship

```bash
vsce ls
```

This lists every file that goes into the package. Look for anything that should
not be there — `node_modules`, `src/`, `.vsix` files, secrets. Adjust
`.vscodeignore` until the list is just `out/`, `syntaxes/`, `snippets/`,
`templates/`, `resources/`, `package.json`, `README.md`, `CHANGELOG.md` and
`LICENSE`.

Then build and sanity check the package itself:

```bash
vsce package
code --install-extension ti99-dev-suite-0.1.0.vsix
```

Install your own `.vsix` and use it for a day before publishing. It catches the
class of bug where something works from source but was excluded from the
package.

## Step 6 — Publish

```bash
vsce login your-publisher-id      # paste the PAT when prompted
vsce publish
```

Or in one shot, which is what CI uses:

```bash
vsce publish -p <your-pat>
```

The extension appears at
`https://marketplace.visualstudio.com/items?itemName=your-publisher-id.ti99-dev-suite`
within a few minutes. Indexing for search can take up to an hour.

## Step 7 — Publishing updates

`vsce` can bump the version for you and create the git tag:

```bash
vsce publish patch     # 0.1.0 -> 0.1.1
vsce publish minor     # 0.1.0 -> 0.2.0
vsce publish major     # 0.1.0 -> 1.0.0
```

Update `CHANGELOG.md` first. The Marketplace shows it on its own tab and people
do read it.

You cannot unpublish a version or republish the same version number. If you
ship something broken, fix it forward with a patch release. In a real emergency
`vsce unpublish publisher.extension` removes the entire extension, which also
deletes its rating and install count — treat it as a last resort.

## Optional — Open VSX

VSCodium, Gitpod, Eclipse Theia and Cursor use the Open VSX registry instead of
Microsoft's. Publishing there as well costs about ten minutes and roughly
doubles your reachable audience for a retro-computing tool, where a lot of
people are on non-Microsoft builds.

1. Sign in at <https://open-vsx.org> with GitHub.
2. Generate an access token from your profile.
3. Agree to the publisher agreement (there is a one-time form).

```bash
npm install -g ovsx
ovsx publish ti99-dev-suite-0.1.0.vsix -p <your-openvsx-token>
```

---

# Automating releases

`.github/workflows/release.yml` in this repository publishes to both registries
when you push a version tag.

Add two repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VSCE_PAT` | The Azure DevOps token from step 2 |
| `OVSX_PAT` | The Open VSX token, if you publish there |

Then release with:

```bash
npm version 0.1.1          # updates package.json and creates a git tag
git push --follow-tags
```

The workflow compiles, packages, attaches the `.vsix` to a GitHub release, and
publishes to both registries.

---

# Things that commonly go wrong

**`ERROR Failed request: (401)`**
The PAT scope is wrong. It must be **Marketplace → Manage**, with organisation
set to **All accessible organizations**. Recreate the token; you cannot edit the
organisation scope of an existing one.

**`ERROR The Personal Access Token verification has failed`**
Usually an expired token, or the publisher ID in `package.json` does not match
the publisher the token belongs to.

**`ERROR Missing publisher name`**
You left `publisher` as the placeholder in `package.json`.

**`ERROR Make sure to edit the README.md file before you package or publish`**
`vsce` refuses to ship the default template README. Yours is already rewritten,
so this should not fire — if it does, you are packaging from the wrong folder.

**The extension installs but nothing happens**
Check `activationEvents`. This extension activates on
`workspaceContains:**/ti99.json`, so it stays dormant until a project file
exists. That is deliberate — it keeps startup fast — but it means opening a
lone `.a99` file gives you syntax highlighting and formatting without the build
commands. Add `onLanguage:tms9900` to `activationEvents` if you would rather it
always activate.

**Icon does not appear**
It must be a PNG of at least 128×128, referenced by a path relative to
`package.json`, and not excluded by `.vscodeignore`.

**It works with F5 but not from the .vsix**
Something you rely on is being excluded. Run `vsce ls` and compare.

---

# A note on bundling xdt99

Do not put xdt99 inside the `.vsix` without a licence review first.

xdt99 is GPL v3. Invoking it as a separate process — which is what this
extension does — makes the two an aggregate, and your MIT licence stands.
Shipping xdt99 files inside your package is redistribution, and the analysis
changes: at minimum you must include the GPL text, preserve copyright notices,
and offer corresponding source.

Keeping xdt99 as a user-installed dependency is not a limitation to apologise
for. It is the reason you can license your own work however you like, and it
means your users get xdt99 updates without waiting for you.
