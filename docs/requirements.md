# TI-99/4A Development Suite for Visual Studio Code

## Product and Technical Requirements Specification

**Working product name:** TI-99/4A Development Suite  
**Target editor:** Visual Studio Code Desktop  
**Primary language:** TMS9900 Assembly Language  
**Primary toolchain:** xdt99  
**Initial host platforms:** Windows, macOS, and Linux  
**Document status:** Initial implementation specification

---

# 1. Product Overview

The TI-99/4A Development Suite is a Visual Studio Code extension that provides a modern, integrated development environment for creating software for the Texas Instruments TI-99/4A computer.

The extension will allow a developer to:

1. Create a new TI-99/4A assembly-language project.
2. Select a deployment format such as cartridge, disk, or Editor/Assembler program.
3. Write TMS9900 assembly language using syntax highlighting, code completion, navigation, snippets, and diagnostics.
4. Assemble and link one or more source modules through xdt99.
5. Create emulator-ready cartridge images or TI-compatible disk images.
6. Launch the resulting program in an emulator.
7. Export build artifacts for use on real TI-99/4A hardware.
8. Inspect listings, symbols, memory usage, cartridge segments, and disk contents.

The extension will use xdt99 as the underlying assembler, linker, cartridge builder, and disk-image toolchain. xdt99 currently includes the `xas99` TMS9900 assembler, `xdm99` disk manager, `xga99` GPL assembler, disassemblers, HFE tools, and nanoPEB/CF7+ volume tools. The published xdt99 documentation covers version 3.6.0, requires Python 3.8 or later, supports Windows, macOS, and Linux, and identifies the project as GPL version 3 software.

Reference: https://endlos99.github.io/xdt99/

The extension will initially invoke xdt99 as an external process. It will not reimplement the TMS9900 assembler or linker.

---

# 2. Product Vision

The extension should make TI-99/4A development feel similar to modern embedded software development:

```text
Create Project
    ↓
Write Assembly
    ↓
Build
    ↓
Package
    ↓
Run in Emulator
    ↓
Export to Real Hardware
```

The developer should not need to memorize xdt99 command-line parameters, manually construct disk images, maintain batch files, or manually launch an emulator after each build.

Advanced developers must still be able to inspect and customize every command and output.

---

# 3. Goals

## 3.1 Primary goals

The first production release must:

- Support TMS9900 assembly-language development.
- Use `xas99` for assembly and linking.
- Use `xdm99` for disk-image creation and management.
- Generate MAME-compatible RPK cartridge images.
- Generate raw binary cartridge images.
- Generate Editor/Assembler object files.
- Generate Editor/Assembler option 5 program images.
- Generate TI disk images containing selected build outputs.
- Launch MAME, Classic99, or a configurable custom emulator.
- Report assembler and linker errors in the VS Code Problems panel.
- Provide project templates and guided project creation.
- Provide build, rebuild, clean, package, run, and build-and-run commands.
- Support multiple assembly modules.
- Support `COPY` include files and include paths.
- Generate and display assembly listings and symbol information.
- Validate project configuration before starting a build.
- Preserve complete build logs for troubleshooting.

## 3.2 Secondary goals

Later releases should:

- Provide semantic TMS9900 language support.
- Provide cartridge memory and bank visualization.
- Provide disk catalog visualization.
- Provide sprite, character, screen, and sound asset tools.
- Support GPL and mixed Assembly/GPL projects.
- Support source-level debugging when a suitable emulator interface is available.
- Support FinalGROM 99, FlashROM 99, HFE, CF7+, nanoPEB, and similar real-hardware targets.

---

# 4. Non-Goals for the Initial Release

The initial release will not:

- Implement a new TMS9900 assembler.
- Implement a complete TI-99/4A emulator.
- Emulate TI hardware inside the extension.
- Provide source-level debugging unless an emulator integration can reliably support it.
- Support VS Code for the Web.
- Automatically download copyrighted TI ROMs, system firmware, cartridge ROMs, or Editor/Assembler images.
- Distribute commercial emulator software.
- Modify xdt99 source code unless a specific incompatibility requires it.
- Guarantee that arbitrary legacy assembly source will run correctly on every emulator or hardware configuration.
- Automatically generate correct assembly code from natural-language descriptions.

VS Code web extensions cannot launch local executables or create child processes, which prevents a browser-only extension from invoking Python, xdt99, or desktop emulators. The supported product must therefore be a desktop extension.

Reference: https://code.visualstudio.com/api/extension-guides/web-extensions

---

# 5. Target Users

## 5.1 New TI assembly developer

A user who wants to learn TMS9900 assembly but does not understand the Editor/Assembler environment or xdt99 command line.

This user needs:

- Starter projects.
- Instruction documentation.
- Build buttons.
- Clear diagnostics.
- Emulator launching.
- Examples and snippets.

## 5.2 Experienced TI-99/4A developer

A developer familiar with assembly, Editor/Assembler, Classic99, MAME, FinalGROM, or original hardware.

This user needs:

- Control over memory layout.
- Multiple source modules.
- Include directories.
- Custom assembler options.
- Existing-project support.
- Build listings.
- Symbol tables.
- Binary and disk outputs.
- Custom emulator command lines.

## 5.3 Retro-computing developer

A developer familiar with other systems but new to the TI-99/4A.

This user needs:

- Modern project organization.
- Explanations of TI-specific formats.
- Standard build and run behavior.
- Memory-map visualization.
- Emulator profiles.

---

# 6. Supported Host Environments

## 6.1 Required

The extension must support:

- Windows 10 and Windows 11.
- Current supported macOS versions.
- Common modern Linux distributions.
- Visual Studio Code Desktop.
- Python 3.8 or later.
- xdt99 version 3.6.0 or a compatible later version.

## 6.2 Initial platform priority

Implementation and testing priority will be:

1. Windows.
2. macOS.
3. Linux.

Windows is the primary development target for the first implementation.

## 6.3 Unsupported

The initial release will not support:

- vscode.dev.
- github.dev.
- Browser-only Codespaces extension hosting.
- Mobile versions of VS Code.
- Visual Studio IDE.
- Visual Studio Code versions older than the minimum version declared in the extension manifest.

---

# 7. External Dependencies

## 7.1 Required dependencies

The extension requires:

- Visual Studio Code Desktop.
- Python 3.8 or later.
- xdt99.
- At least one emulator for Build and Run functionality.

## 7.2 Optional dependencies

Depending on the selected target:

- MAME.
- Classic99.
- A custom emulator executable.
- A FinalGROM 99 SD-card location.
- A FlashROM 99 destination.
- HFE utilities supplied by xdt99.
- CF7+ or nanoPEB tooling supplied by xdt99.

## 7.3 Toolchain installation modes

The extension must support these installation modes:

### Mode A: User-installed xdt99

The user installs xdt99 separately and configures the tool directory.

This must be the default initial implementation.

### Mode B: Automatically detected xdt99

The extension searches:

- The system `PATH`.
- The configured Python scripts directory.
- Common xdt99 installation locations.
- The workspace tool directory.
- The extension’s global storage directory.

### Mode C: Managed xdt99 installation

A later release may download and maintain a known xdt99 release.

This mode requires:

- Explicit user permission.
- Version verification.
- Download integrity validation.
- License notices.
- Upgrade and rollback support.
- Clear separation between extension code and xdt99 files.

