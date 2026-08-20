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

interface RouteChoice extends vscode.QuickPickItem {
    id: string;
}

const ROUTE_CHOICES: RouteChoice[] = [
    {
        label: 'Cartridge',
        detail: 'Runs on a bare console. Reaches everybody, and needs nothing else.',
        id: 'cart',
    },
    {
        label: 'Extended BASIC disk',
        detail: 'RUN "DSK1.LOAD". Extended BASIC was in far more homes than the Editor/Assembler module.',
        id: 'disk-xb',
    },
    {
        label: 'Editor/Assembler',
        detail: 'Option 3 object and option 5 image. The developer route, and the one most sources assume.',
        id: 'ea',
    },
];

/** Copy a template tree, substituting {{PLACEHOLDER}} in every text file. */
function copyTemplate(from: string, to: string, values: Record<string, string>): void {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, entry.name);
        const dst = path.join(to, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(dst, { recursive: true });
            copyTemplate(src, dst, values);
            continue;
        }
        // Nothing in the template is binary, so this is safe and keeps the
        // substitution in one place.
        let text = fs.readFileSync(src, 'utf8');
        for (const [key, value] of Object.entries(values)) {
            text = text.split(`{{${key}}}`).join(value);
        }
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, text, 'utf8');
    }
}

/** Uppercase, at most `max` characters, and legal in a TI filename. */
function tiName(name: string, max = 10): string {
    return name.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, max) || 'PROGRAM';
}

export async function createProject(extensionUri: vscode.Uri): Promise<void> {
    const folder = await pickFolder('Where should the project be created?');
    if (!folder) return;

    const name = await vscode.window.showInputBox({
        title: 'Project name',
        prompt: 'Used for output filenames and the cartridge menu entry.',
        value: path.basename(folder.fsPath),
        validateInput: v => /^[\w][\w .-]{0,39}$/.test(v) ? undefined : 'Use letters, digits, spaces, dots, hyphens or underscores.',
    });
    if (!name) return;

    const dialectChoice = await vscode.window.showQuickPick<DialectChoice>(DIALECT_CHOICES, {
        title: 'Which assembly syntax?',
        matchOnDetail: true,
    });
    if (!dialectChoice) return;

    // Every route is generated either way. This only decides which one Build
    // and Run reaches for first.
    const route = await vscode.window.showQuickPick<RouteChoice>(ROUTE_CHOICES, {
        title: 'Which route should Build and Run use by default?',
        matchOnDetail: true,
    });
    if (!route) return;

    const configPath = path.join(folder.fsPath, PROJECT_FILENAME);
    if (fs.existsSync(configPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `${PROJECT_FILENAME} already exists in that folder.`, { modal: true }, 'Overwrite');
        if (overwrite !== 'Overwrite') return;
    }

    const stem = name.replace(/[^\w.-]/g, '_');
    const base = tiName(name, 9);
    const menu = name.toUpperCase().slice(0, 20);

    const template = path.join(extensionUri.fsPath, 'templates', 'multi-target');
    if (!fs.existsSync(template)) {
        void vscode.window.showErrorMessage(
            `The project template is missing from the extension at ${template}.`);
        return;
    }

    try {
        fs.mkdirSync(path.join(folder.fsPath, 'lib'), { recursive: true });
        copyTemplate(template, folder.fsPath, {
            NAME: name,
            STEM: stem,
            TINAME: base,
            // The Extended BASIC object shares a FIAD folder with the
            // Editor/Assembler one, so it needs a name of its own.
            XBNAME: `${base}X`,
            MENUNAME: menu,
            MENULEN: String(menu.length),
            DIALECT: dialectChoice.id,
        });
    } catch (err) {
        void vscode.window.showErrorMessage(`Could not create the project: ${(err as Error).message}`);
        return;
    }

    // Put the chosen route first; resolveTarget treats that as the default.
    if (route.id !== 'cart') {
        try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as ProjectConfig;
            const targets = cfg.targets ?? [];
            const picked = targets.find(t => t.id === route.id);
            if (picked) {
                cfg.targets = [picked, ...targets.filter(t => t !== picked)];
                fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
            }
        } catch { /* the template is still valid, just ordered differently */ }
    }

    const mainPath = path.join(folder.fsPath, 'src', 'main.a99');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(mainPath));
    await vscode.window.showTextDocument(doc);

    const openFolder = await vscode.window.showInformationMessage(
        `Created ${name}: cartridge, Editor/Assembler and Extended BASIC disk, all from src/main.a99. ` +
        `Press F5 to build and run.`, 'Open Folder');
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
