# Security policy

The TI-99/4A Development Suite is a VS Code extension that runs local developer
tools. It is not a hosted service and it does not transmit your code anywhere.
Its security surface is essentially this: it launches programs on your machine
(the xdt99 assembler tools, and an emulator) using paths and arguments taken
from your settings and your project's `ti99.json`.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**, not in a public issue.

Use GitHub's private reporting form:

**<https://github.com/kenfitz/ti99-dev-suite/security/advisories/new>**

That opens a draft security advisory visible only to the maintainer. If the
form is unavailable to you, open a normal issue that says only that you have a
security report and would like a private channel — do not include details.

Please include, as far as you can:

- what the issue allows an attacker to do
- the steps or project layout needed to trigger it
- the extension version and operating system

As a solo-maintained hobby project there is no formal response-time guarantee.
Reports will be acknowledged and, if valid, fixed in a release as soon as is
practical. Credit will be given unless you would rather it were not.

## What should be a normal issue instead

Most problems are ordinary bugs and belong in the public
[issue tracker](https://github.com/kenfitz/ti99-dev-suite/issues):

- builds failing, wrong assembler arguments, wrong diagnostics
- the emulator not launching, or launching with the wrong files
- crashes, freezes, or incorrect syntax highlighting

Things worth reporting privately instead:

- a way for a workspace to make the extension execute something the user did
  not intend, for example through crafted `ti99.json` values
- a path in a project file that escapes the project directory during a build,
  a clean, or an emulator staging step
- anything that leaks the contents of files outside the workspace

## Supported versions

Only the most recent release is supported. This is a single-maintainer project
and there are no backported fixes; if you are reporting a problem, please check
that it still occurs on the latest version first.