Because xdt99 is GPL version 3 software, bundling or modifying it requires a deliberate distribution and license-compliance review. The initial release should avoid this complication by invoking a separately installed copy.

---

# 8. High-Level Architecture

```text
Visual Studio Code
│
├── TI-99 Extension Host
│   ├── Command Controller
│   ├── Project Manager
│   ├── Configuration Manager
│   ├── Build Coordinator
│   ├── Toolchain Adapter
│   ├── Diagnostics Parser
│   ├── Language Services
│   ├── Emulator Manager
│   ├── Artifact Manager
│   └── UI Providers
│
├── Python Runtime
│
├── xdt99
│   ├── xas99
│   ├── xdm99
│   ├── xga99, future
│   ├── xhm99, future
│   └── xvm99, future
│
└── Emulator
    ├── MAME
    ├── Classic99
    └── Custom executable
```

The extension will use VS Code commands for user actions, Task Providers for discoverable build tasks, programmatic language APIs for editing features, Tree Views for project and artifact navigation, and webviews only where a native VS Code interface cannot reasonably display the required visualization.

---

# 9. Extension Components

## 9.1 Extension host

The main extension must be written in TypeScript and run in the Node.js VS Code extension host.

## 9.2 Project manager

Responsibilities:

- Detect TI-99 projects.
- Load and validate project configuration.
- Create projects from templates.
- Resolve workspace-relative paths.
- Track the active project in multi-root workspaces.
- Expose project metadata to other components.

## 9.3 Toolchain adapter

Responsibilities:

- Locate Python.
- Locate xdt99.
- Detect xdt99 version.
- Build safe process argument arrays.
- Invoke xdt99 tools.
- Capture standard output.
- Capture standard error.
- Capture exit codes.
- Support process cancellation.
- Normalize behavior across operating systems.

The adapter should use direct process execution instead of composing a shell command whenever possible. This reduces quoting and escaping problems and gives the extension precise control over each argument.

## 9.4 Build coordinator

Responsibilities:

- Resolve build profiles.
- Validate configuration.
- Clean prior intermediate files when required.
- Assemble sources.
- Link modules.
- Generate listings and symbols.
- Package cartridges.
- Create disk images.
- Verify expected artifacts.
- Publish diagnostics.
- Update build status.
- Launch the emulator when requested.

## 9.5 Diagnostics parser

Responsibilities:

- Parse xdt99 warnings and errors.
- Associate messages with source files and line numbers.
- Create VS Code Diagnostic objects.
- Classify severity.
- Avoid duplicate messages.
- Clear stale diagnostics before each build.
- Preserve unresolved-reference warnings when configured.

## 9.6 Language service

Responsibilities:

- Syntax highlighting.
- Instruction completion.
- Directive completion.
- Register completion.
- Symbol completion.
- Hover documentation.
- Go to definition.
- Find references.
- Document symbols.
- Workspace symbols.
- Signature or operand guidance.
- Static diagnostics where practical.
- Formatting support.

## 9.7 Emulator manager

Responsibilities:

- Store emulator profiles.
- Validate emulator executable paths.
- Build emulator arguments.
- Launch emulator processes.
- Stop previously launched instances when configured.
- Support cartridge and disk workflows.
- Substitute build variables into command arguments.
- Report launch failures.

## 9.8 Artifact manager

Responsibilities:

- Identify outputs from the current build.
- Display artifacts in a TI-99 sidebar.
- Open text artifacts.
- Open binary artifact metadata.
- Copy artifacts to configured export locations.
- Reveal artifacts in the operating-system file explorer.
- Delete generated artifacts during clean operations.

---

# 10. Project Detection

A workspace is considered a TI-99 project when one of these conditions is true:

1. A `ti99-project.json` file exists at the workspace root.
2. A `.ti99/ti99-project.json` file exists.
3. A user explicitly selects a project file through the extension.
4. The extension imports an existing assembly source folder and creates a project file.

The extension must not infer a complete project merely because an `.asm` file exists. It may offer an import command, but it must not create files without permission.

---

# 11. Project Creation Wizard

## 11.1 Command

```text
TI-99: Create New Project
```

## 11.2 Wizard flow

The wizard must request:

1. Project name.
2. Destination folder.
3. Project type.
4. Output type.
5. Source syntax mode.
6. Emulator profile.
7. Optional hardware target.
8. Whether to include sample code.
9. Whether to initialize Git.
10. Whether to open the new project after creation.

## 11.3 Project type choices

The initial wizard must support:

- Cartridge Program.
- Disk Program.
- Editor/Assembler Object Program.
- Editor/Assembler Option 5 Program.
- Empty Assembly Project.
- Import Existing Assembly Project.

Future project choices:

- GPL Cartridge.
- Mixed Assembly and GPL Cartridge.
- F18A Project.
- TMS9995 Project.
- TMS99000 Project.
- Library Project.

## 11.4 Source syntax choices

The wizard must support:

- Register prefix syntax such as `R1`.
- Traditional numeric-register syntax.
- Strict Editor/Assembler-compatible mode.
- xdt99 extended syntax.

## 11.5 Generated project structure

Default cartridge project:

```text
project-name/
├── src/
│   ├── main.asm
│   └── include/
│       ├── ti99.inc
│       └── hardware.inc
├── assets/
├── build/
├── dist/
├── .vscode/
│   ├── tasks.json
│   └── launch.json
├── ti99-project.json
├── README.md
└── .gitignore
```

The `build` and `dist` folders may be created during the first build rather than project creation.

## 11.6 Generated sample program

A cartridge template should:

- Include a valid cartridge entry point.
- Initialize the workspace pointer.
- Set up the VDP.
- Display a simple message.
- Wait for keyboard input or loop safely.
- Include comments explaining each major step.
- Start cartridge code at a safe address that does not conflict with an automatically generated cartridge header.

When `xas99` generates an RPK cartridge and must add a GPL header, its documentation states that bytes from `>6000` through `>602F` may be replaced by header data. New cartridge templates should therefore place application code at `>6030` or later unless the project supplies its own header.

---

# 12. Project Configuration File

## 12.1 File name

```text
ti99-project.json
```

## 12.2 Configuration principles

The configuration must:

- Be valid JSON.
- Have a published JSON Schema.
- Provide IntelliSense and validation in VS Code.
- Use workspace-relative paths by default.
- Allow environment-variable expansion.
- Allow predefined extension variables.
- Support multiple named build profiles.
- Avoid requiring shell-specific syntax.

## 12.3 Proposed schema

```json
{
  "$schema": "./.ti99/schemas/ti99-project.schema.json",
  "version": 1,
  "name": "My TI Game",
  "description": "Example TI-99/4A cartridge project",
  "projectType": "cartridge",
  "entrySource": "src/main.asm",
  "sources": [
    "src/main.asm",
    "src/video.asm",
    "src/sound.asm"
  ],
  "includePaths": [
    "src/include",
    "lib"
  ],
  "defines": {
    "DEBUG": 1,
    "TARGET_TI994A": 1
  },
  "assembler": {
    "tool": "xas99",
    "registerPrefix": true,
    "strictCompatibility": false,
    "processor": "tms9900",
    "baseAddress": null,
    "warningsAsErrors": false,
    "colorOutput": false,
    "quietUnusedSymbols": false,
    "additionalArguments": []
  },
  "linker": {
    "enabled": true,
    "libraries": [],
    "libraryPaths": [],
    "additionalObjects": []
  },
  "output": {
    "buildDirectory": "build",
    "distributionDirectory": "dist",
    "baseName": "mytigame",
    "formats": [
      "rpk",
      "bin"
    ],
    "listing": true,
    "symbols": true,
    "cleanBeforeBuild": false
  },
  "cartridge": {
    "menuName": "MY TI GAME",
    "entrySymbol": "START",
    "hardwareTarget": "emulator",
    "banking": {
      "mode": "none",
      "bankSize": 8192,
      "maximumBanks": 1
    }
  },
  "disk": null,
  "emulator": {
    "profile": "mame-default",
    "launchAfterBuild": false
  },
  "profiles": {
    "debug": {
      "defines": {
        "DEBUG": 1
      },
      "output": {
        "listing": true,
        "symbols": true
      }
    },
    "release": {
      "defines": {
        "DEBUG": 0
      },
      "assembler": {
        "quietUnusedSymbols": true
      }
    }
  }
}
```

