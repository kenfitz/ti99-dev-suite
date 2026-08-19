import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { DEFAULT_PROJECT, defaultUnresolvedPolicy } from '../config/project';
import type { Capability, ProjectConfig, ProjectType } from '../config/project';
import { PROJECT_FILENAME } from '../config/loader';
import { DIALECTS, detectDialect } from '../lang/dialect';
import type { SyntaxDialect } from '../lang/dialect';

interface TypeChoice extends vscode.QuickPickItem {
    type: ProjectType;
    outputs: Capability[];
    emulator: string;
}

interface DialectChoice extends vscode.QuickPickItem {
    id: SyntaxDialect;
}

const TYPE_CHOICES: TypeChoice[] = [
    {
        label: 'Cartridge',
        detail: 'ROM at >6000. Produces an RPK for MAME and a padded .BIN for Classic99. No 32K expansion needed.',
        type: 'cartridge-rpk',
        outputs: ['cart-rpk', 'cart-bin'],
        emulator: 'mame-cart',
    },
    {
        label: 'Editor/Assembler option 5 program',
        detail: 'Memory image loaded from disk by the E/A cartridge. Requires 32K expansion. Auto-starts.',
        type: 'ea5-image',
        outputs: ['ea5-image', 'tifiles', 'disk-image'],
        emulator: 'classic99-disk',
    },
    {
        label: 'Editor/Assembler option 3 object',
        detail: 'Tagged object file loaded by the E/A linking loader. The cartridge supplies VSBW, VMBW and KSCAN.',
        type: 'ea3-object',
        outputs: ['ea3-object', 'tifiles', 'disk-image'],
        emulator: 'classic99-disk',
    },
    {
        label: 'Disk project',
        detail: 'Builds a TI disk image containing your program plus any extra files.',
        type: 'disk',
        outputs: ['ea5-image', 'disk-image'],
        emulator: 'mame-disk',
    },
];

const DIALECT_CHOICES: DialectChoice[] = (['xdt99', 'ea', 'relaxed'] as SyntaxDialect[]).map(id => ({
    label: DIALECTS[id].label,
    detail: DIALECTS[id].description,
    id,
}));

export async function createProject(): Promise<void> {
    const folder = await pickFolder('Where should the project be created?');
    if (!folder) return;

    const name = await vscode.window.showInputBox({
        title: 'Project name',
        prompt: 'Used for output filenames and the cartridge menu entry.',
        value: path.basename(folder.fsPath),
        validateInput: v => /^[\w][\w .-]{0,39}$/.test(v) ? undefined : 'Use letters, digits, spaces, dots, hyphens or underscores.',
    });
    if (!name) return;

    const typeChoice = await vscode.window.showQuickPick<TypeChoice>(TYPE_CHOICES, {
        title: 'What are you building?',
        matchOnDetail: true,
    });
    if (!typeChoice) return;

    const dialectChoice = await vscode.window.showQuickPick<DialectChoice>(DIALECT_CHOICES, {
        title: 'Which assembly syntax?',
        matchOnDetail: true,
    });
    if (!dialectChoice) return;

    const configPath = path.join(folder.fsPath, PROJECT_FILENAME);
    if (fs.existsSync(configPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `${PROJECT_FILENAME} already exists in that folder.`, { modal: true }, 'Overwrite');
        if (overwrite !== 'Overwrite') return;
    }

    const stem = name.replace(/[^\w.-]/g, '_');

    const config: ProjectConfig = {
        ...DEFAULT_PROJECT,
        name,
        type: typeChoice.type,
        syntaxDialect: dialectChoice.id,
        outputs: typeChoice.outputs,
        emulatorProfile: typeChoice.emulator,
        entrySource: 'src/main.a99',
        sources: ['src/main.a99'],
        cartridge: typeChoice.type.startsWith('cartridge')
            ? {
                name: name.toUpperCase().slice(0, 20),
                baseAddress: '>6000',
                banking: 'none',
                binFilename: `${stem.toUpperCase().slice(0, 9)}C.BIN`,
            }
            : undefined,
        disk: typeChoice.outputs.includes('disk-image')
            ? {
                geometry: 'sssd',
                volumeName: stem.toUpperCase().slice(0, 10),
                files: [
                    {
                        artifact: typeChoice.type === 'ea3-object' ? 'ea3-object' : 'ea5-image',
                        tiName: stem.toUpperCase().slice(0, 10),
                        format: typeChoice.type === 'ea3-object' ? 'DIS/FIX 80' : 'PROGRAM',
                    },
                ],
            }
            : undefined,
        assembler: {
            unresolvedReferencePolicy: defaultUnresolvedPolicy(typeChoice.type),
            extraArgs: [],
        },
    };

    fs.mkdirSync(path.join(folder.fsPath, 'src'), { recursive: true });
    fs.mkdirSync(path.join(folder.fsPath, 'lib'), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

    const mainPath = path.join(folder.fsPath, 'src', 'main.a99');
    if (!fs.existsSync(mainPath)) {
        fs.writeFileSync(mainPath, starterSource(config), 'utf8');
    }

    const readmePath = path.join(folder.fsPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, starterReadme(config, typeChoice), 'utf8');
    }

    fs.writeFileSync(path.join(folder.fsPath, '.gitignore'), `${config.buildDir}/\n${config.distDir}/\n`, 'utf8');

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(mainPath));
    await vscode.window.showTextDocument(doc);

    const openFolder = await vscode.window.showInformationMessage(
        `Created ${name}. Press F5 to build and run.`, 'Open Folder');
    if (openFolder === 'Open Folder') {
        await vscode.commands.executeCommand('vscode.openFolder', folder, { forceNewWindow: false });
    }
}