## 12.4 Required fields

Required fields:

- `version`
- `name`
- `projectType`
- `entrySource`
- `output.buildDirectory`
- `output.distributionDirectory`
- At least one output format

## 12.5 Project types

Valid `projectType` values in version 1:

```text
cartridge
disk
editorAssemblerObject
editorAssemblerImage
assembly
```

Reserved future values:

```text
gplCartridge
mixedCartridge
library
f18a
```

## 12.6 Processor values

Initial values:

```text
tms9900
```

Future values based on xdt99 capabilities:

```text
tms9995
tms99000
tms99105
f18a
```

---

# 13. Workspace Settings

The extension must contribute VS Code settings under the `ti99` namespace.

## 13.1 Toolchain settings

```json
{
  "ti99.python.path": "",
  "ti99.xdt99.path": "",
  "ti99.xdt99.autoDetect": true,
  "ti99.xdt99.minimumVersion": "3.6.0",
  "ti99.xdt99.versionPolicy": "compatible"
}
```

## 13.2 Build settings

```json
{
  "ti99.build.defaultProfile": "debug",
  "ti99.build.saveBeforeBuild": true,
  "ti99.build.clearDiagnosticsBeforeBuild": true,
  "ti99.build.showOutputOnError": true,
  "ti99.build.showOutputOnSuccess": false,
  "ti99.build.stopOnWarning": false
}
```

## 13.3 Emulator settings

```json
{
  "ti99.emulators": [
    {
      "id": "mame-default",
      "name": "MAME",
      "type": "mame",
      "executable": "C:/Emulators/MAME/mame.exe",
      "machine": "ti99_4a",
      "workingDirectory": "C:/Emulators/MAME",
      "arguments": []
    },
    {
      "id": "classic99-default",
      "name": "Classic99",
      "type": "classic99",
      "executable": "C:/Emulators/Classic99/Classic99.exe",
      "workingDirectory": "C:/Emulators/Classic99",
      "arguments": []
    }
  ]
}
```

## 13.4 UI settings

```json
{
  "ti99.ui.showStatusBar": true,
  "ti99.ui.showCycleCounts": true,
  "ti99.ui.hexPrefix": ">",
  "ti99.ui.hexCase": "upper",
  "ti99.ui.openListingAfterBuild": false,
  "ti99.ui.revealArtifactAfterBuild": false
}
```

---

# 14. Toolchain Discovery

## 14.1 Python detection

The extension must test candidates in this order:

### Windows

1. Configured `ti99.python.path`.
2. `py -3`.
3. `python`.
4. `python3`.
5. Common Python installation directories.

### macOS and Linux

1. Configured `ti99.python.path`.
2. `python3`.
3. `python`.
4. Common package-manager paths.

## 14.2 xdt99 detection

The extension must search:

1. Configured `ti99.xdt99.path`.
2. Workspace-local `.ti99/tools/xdt99`.
3. Workspace-local `tools/xdt99`.
4. Executables available through `PATH`.
5. Common user tool directories.
6. Extension-managed location, when managed installation is implemented.

## 14.3 Validation

A detected installation must be validated by:

- Confirming required files exist.
- Executing the required tool with a harmless version or help command.
- Confirming a successful process launch.
- Recording the detected version.
- Confirming required tools for the active project are present.

## 14.4 Toolchain status command

```text
TI-99: Show Toolchain Status
```

The result must show:

- Python path.
- Python version.
- xdt99 path.
- xdt99 version.
- `xas99` status.
- `xdm99` status.
- Optional tool status.
- Emulator profile status.
- Recommended corrective actions.

## 14.5 Configuration command

```text
TI-99: Configure Toolchain
```

This command must guide the user through:

- Selecting Python.
- Selecting the xdt99 directory.
- Testing the configuration.
- Selecting an emulator.
- Running a sample build.

---

# 15. Build Commands

The extension must contribute these commands:

```text
TI-99: Build
TI-99: Build Active File
TI-99: Rebuild
TI-99: Clean
TI-99: Package
TI-99: Run
TI-99: Build and Run
TI-99: Stop Emulator
TI-99: Select Build Profile
TI-99: Select Emulator Profile
TI-99: Show Build Output
TI-99: Show Listing
TI-99: Show Symbols
TI-99: Show Memory Map
TI-99: Show Disk Catalog
TI-99: Reveal Build Artifact
TI-99: Copy Artifact to Hardware Destination
```

## 15.1 Build

Build must:

1. Save dirty project files when configured.
2. Clear old diagnostics.
3. Validate the project.
4. Create required output directories.
5. Assemble and link.
6. Generate configured outputs.
7. Validate expected artifacts.
8. Publish diagnostics.
9. Refresh the artifact tree.
10. Report success or failure.

## 15.2 Rebuild

Rebuild must:

1. Clean generated files.
2. Perform a full build.

## 15.3 Clean

Clean must remove only files known to be generated.

It must never recursively delete an arbitrary user-configured directory without safety checks.

Before deleting, the extension must verify that:

- The directory is inside the workspace, or
- The directory is an explicitly approved external build directory.
- The path is not the workspace root.
- The path is not a drive root.
- The path is not the user profile directory.

## 15.4 Build and Run

Build and Run must:

1. Perform Build.
2. Stop if Build fails.
3. Resolve the correct artifact for the emulator.
4. Launch the configured emulator.
5. Display launch failures clearly.

---

# 16. VS Code Task Integration

The extension must register a Task Provider that detects `ti99-project.json` and contributes tasks such as:

```text
TI-99: Build
TI-99: Rebuild
TI-99: Clean
TI-99: Package Cartridge
TI-99: Create Disk Image
TI-99: Build and Run
```

Tasks must:

- Use direct process execution where possible.
- Support VS Code cancellation.
- Use a TI-99 problem matcher.
- Be usable as default build tasks.
- Be callable by keyboard shortcuts.
- Respect the selected build profile.
- Work in multi-root workspaces.

---

# 17. Assembly and Link Requirements

## 17.1 Basic assembly

The extension must support standard xas99 assembly operations.

xas99 is a two-pass TMS9900 assembler and supports standard Editor/Assembler directives, including `DEF`, `REF`, `EQU`, `DATA`, `BYTE`, `TEXT`, `BSS`, `BES`, `AORG`, `RORG`, `DORG`, `EVEN`, `IDT`, `DXOP`, `COPY`, and `END`.

## 17.2 Multi-module linking

The extension must support:

- Multiple source files.
- Relocatable modules.
- External symbol definitions through `DEF`.
- External symbol references through `REF`.
- Preassembled object files.
- Library directories.
- Explicit source ordering where required.

## 17.3 Include files

The extension must support:

- `COPY` statements.
- Project-relative includes.
- Workspace-relative includes.
- Configured include paths.
- External shared-library paths.
- Native Windows and POSIX paths.
- TI-style include names where supported by xas99.

## 17.4 Defines

The extension must translate project defines into xas99 define arguments.

Supported values:

- Integer.
- Hexadecimal integer.
- String where supported.
- Boolean translated to `0` or `1`.

## 17.5 Listings and symbols

When enabled, builds must create:

- Assembly listing.
- Symbol table.
- Machine addresses.
- Generated data.
- Cycle-count information when present.
- Source-file boundaries for copied files or macros.

---

# 18. Output Formats

## 18.1 Editor/Assembler object output

Output identifier:

```text
object
```

Expected extension:

```text
.obj
```

Use case:

- Editor/Assembler option 3.
- Linking with other object modules.
- Storing on a disk image.

## 18.2 Editor/Assembler option 5 image

Output identifier:

```text
ea5
```

Expected extensions may include a numbered or sequenced file set.

The extension must:

- Detect all generated image segments.
- Treat them as a related artifact group.
- Add all segments to a disk image in correct order.
- Display the entry point.
- Prevent one segment from overwriting another output.

## 18.3 MAME RPK cartridge

Output identifier:

```text
rpk
```

Expected extension:

```text
.rpk
```

The extension must support:

- Cartridge menu name.
- Entry symbol.
- Automatically generated cartridge header.
- User-supplied cartridge header.
- Artifact inspection.
- Direct MAME launch.

## 18.4 Raw binary cartridge

Output identifier:

```text
bin
```

Expected extension:

```text
.bin
```

The extension must support configurable file naming for:

- CPU ROM.
- Additional ROM banks.
- GROM data in future releases.
- Hardware-specific suffix conventions.

## 18.5 Disk image

Output identifier:

```text
dsk
```

Expected extension:

```text
.dsk
```

The extension must support disk initialization, adding files, replacing files, cataloging, and validating disk images through `xdm99`.

---

# 19. Disk Image Requirements

## 19.1 Disk project configuration

Example:

```json
{
  "projectType": "disk",
  "disk": {
    "image": "dist/myprogram.dsk",
    "createMode": "recreate",
    "geometry": "SSSD",
    "volumeName": "MYDISK",
    "files": [
      {
        "source": "build/myprogram.obj",
        "tiName": "MYPROG-O",
        "format": "DIS/FIX80"
      },
      {
        "source": "build/myprogram",
        "tiName": "MYPROG",
        "format": "PROGRAM"
      }
    ]
  }
}
```

## 19.2 Creation modes

Supported values:

### `recreate`

Create a new blank disk during every package operation.

### `update`

Preserve the existing image and replace configured files.

### `template`

Copy a template image, then add or replace project files.

## 19.3 Disk geometries

Initial supported named geometries:

```text
SSSD
SSDD
DSSD
DSDD
CF
```

The configuration must also permit an explicit geometry string or sector count supported by `xdm99`.

## 19.4 TI file formats

The extension must support:

```text
PROGRAM
DIS/FIX80
DIS/VAR80
INT/FIX
INT/VAR
```

The configuration must allow other xdm99-compatible format strings without requiring an extension release.

## 19.5 Disk filename validation

The extension must validate:

- TI filename length.
- Invalid characters.
- Duplicate TI filenames.
- Files that would overwrite protected template content.
- Missing source artifacts.
- Incompatible file formats.

## 19.6 Disk catalog

The TI-99 sidebar must display:

- Disk volume name.
- Geometry.
- Used sectors.
- Free sectors.
- File names.
- File types.
- Record lengths.
- File sizes.
- Protection status where available.

## 19.7 Disk verification

After modifying a disk, the extension must run a disk check or equivalent validation.

Build must fail if:

- The image is corrupt.
- A required file was not added.
- The disk lacks sufficient capacity.
- xdm99 returns an error.

Warnings may be configurable as build failures.

---

# 20. Emulator Integration

## 20.1 Emulator profile model

```json
{
  "id": "mame-ti994a",
  "name": "MAME TI-99/4A",
  "type": "mame",
  "executable": "C:/Emulators/MAME/mame.exe",
  "workingDirectory": "C:/Emulators/MAME",
  "machine": "ti99_4a",
  "arguments": [],
  "cartridgeArguments": [
    "-cart",
    "${artifact}"
  ],
  "diskArguments": [
    "-flop1",
    "${artifact}"
  ],
  "stopPreviousInstance": true
}
```

## 20.2 Supported profile types

Initial:

```text
mame
classic99
custom
```

Future:

```text
js99er
web994a
remote
```

## 20.3 Variables

Emulator arguments must support:

```text
${workspaceFolder}
${projectName}
${projectFile}
${buildDirectory}
${distributionDirectory}
${artifact}
${artifactDirectory}
${artifactBaseName}
${profile}
${env:VARIABLE_NAME}
```

## 20.4 MAME cartridge launch

The standard cartridge launch must be equivalent to:

```text
mame ti99_4a -cart program.rpk
```

## 20.5 MAME disk launch

MAME disk profiles must permit full hardware configuration, including:

- 32 KB memory expansion.
- Peripheral expansion box.
- Disk controller.
- Editor/Assembler cartridge.
- Floppy drive type.
- Disk image.

The profile must not hard-code a single MAME hardware configuration because users may have different device names, software-list paths, and ROM arrangements.

## 20.6 Classic99 integration

The initial Classic99 implementation may use one of these strategies:

1. Launch Classic99 with supported command-line parameters.
2. Copy artifacts into a configured Classic99 cartridge or FIAD directory.
3. Launch Classic99 and instruct the user to select the new artifact.
4. Use an external reload mechanism if Classic99 exposes one.

The extension must not claim automatic loading unless the selected Classic99 version and configuration have been verified to support it.

## 20.7 Custom emulator

A custom profile must permit:

- Executable path.
- Working directory.
- Argument array.
- Environment variables.
- Artifact selection.
- Cartridge argument template.
- Disk argument template.
- Optional prelaunch command.
- Optional postlaunch command.

## 20.8 Emulator process management

The extension must:

- Track processes it launches.
- Offer `TI-99: Stop Emulator`.
- Avoid terminating emulator instances it did not launch.
- Detect immediate process failure.
- Display exit codes.
- Optionally stop the prior extension-launched instance before restarting.
- Allow multiple instances when configured.

---

# 21. Real Hardware Export

## 21.1 Export command

```text
TI-99: Export to Hardware
```

## 21.2 Initial export destinations

- Folder.
- Removable drive.
- FinalGROM SD-card folder.
- FlashROM-compatible folder.
- User-defined destination.

## 21.3 Export behavior

The extension must:

- Select the correct artifact.
- Validate compatibility with the selected hardware profile.
- Copy related files together.
- Prevent accidental overwrite unless approved.
- Optionally preserve backup copies.
- Verify copied file size.
- Report the destination path.

## 21.4 Hardware profile

Example:

```json
{
  "id": "finalgrom-sd",
  "name": "FinalGROM SD Card",
  "type": "finalgrom",
  "destination": "E:/TI99/CARTRIDGES",
  "artifactFormat": "bin",
  "overwritePolicy": "confirm"
}
```