export async function importProject(): Promise<void> {
    const folder = await pickFolder('Which folder contains your existing source?');
    if (!folder) return;

    const sources = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*.{a99,asm,s,A99,ASM,S}'),
        '**/{node_modules,build,dist}/**',
        200);

    if (sources.length === 0) {
        void vscode.window.showWarningMessage('No .a99, .asm or .s files were found in that folder.');
        return;
    }

    // Detect the dialect from the largest source, which is usually the main one.
    let sample = '';
    let sampleUri = sources[0];
    let largest = -1;
    for (const uri of sources.slice(0, 40)) {
        try {
            const st = fs.statSync(uri.fsPath);
            if (st.size > largest) {
                largest = st.size;
                sampleUri = uri;
            }
        } catch { /* skip */ }
    }
    try {
        sample = fs.readFileSync(sampleUri.fsPath, 'utf8');
    } catch { /* leave empty */ }

    const detected = detectDialect(sample);

    const picked = await vscode.window.showQuickPick(
        sources.map(uri => ({
            label: path.relative(folder.fsPath, uri.fsPath),
            picked: uri.toString() === sampleUri.toString(),
            uri,
        })),
        { title: 'Which file is the entry point?', canPickMany: false });
    if (!picked) return;

    const typeChoice = await vscode.window.showQuickPick<TypeChoice>(TYPE_CHOICES, {
        title: 'What should this build as?',
        matchOnDetail: true,
    });
    if (!typeChoice) return;

    const dialectChoice = await vscode.window.showQuickPick<DialectChoice>(
        DIALECT_CHOICES.map(c => ({
            ...c,
            description: c.id === detected.dialect ? `detected — ${detected.reason}` : undefined,
        })).sort((a, b) => (a.id === detected.dialect ? -1 : b.id === detected.dialect ? 1 : 0)),
        { title: 'Which assembly syntax?', matchOnDetail: true });
    if (!dialectChoice) return;

    const name = path.basename(folder.fsPath);
    const stem = name.replace(/[^\w.-]/g, '_');
    const entry = path.relative(folder.fsPath, picked.uri.fsPath).replace(/\\/g, '/');

    const config: ProjectConfig = {
        ...DEFAULT_PROJECT,
        name,
        type: typeChoice.type,
        syntaxDialect: dialectChoice.id,
        entrySource: entry,
        sources: [entry],
        includePaths: ['.', path.dirname(entry) || '.'],
        outputs: typeChoice.outputs,
        emulatorProfile: typeChoice.emulator,
        cartridge: typeChoice.type.startsWith('cartridge')
            ? {
                name: name.toUpperCase().slice(0, 20),
                baseAddress: '>6000',
                banking: 'none',
                binFilename: `${stem.toUpperCase().slice(0, 9)}C.BIN`,
            }
            : undefined,
        assembler: {
            unresolvedReferencePolicy: defaultUnresolvedPolicy(typeChoice.type),
            extraArgs: [],
        },
    };

    const configPath = path.join(folder.fsPath, PROJECT_FILENAME);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

    // Nothing in the existing tree is moved, renamed or rewritten.
    void vscode.window.showInformationMessage(
        `Imported ${name} as ${DIALECTS[dialectChoice.id].label}. ` +
        `No source files were modified.`);

    if (dialectChoice.id !== 'ea' && detected.dialect === 'ea') {
        const choice = await vscode.window.showWarningMessage(
            `${detected.reason} You chose ${DIALECTS[dialectChoice.id].label}, so the build will fail on those lines.`,
            'Check for Hazards', 'Switch to strict');
        if (choice === 'Check for Hazards') {
            const doc = await vscode.workspace.openTextDocument(picked.uri);
            await vscode.window.showTextDocument(doc);
            await vscode.commands.executeCommand('ti99.checkHazards');
        } else if (choice === 'Switch to strict') {
            config.syntaxDialect = 'ea';
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
        }
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
    await vscode.window.showTextDocument(doc);
}