## 21.5 Validation

Hardware validation should eventually include:

- Maximum supported image size.
- GROM compatibility.
- ROM compatibility.
- Banking compatibility.
- File naming rules.
- Required companion files.

---

# 22. Assembly Language Support

## 22.1 File extensions

The extension must recognize:

```text
.asm
.a99
.s
.inc
```

Users must be able to configure additional extensions.

## 22.2 Syntax highlighting

Highlight categories:

- Labels.
- TMS9900 instructions.
- Operands.
- Registers.
- Numbers.
- Hexadecimal values using `>`.
- Binary values.
- Strings.
- Comments.
- Directives.
- Macro declarations.
- Macro invocations.
- `DEF` and `REF` symbols.
- `COPY` filenames.
- Constants.
- Addressing-mode operators.
- Invalid tokens where detectable.

## 22.3 Language configuration

Provide:

- Line comments.
- Word boundaries.
- Folding.
- Automatic indentation.
- Label indentation behavior.
- Operand-column alignment settings.
- Comment toggling.
- Region folding markers.

## 22.4 Instruction completion

Completion items must include:

- Mnemonic.
- Short description.
- Operand pattern.
- Processor availability.
- Example.
- Cycle information when available.
- Link or command to open full instruction documentation.

Example:

```text
MOV   source,destination
Move Word
```

## 22.5 Directive completion

Must include standard directives such as:

```text
AORG
RORG
DORG
DEF
REF
EQU
DATA
BYTE
TEXT
BSS
BES
EVEN
COPY
END
IDT
DXOP
```

xdt99-specific directives may be presented separately or marked as extensions.

## 22.6 Register completion

Completion values:

```text
R0 through R15
```

When register-prefix mode is disabled, completion may offer numeric register operands contextually.

## 22.7 Symbol completion

The extension must offer symbols from:

- Current file.
- Included files.
- Project files.
- `DEF` symbols.
- Constants defined with `EQU`.
- Labels.
- Configured symbol libraries.

## 22.8 Go to definition

Supported targets:

- Labels.
- `EQU` definitions.
- Macro definitions.
- `DEF` symbols.
- Included files.
- Symbols imported through project modules.

## 22.9 Find references

Find references must locate:

- Instruction operands.
- Branch targets.
- Data references.
- `REF` declarations.
- `DEF` declarations.
- Symbol use in expressions.
- Macro invocations.

## 22.10 Hover information

Hovering over an instruction should show:

- Full instruction name.
- Syntax.
- Description.
- Status flags affected.
- Addressing modes.
- Processor requirements.
- Approximate cycle information where known.

Hovering over a symbol should show:

- Name.
- Kind.
- Definition file.
- Definition line.
- Resolved value or address.
- Export or import status.
- Reference count when available.

## 22.11 Document outline

The Outline view must include:

- Labels.
- Constants.
- Macros.
- Exported symbols.
- Included files.
- Address-origin sections.

## 22.12 Formatting

Configurable formatting options:

```json
{
  "ti99.format.labelColumn": 1,
  "ti99.format.opcodeColumn": 8,
  "ti99.format.operandColumn": 16,
  "ti99.format.commentColumn": 40,
  "ti99.format.uppercaseMnemonics": true,
  "ti99.format.uppercaseRegisters": true,
  "ti99.format.preserveLabelCase": true,
  "ti99.format.useTabs": false
}
```

The formatter must avoid changing string data, comments, or symbol case unless explicitly configured.

## 22.13 Implementation strategy

Phase 1 may use direct `vscode.languages` providers.

A separate language server should be considered when:

- Cross-file parsing becomes complex.
- Incremental analysis is required.
- The parser is intended for reuse outside VS Code.
- Performance becomes difficult to manage in the extension host.

---

# 23. Snippet Requirements

Initial snippets should include:

- Cartridge header.
- Cartridge entry point.
- Workspace initialization.
- VDP register write.
- VDP memory read.
- VDP memory write.
- Screen clear.
- Character pattern load.
- Sprite initialization.
- Sprite movement.
- Keyboard scan.
- Sound list.
- Delay loop.
- Subroutine template.
- Stack setup.
- `DEF` and `REF` module template.
- Interrupt handler.
- Disk program entry.
- Editor/Assembler option 5 entry.
- Data table.
- Text block.
- Byte table.
- Word table.

Each snippet must:

- Include explanatory comments.
- Use placeholders.
- Respect configured syntax mode where practical.
- State hardware requirements when relevant.

---

# 24. Diagnostics

## 24.1 Diagnostic sources

Diagnostics may originate from:

- xas99.
- xdm99.
- Project-schema validation.
- Static language analysis.
- Cartridge validation.
- Disk validation.
- Emulator configuration.
- Hardware-target validation.

## 24.2 Severity levels

```text
Error
Warning
Information
Hint
```

## 24.3 Required diagnostic behavior

Diagnostics must:

- Include the source tool.
- Include file and line when available.
- Include a meaningful message.
- Include the original xdt99 message in details where useful.
- Link to the relevant setting or corrective command when possible.
- Be removed when no longer applicable.

## 24.4 Common diagnostics

Examples:

```text
Unknown symbol: DRAWSPRITE
Unresolved external reference: VMBW
Duplicate symbol: START
Invalid register operand
Address overlap detected
Cartridge code overlaps generated header
Expected output file was not generated
Disk image does not have sufficient free sectors
Python could not be located
xas99 could not be located
MAME executable could not be located
```

## 24.5 Unresolved references

Unresolved references must be configurable because Editor/Assembler programs may intentionally reference routines supplied by the Editor/Assembler environment.

Configuration:

```json
{
  "assembler": {
    "unresolvedReferencePolicy": "warning"
  }
}
```

Supported values:

```text
ignore
information
warning
error
```

---

# 25. TI-99 Sidebar

The extension must add a TI-99 Activity Bar container.

## 25.1 Project view

Display:

- Project name.
- Project type.
- Active build profile.
- Entry source.
- Source modules.
- Include paths.
- Output formats.
- Emulator profile.
- Hardware target.

Actions:

- Build.
- Build and Run.
- Clean.
- Open project configuration.
- Switch build profile.
- Switch emulator.

## 25.2 Symbols view

Display:

- Labels.
- Constants.
- Exported symbols.
- Imported symbols.
- Unresolved symbols.
- Addresses.
- Source locations.

## 25.3 Artifacts view

Display:

- Object files.
- Program images.
- Cartridge images.
- Disk images.
- Listings.
- Symbol files.
- Build logs.

Artifact actions:

- Open.
- Reveal in Explorer.
- Run.
- Export.
- Inspect.
- Delete.
- Copy path.

## 25.4 Disk view

Display:

- Disk metadata.
- Disk catalog.
- File types.
- Free space.
- Validation status.

Actions:

- Refresh catalog.
- Add file.
- Extract file.
- Delete file.
- Rename file.
- Validate disk.
- Open containing folder.

Direct disk editing may be postponed until a later release. The first release may provide read-only catalog display plus project-driven packaging.

---

# 26. Status Bar

The status bar must display:

```text
TI-99: Debug | Build Ready
```

Possible states:

```text
No TI Project
Toolchain Missing
Configuration Error
Ready
Building
Build Succeeded
Build Failed
Running
```

Clicking the status item should open a relevant command:

- Configure toolchain.
- Show errors.
- Build.
- Show build output.
- Select active project.

---

# 27. Build Output Channel

The extension must create a dedicated output channel:

```text
TI-99 Build
```

Each operation must include:

- Timestamp.
- Project name.
- Build profile.
- Tool being run.
- Executable path.
- Argument list, with safe redaction where necessary.
- Working directory.
- Standard output.
- Standard error.
- Exit code.
- Elapsed build time.
- Generated artifacts.

Example:

```text
[10:42:01] Building My TI Game [debug]
[10:42:01] xas99: assembling 3 source files
[10:42:02] xas99 completed with exit code 0
[10:42:02] Generated dist/mytigame.rpk
[10:42:02] Generated build/mytigame.lst
[10:42:02] Build succeeded in 1.18 seconds
```

---

# 28. Listing Viewer

## 28.1 Initial implementation

Open the generated listing as a normal read-only text document.

## 28.2 Enhanced implementation

Provide synchronized navigation:

- Clicking listing line opens source.
- Clicking source command finds listing line.
- Highlight generated bytes.
- Show calculated address.
- Show cycle estimate.
- Show macro or copied-source origin.
- Filter by source file.
- Search by address or symbol.

---

# 29. Symbol and Memory Map Viewer

## 29.1 Symbol table

Columns:

- Symbol.
- Value.
- Hex value.
- Type.
- Definition file.
- Definition line.
- Exported.
- Imported.
- References.

## 29.2 Memory map

Display address ranges for:

- Cartridge ROM.
- Cartridge banks.
- Expansion RAM.
- Scratchpad RAM.
- VDP memory references where inferable.
- Data segments.
- BSS segments.
- Relocatable segments.
- Reserved ranges.
- Generated cartridge header.

## 29.3 Validation

The memory-map analyzer should detect:

- Overlapping absolute segments.
- Output outside configured cartridge range.
- Code overlapping generated headers.
- Bank overflow.
- Empty entry segment.
- Missing entry point.
- Suspicious writes into ROM ranges where statically detectable.

Static analysis results must be labeled as warnings when runtime behavior cannot be proven.

## 29.4 UI technology

Use a native Tree View or table where possible.

Use a webview only for visual layouts such as graphical bank maps. Theme, keyboard, and accessibility support are required.

---

# 30. Project Import

## 30.1 Command

```text
TI-99: Import Existing Assembly Project
```

## 30.2 Import behavior

The import process must:

1. Select the project folder.
2. Scan for assembly files.
3. Detect likely entry source.
4. Detect `COPY` references.
5. Detect `DEF` and `REF` use.
6. Ask for the intended output type.
7. Ask for the register syntax.
8. Generate `ti99-project.json`.
9. Perform a dry-run build.
10. Present unresolved configuration issues.

## 30.3 Import restrictions

The extension must not modify original assembly source unless the user explicitly requests a conversion.

---

# 31. Cartridge Validation

Before creating or launching a cartridge, validate:

- Menu name is present when required.
- Entry symbol can be resolved.
- Entry address is executable.
- Required cartridge header exists or can be generated.
- Application data does not conflict with generated header space.
- Output size fits selected target.
- Bank count is valid.
- Bank size is valid.
- No output files overwrite one another.
- Requested artifact was produced.

Warnings should include actionable corrections.

Example:

```text
Cartridge data begins at >6000, but xas99 may generate a header through >602F.
Move the first application segment to >6030 or provide a custom header.
```

---

# 32. Security Requirements

## 32.1 Workspace Trust

The extension must respect VS Code Workspace Trust.

In an untrusted workspace, the extension must not:

- Run xdt99.
- Run Python.
- Launch an emulator.
- Run prebuild or postbuild commands.
- Copy artifacts to external devices.
- Execute project-specified commands.

## 32.2 Command execution

The extension must:

- Pass executable and arguments separately.
- Avoid shell interpolation unless explicitly required.
- Escape user-controlled values.
- Display custom commands before first execution.
- Require trust for project-defined scripts.
- Avoid automatically executing code on project open.

## 32.3 File operations

The extension must:

- Normalize paths.
- Prevent directory traversal.
- Confirm destructive external operations.
- Avoid overwriting source files with generated artifacts.
- Avoid deleting outside approved build directories.
- Handle symbolic links safely.

## 32.4 Download security

If managed downloads are later supported:

- Use HTTPS.
- Verify release source.
- Verify checksum where available.
- Record installed version.
- Require explicit consent.
- Provide uninstall and rollback.

---

# 33. Performance Requirements

- Extension activation must not noticeably delay normal VS Code startup.
- TI-specific activation should occur only when a TI project or supported source file is opened.
- Initial project parsing should complete within two seconds for typical projects.
- Editing diagnostics should be debounced.
- Language analysis must not block the extension host.
- Long builds must support cancellation.
- The extension must remain responsive while xdt99 runs.
- Symbol indexing should be incremental.
- Generated folders should be excluded from source indexing.
- Large listing files should be opened lazily.
- Emulator output must not flood the extension host without limits.

---

# 34. Reliability Requirements

- Every external process invocation must capture exit status.
- A zero exit code must not be the only success condition.
- Expected output files must be verified.
- Partial build outputs must not be mistaken for successful outputs.
- Failed packaging must not launch an old artifact.
- The build coordinator must track artifact timestamps or build identifiers.
- Cancellation must terminate the active tool process when possible.
- A failed emulator launch must not mark the build as failed if compilation succeeded.
- The UI must distinguish Build Failed from Launch Failed.
- Existing user disk images must be backed up or copied before destructive modification when configured.

---

# 35. Logging and Troubleshooting

## 35.1 Log levels

```text
Error
Warning
Information
Debug
Trace
```

## 35.2 Diagnostic report command

```text
TI-99: Create Diagnostic Report
```

The report should include:

- Extension version.
- VS Code version.
- Operating system.
- Python path and version.
- xdt99 path and version.
- Project type.
- Sanitized project configuration.
- Emulator profile type.
- Recent build command.
- Recent process exit codes.
- Recent extension errors.

The report must not include:

- Unrelated environment variables.
- User credentials.
- Full home-directory contents.
- ROM data.
- Source code unless explicitly selected.

---

# 36. Testing Requirements

## 36.1 Unit tests

Test:

- Project-schema parsing.
- Path resolution.
- Variable substitution.
- Command argument construction.
- xdt99 output parsing.
- Diagnostic conversion.
- Disk configuration validation.
- Cartridge validation.
- Symbol parsing.
- Listing parsing.
- Safe-clean path validation.
- Emulator profile resolution.

## 36.2 Integration tests

Test with real xdt99:

- Single-file object build.
- Multi-file linked build.
- Include-path build.
- RPK generation.
- BIN generation.
- Editor/Assembler option 5 generation.
- Disk creation.
- Disk file insertion.
- Disk catalog.
- Disk validation.
- Failed assembly.
- Unresolved reference.
- Invalid include.
- Missing Python.
- Missing xdt99.
- Cancelled build.

## 36.3 Emulator tests

Test:

- MAME cartridge launch.
- MAME disk launch.
- Invalid executable.
- Invalid working directory.
- Missing cartridge.
- Missing disk.
- Stop launched emulator.
- Restart prior emulator instance.
- Custom argument substitution.

## 36.4 Platform tests

Automated or manual testing on:

- Windows 11.
- Windows 10 where feasible.
- Current macOS.
- Ubuntu LTS.
- Paths containing spaces.
- Paths containing parentheses.
- Non-ASCII project paths where supported.
- Multi-root workspaces.