interface FolderChoice extends vscode.QuickPickItem {
    current: boolean;
}

async function pickFolder(title: string): Promise<vscode.Uri | undefined> {
    const workspace = vscode.workspace.workspaceFolders;
    if (workspace && workspace.length === 1) {
        const useCurrent = await vscode.window.showQuickPick<FolderChoice>([
            { label: `Use the current folder`, detail: workspace[0].uri.fsPath, current: true },
            { label: 'Choose another folder...', current: false },
        ], { title });
        if (!useCurrent) return undefined;
        if (useCurrent.current) return workspace[0].uri;
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title,
        openLabel: 'Select',
    });
    return picked?.[0];
}

function starterSource(config: ProjectConfig): string {
    const cart = config.type.startsWith('cartridge');

    if (cart) {
        return `*----------------------------------------------------------------------
* ${config.name}
*
* Build: TI-99: Build       Run: TI-99: Build and Run (F5)
*----------------------------------------------------------------------
       DEF  STDHDR

VDPWD  EQU  >8C00                * VDP write data
VDPWA  EQU  >8C02                * VDP set address
WRKSP  EQU  >8300                * Scratchpad workspace, no wait states

       AORG >6000

STDHDR BYTE >AA                  * Standard header marker
       BYTE >01                  * Version
       BYTE >01                  * One program
       BYTE >00                  * Reserved
       DATA >0000                * Power-up list
       DATA PROG                 * Program list
       DATA >0000                * DSR list
       DATA >0000                * Subprogram list
       DATA >0000                * ISR list

PROG   DATA >0000                * No next item
       DATA MAIN                 * Entry point
       BYTE ${String(config.cartridge?.name.length ?? 8).padEnd(2)}                    * Menu text length
       TEXT '${config.cartridge?.name ?? 'MY PROGRAM'}'
       EVEN

MAIN   LIMI 0                    * Interrupts off during setup
       LWPI WRKSP                * Our own workspace
       CLR  R0
       MOVB R0,@>837A            * No sprites in automatic motion

       LI   R1,REGLD             * Load the VDP registers
       LI   R2,>8000
REGLP  MOVB *R1+,R3
       MOVB R3,@VDPWA
       MOVB R2,@VDPWA
       AI   R2,>0100
       CI   R2,>8800
       JL   REGLP

       LI   R0,>4000             * Clear the screen
       SWPB R0
       MOVB R0,@VDPWA
       SWPB R0
       MOVB R0,@VDPWA
       LI   R1,>2000
       LI   R2,24*32
CLRLP  MOVB R1,@VDPWD
       DEC  R2
       JNE  CLRLP

       LI   R0,10*32+9           * Row 10, column 9
       ORI  R0,>4000
       SWPB R0
       MOVB R0,@VDPWA
       SWPB R0
       MOVB R0,@VDPWA
       LI   R1,MSG
       LI   R2,MSGL
MSGLP  MOVB *R1+,@VDPWD
       DEC  R2
       JNE  MSGLP

HALT   JMP  HALT

REGLD  BYTE >00                  * R0: graphics I
       BYTE >E0                  * R1: 16K, display on, interrupts on
       BYTE >00                  * R2: screen image at >0000
       BYTE >0E                  * R3: colour table at >0380
       BYTE >01                  * R4: pattern table at >0800
       BYTE >06                  * R5: sprite attributes at >0300
       BYTE >00                  * R6: sprite patterns at >0000
       BYTE >07                  * R7: white on cyan
       EVEN

MSG    TEXT 'HELLO TI-99/4A'
MSGL   EQU  $-MSG
       EVEN

       END  MAIN
`;
    }

    return `*----------------------------------------------------------------------
* ${config.name}
*
* Build: TI-99: Build       Run: TI-99: Build and Run (F5)
*
* The Editor/Assembler cartridge supplies these utilities, so the
* "unresolved references" warning for them is expected.
*----------------------------------------------------------------------
       REF  VMBW,KSCAN
       DEF  START

WRKSP  EQU  >8300                * Scratchpad workspace

       AORG >A000

SFIRST EQU  $                    * First byte saved in the image

START  LIMI 0
       LWPI WRKSP

       LI   R0,10*32+9           * Row 10, column 9
       LI   R1,MSG
       LI   R2,MSGL
       BLWP @VMBW

WAIT   CLR  R0                   * Wait for a keypress
       MOVB R0,@>8374
       BLWP @KSCAN
       MOVB @>837C,R0
       COC  @KEYMSK,R0
       JNE  WAIT

       LIMI 2
       B    @>0070               * Back to the E/A menu

KEYMSK DATA >2000
MSG    TEXT 'HELLO TI-99/4A'
MSGL   EQU  $-MSG
       EVEN

SLAST  EQU  $                    * Last byte saved
SLOAD  EQU  SFIRST
       END  START
`;
}

function starterReadme(config: ProjectConfig, choice: TypeChoice): string {
    return `# ${config.name}

${choice.detail}

## Build

| Action | Command |
|---|---|
| Build | \`TI-99: Build\` or Ctrl+Shift+B |
| Build and run | \`TI-99: Build and Run\` or F5 |
| Clean | \`TI-99: Clean\` |

## Outputs

Artifacts land in \`${config.distDir}/\`; listings and symbol files in \`${config.buildDir}/\`.

${config.outputs.map(o => `- \`${o}\``).join('\n')}

## Syntax dialect

This project is set to **${DIALECTS[config.syntaxDialect].label}**.

${DIALECTS[config.syntaxDialect].description}

The comment field begins at ${DIALECTS[config.syntaxDialect].commentRule}. If you
paste in code written for a different assembler, run
\`TI-99: Check for Dialect Hazards\` before building.

## Emulator

Set the emulator path in Settings under **TI-99: Emulators**. This project
defaults to the \`${choice.emulator}\` profile.

Cartridge ROMs, Editor/Assembler images and console ROMs are not distributed
with the extension. Point the settings at your own copies.

## Real hardware

The build outputs are standard formats and work on original hardware:
FinalGROM 99 and FlashROM 99 take the cartridge binary, and \`xdm99\` or
\`xhm99\` can move the disk image onto a CF card or HFE image.
`;
}