## 36.5 Extension tests

Use the official VS Code extension-testing framework to:

- Activate the extension.
- Open sample projects.
- Execute commands.
- Verify tasks.
- Verify diagnostics.
- Verify Tree Views.
- Validate settings.
- Confirm untrusted-workspace restrictions.

---

# 37. Acceptance Criteria for Version 1.0

Version 1.0 is acceptable when all of the following are true.

## 37.1 Installation

- The extension installs from a VSIX package or Marketplace listing.
- The extension detects or accepts a configured Python installation.
- The extension detects or accepts a configured xdt99 installation.
- Toolchain status correctly reports missing and working dependencies.

## 37.2 Project creation

- A user can create a cartridge project.
- A user can create a disk project.
- A user can create an Editor/Assembler object project.
- Generated sample projects assemble without manual source edits.
- Generated configuration passes schema validation.

## 37.3 Cartridge workflow

- A cartridge project builds an RPK.
- The RPK launches in configured MAME.
- A cartridge project can also produce a raw binary.
- Build errors appear in the Problems panel.
- The generated listing can be opened.

## 37.4 Disk workflow

- A disk project creates a valid disk image.
- The expected compiled file appears in the disk catalog.
- The disk can be launched through a configured MAME profile.
- Disk packaging failure prevents emulator launch.

## 37.5 Editing

- Assembly files receive syntax highlighting.
- Common instructions and directives receive completion.
- Labels appear in the document outline.
- Go to definition works for same-project labels.
- Hover documentation works for supported instructions.
- Included files can be opened from `COPY` statements.

## 37.6 Build operations

- Build works through the Command Palette.
- Build works through a VS Code task.
- Build and Run works.
- Rebuild works.
- Clean removes only generated files.
- Cancellation stops an active build.
- The extension never launches a stale artifact after a failed build.

## 37.7 Stability

- No uncaught exception occurs during normal workflows.
- Opening a non-TI workspace does not produce warnings.
- The extension does not execute tools in an untrusted workspace.
- Windows paths containing spaces build successfully.

---

# 38. Recommended Development Phases

## Phase 1: Foundation

Deliver:

- TypeScript extension shell.
- Project detection.
- JSON schema.
- Toolchain configuration.
- Python and xdt99 discovery.
- Output channel.
- Basic commands.
- Basic cartridge template.
- Basic object template.

## Phase 2: Build pipeline

Deliver:

- xas99 adapter.
- Multi-source build.
- Link support.
- Listings.
- Symbols.
- Diagnostics parser.
- Build, rebuild, and clean.
- VS Code Task Provider.

## Phase 3: Cartridge packaging

Deliver:

- RPK output.
- Raw BIN output.
- Cartridge configuration.
- Cartridge validation.
- Artifact sidebar.
- MAME cartridge launch.

## Phase 4: Disk packaging

Deliver:

- xdm99 adapter.
- Disk initialization.
- Add-file operations.
- Disk validation.
- Disk catalog parser.
- MAME disk launch.
- Editor/Assembler object and option 5 templates.

## Phase 5: Language tooling

Deliver:

- Complete grammar.
- Instruction database.
- Directive database.
- Completion.
- Hover.
- Go to definition.
- Find references.
- Workspace symbols.
- Formatting.
- Snippets.

## Phase 6: Professional UI

Deliver:

- TI-99 Activity Bar.
- Project view.
- Artifact view.
- Symbol view.
- Disk catalog view.
- Memory-map view.
- Toolchain status interface.
- Status bar integration.

## Phase 7: Hardware export

Deliver:

- Folder export.
- FinalGROM profile.
- FlashROM profile.
- Removable-drive detection.
- Compatibility warnings.
- Copy verification.

## Phase 8: Advanced tooling

Potential deliverables:

- GPL projects through `xga99`.
- HFE images through `xhm99`.
- CF7+/nanoPEB volumes through `xvm99`.
- Sprite editor.
- Character-set editor.
- Screen editor.
- Sound editor.
- Asset converters.
- Cartridge bank editor.

## Phase 9: Debugging

Potential deliverables:

- Debug Adapter Protocol implementation.
- Emulator communication.
- Address breakpoints.
- Register inspection.
- Memory inspection.
- Source-address mapping.
- Step and continue.
- VDP memory inspection.

---

# 39. Proposed Source-Code Organization

```text
ti99-vscode/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts
│   ├── commands/
│   │   ├── buildCommand.ts
│   │   ├── runCommand.ts
│   │   ├── cleanCommand.ts
│   │   ├── createProjectCommand.ts
│   │   └── configureToolchainCommand.ts
│   ├── project/
│   │   ├── projectManager.ts
│   │   ├── projectLoader.ts
│   │   ├── projectValidator.ts
│   │   ├── projectTypes.ts
│   │   └── variableResolver.ts
│   ├── build/
│   │   ├── buildCoordinator.ts
│   │   ├── buildContext.ts
│   │   ├── buildResult.ts
│   │   ├── artifactRegistry.ts
│   │   └── cleanService.ts
│   ├── toolchain/
│   │   ├── pythonLocator.ts
│   │   ├── xdt99Locator.ts
│   │   ├── processRunner.ts
│   │   ├── xas99Adapter.ts
│   │   ├── xdm99Adapter.ts
│   │   └── toolchainStatus.ts
│   ├── diagnostics/
│   │   ├── xas99Parser.ts
│   │   ├── xdm99Parser.ts
│   │   ├── diagnosticManager.ts
│   │   └── problemMatcher.ts
│   ├── language/
│   │   ├── parser/
│   │   ├── providers/
│   │   ├── instructionDatabase.ts
│   │   ├── directiveDatabase.ts
│   │   └── symbolIndex.ts
│   ├── emulators/
│   │   ├── emulatorManager.ts
│   │   ├── mameAdapter.ts
│   │   ├── classic99Adapter.ts
│   │   └── customEmulatorAdapter.ts
│   ├── disk/
│   │   ├── diskPackager.ts
│   │   ├── diskCatalogParser.ts
│   │   └── diskValidator.ts
│   ├── cartridge/
│   │   ├── cartridgePackager.ts
│   │   ├── cartridgeValidator.ts
│   │   └── bankAnalyzer.ts
│   ├── views/
│   │   ├── projectTreeProvider.ts
│   │   ├── artifactTreeProvider.ts
│   │   ├── symbolTreeProvider.ts
│   │   └── diskTreeProvider.ts
│   └── common/
│       ├── logger.ts
│       ├── paths.ts
│       ├── cancellation.ts
│       └── errors.ts
├── syntaxes/
│   └── ti99-assembly.tmLanguage.json
├── language-configuration.json
├── schemas/
│   └── ti99-project.schema.json
├── snippets/
│   └── ti99-assembly.json
├── templates/
│   ├── cartridge/
│   ├── disk/
│   ├── ea-object/
│   └── ea-option5/
├── test/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── docs/
```

---

# 40. Core TypeScript Interfaces

## 40.1 Project configuration

```typescript
export interface Ti99ProjectConfiguration {
  version: number;
  name: string;
  description?: string;
  projectType: Ti99ProjectType;
  entrySource: string;
  sources?: string[];
  includePaths?: string[];
  defines?: Record<string, string | number | boolean>;
  assembler: AssemblerConfiguration;
  linker?: LinkerConfiguration;
  output: OutputConfiguration;
  cartridge?: CartridgeConfiguration;
  disk?: DiskConfiguration;
  emulator?: ProjectEmulatorConfiguration;
  profiles?: Record<string, Partial<Ti99ProjectConfiguration>>;
}
```

## 40.2 Build result

```typescript
export interface BuildResult {
  succeeded: boolean;
  cancelled: boolean;
  profile: string;
  startedAt: Date;
  completedAt: Date;
  exitCode?: number;
  diagnostics: BuildDiagnostic[];
  artifacts: BuildArtifact[];
  commands: ExecutedToolCommand[];
}
```

## 40.3 Artifact

```typescript
export interface BuildArtifact {
  id: string;
  type:
    | "object"
    | "ea5"
    | "rpk"
    | "bin"
    | "dsk"
    | "listing"
    | "symbols"
    | "log";
  path: string;
  displayName: string;
  createdAt: Date;
  size: number;
  runnable: boolean;
  exportable: boolean;
  relatedArtifactIds?: string[];
}
```

## 40.4 Tool result

```typescript
export interface ToolExecutionResult {
  executable: string;
  args: string[];
  workingDirectory: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  cancelled: boolean;
  durationMilliseconds: number;
}
```

---

# 41. Example Build Pipelines

## 41.1 RPK cartridge pipeline

```text
Validate project
    ↓
Resolve source files
    ↓
Invoke xas99 with cartridge output
    ↓
Generate listing and symbols
    ↓
Verify RPK exists
    ↓
Validate cartridge metadata
    ↓
Register artifact
    ↓
Optionally launch MAME
```

Conceptual xdt99 operation:

```text
xas99.py source.asm -R -c -n "PROGRAM NAME" -L build/program.lst -S -o dist/program.rpk
```

Exact option ordering and output handling must be generated through the toolchain adapter and verified against the installed xdt99 version.

## 41.2 Raw cartridge pipeline

```text
Validate project
    ↓
Assemble and link
    ↓
Generate raw binary
    ↓
Validate size and memory layout
    ↓
Rename according to target profile
    ↓
Register artifact
```

## 41.3 Editor/Assembler object disk pipeline

```text
Assemble object file
    ↓
Create or copy disk image
    ↓
Add object file as DIS/FIX80
    ↓
Validate disk
    ↓
Read catalog
    ↓
Register disk artifact
    ↓
Launch MAME with E/A cartridge and disk
```

## 41.4 Editor/Assembler option 5 disk pipeline

```text
Assemble option 5 images
    ↓
Detect all generated image segments
    ↓
Create or copy disk image
    ↓
Add every image segment as PROGRAM
    ↓
Validate image sequence
    ↓
Validate disk
    ↓
Launch configured emulator
```

---

# 42. Error Handling Model

All internal errors should derive from a common extension error model.

```typescript
export interface Ti99ExtensionError {
  code: string;
  category:
    | "configuration"
    | "toolchain"
    | "assembly"
    | "link"
    | "package"
    | "disk"
    | "emulator"
    | "filesystem"
    | "internal";
  message: string;
  details?: string;
  file?: string;
  line?: number;
  recoverable: boolean;
  recommendedCommand?: string;
}
```

Example error codes:

```text
TI99_CONFIG_INVALID
TI99_PYTHON_NOT_FOUND
TI99_XDT99_NOT_FOUND
TI99_XDT99_INCOMPATIBLE
TI99_XAS99_FAILED
TI99_XDM99_FAILED
TI99_OUTPUT_MISSING
TI99_DISK_FULL
TI99_CARTRIDGE_OVERFLOW
TI99_ENTRY_SYMBOL_MISSING
TI99_EMULATOR_NOT_FOUND
TI99_EMULATOR_LAUNCH_FAILED
TI99_WORKSPACE_UNTRUSTED
TI99_BUILD_CANCELLED
```

User-facing errors must explain both what failed and what action is likely to fix it.

Bad:

```text
Process failed.
```

Good:

```text
xas99 could not be started because Python was not found.

Select a Python 3 installation with:
TI-99: Configure Toolchain
```

---

# 43. Documentation Requirements

The extension must include:

- Getting Started.
- Installing Python.
- Installing xdt99.
- Configuring MAME.
- Configuring Classic99.
- Creating a cartridge project.
- Creating a disk project.
- Importing existing code.
- Project configuration reference.
- Build-profile reference.
- Emulator-profile reference.
- Real-hardware export guide.
- TMS9900 instruction reference.
- Common assembly errors.
- Troubleshooting.
- License and attribution notices.

Every generated starter project must contain a README describing:

- How to build.
- How to run.
- Output locations.
- Project type.
- Required emulator configuration.
- Real-hardware considerations.

---

# 44. Distribution and Licensing Requirements

The extension should initially be distributed separately from xdt99.

The extension repository must include:

- Its own license.
- Clear xdt99 attribution.
- A statement that xdt99 is a separate project.
- A link or command directing users to official xdt99 installation information.
- No implied endorsement by Texas Instruments, xdt99 maintainers, MAME, or Classic99.
- Trademark acknowledgments where appropriate.

If xdt99 is later bundled:

- Include all required GPL notices.
- Preserve copyright notices.
- Provide corresponding source as required.
- Document any modifications.
- Review the combined distribution structure with qualified legal counsel.

---

# 45. Recommended Version 1 Scope

The recommended version 1 scope is:

1. Windows-first VS Code desktop extension.
2. External Python and xdt99 installation.
3. Cartridge, disk, E/A object, and E/A option 5 project templates.
4. xas99 assembly and linking.
5. xdm99 disk creation.
6. RPK, BIN, OBJ, EA5, and DSK outputs.
7. MAME integration.
8. Configurable custom emulator integration.
9. Basic Classic99 export and launch support.
10. Syntax highlighting.
11. Instruction and directive completion.
12. Same-project symbol navigation.
13. Problems-panel diagnostics.
14. Build listings and symbol display.
15. Project and artifact sidebar.
16. Build, clean, rebuild, run, and build-and-run commands.
17. VS Code Task Provider.
18. Workspace Trust enforcement.
19. Automated unit and integration testing.

The following should be deferred until after version 1:

- GPL development.
- Mixed Assembly/GPL cartridges.
- F18A asset support.
- Graphical sprite editor.
- Graphical character editor.
- Source-level debugging.
- Managed xdt99 downloading.
- Web-based emulator embedding.
- Full hardware bank-layout designer.

---

# 46. Final Product Definition

The completed version 1 product should allow a user to install the extension, configure Python, xdt99, and an emulator, then perform the following workflow without manually using a command prompt:

```text
TI-99: Create New Project
    ↓
Select Cartridge Program
    ↓
Edit src/main.asm
    ↓
Press Build and Run
    ↓
Extension invokes xas99
    ↓
Extension creates an RPK
    ↓
Extension reports errors or success
    ↓
Extension launches the cartridge in MAME
```

For a disk program:

```text
TI-99: Create New Project
    ↓
Select Editor/Assembler Disk Program
    ↓
Edit source files
    ↓
Press Build and Run
    ↓
Extension assembles the program
    ↓
Extension creates a TI disk image
    ↓
Extension inserts the compiled files
    ↓
Extension validates the disk
    ↓
Extension launches the configured E/A environment
```

The extension’s central value is not replacing xdt99. Its value is turning xdt99 into a cohesive, approachable, professional TI-99/4A development environment within Visual Studio Code.
