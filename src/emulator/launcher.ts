import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

import { BUILTIN_EMULATORS, candidatesFor, classic99CartFilename } from './profiles';
import type { EmulatorProfile } from './profiles';
import type { Project } from '../config/loader';
import type { Artifact } from '../build/coordinator';

interface EmulatorPick extends vscode.QuickPickItem {
    profile: EmulatorProfile;
}

export class EmulatorLauncher implements vscode.Disposable {
    private running = new Map<string, ChildProcess>();

    constructor(private readonly output: vscode.OutputChannel) {}

    /** Choose a profile: explicit setting, project setting, or ask. */
    async pick(project: Project, artifacts: Artifact[]): Promise<EmulatorProfile | undefined> {
        const produced = artifacts.map(a => a.kind);

        // The project - or the active target within it - names a profile for the
        // artifacts it actually builds, so it is more specific than a global
        // setting and wins. The setting stays the default for projects that do
        // not say. The old order let one setting force every target through the
        // same emulator, which silently broke any target it could not run.
        // Scoped to the project folder. Without a resource, a multi-root
        // workspace hides every folder-level .vscode/settings.json, so a
        // per-project emulator setup silently does not exist.
        const setting = vscode.workspace
            .getConfiguration('ti99.emulator', project.root)
            .get<string>('profile');
        const configured = [project.config.emulatorProfile, setting]
            .filter((id): id is string => Boolean(id));

        for (const id of configured) {
            const found = BUILTIN_EMULATORS.find(e => e.id === id);
            if (!found) {
                this.output.appendLine(`Unknown emulator profile "${id}"; ignoring it.`);
                continue;
            }
            // A profile that accepts nothing this build produced would fail in
            // preLaunch on a missing artifact. Skip it and say why.
            if (!found.accepts.some(a => produced.includes(a))) {
                this.output.appendLine(
                    `Emulator profile "${id}" runs ${found.accepts.join(', ')}, but this build ` +
                    `produced ${produced.join(', ')}. Skipping it.`);
                continue;
            }
            return found;
        }

        const options = candidatesFor(produced, process.platform);
        if (options.length === 0) {
            void vscode.window.showWarningMessage(
                `No emulator profile can run ${produced.join(', ')} on this platform. ` +
                `Add outputs to the project, or configure a custom emulator.`);
            return undefined;
        }
        if (options.length === 1) return options[0];

        const picked = await vscode.window.showQuickPick<EmulatorPick>(
            options.map(o => ({
                label: o.displayName,
                detail: o.notes,
                description: o.accepts.filter(a => produced.includes(a)).join(', '),
                profile: o,
            })),
            { title: 'Run in which emulator?' });

        return picked?.profile;
    }

    async launch(profile: EmulatorProfile, project: Project, artifacts: Artifact[]): Promise<boolean> {
        const resolve = this.makeResolver(project, artifacts);

        if (profile.kind === 'browser') {
            const url = resolve(profile.url ?? '');
            await vscode.env.openExternal(vscode.Uri.parse(url));
            const primary = artifacts.find(a => a.runnable);
            if (primary) {
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(primary.path));
                void vscode.window.showInformationMessage(
                    `${profile.displayName} opened. Drag ${path.basename(primary.path)} into the emulator window.`);
            }
            return true;
        }

        // Check required settings before staging anything. An unresolved argument
        // is dropped later, which would turn '-rom <path>' into a bare '-rom'
        // and start the emulator with no cartridge - exactly the failure this
        // is meant to prevent.
        const missing = (profile.requires ?? []).filter(key => {
            const dot = key.lastIndexOf('.');
            const section = key.slice(0, dot);
            const name = key.slice(dot + 1);
            const value = vscode.workspace.getConfiguration(section, project.root).get<string>(name);
            return !value || !value.trim();
        });
        if (missing.length) {
            this.output.appendLine(
                `${profile.displayName}: not configured - ${missing.join(', ')}`);
            const choice = await vscode.window.showErrorMessage(
                `${profile.displayName} needs ${missing.join(' and ')}.`, 'Open Settings');
            if (choice === 'Open Settings') {
                await vscode.commands.executeCommand('workbench.action.openSettings', missing[0]);
            }
            return false;
        }

        // Pre-launch file staging, e.g. dropping TIFILES into Classic99's DSK1.
        if (profile.preLaunch) {
            for (const step of profile.preLaunch) {
                const to = resolve(step.to);
                if (!to || to.includes('${')) {
                    void vscode.window.showWarningMessage(
                        `${profile.displayName}: a required path is not configured. Check the TI-99 emulator settings.`);
                    return false;
                }
                try {
                    if (step.action === 'mkdir') {
                        fs.mkdirSync(to, { recursive: true });
                    } else if (step.action === 'copy' && step.from) {
                        const from = resolve(step.from);
                        if (!fs.existsSync(from)) {
                            this.output.appendLine(`Pre-launch: ${from} does not exist, skipping.`);
                            continue;
                        }
                        fs.mkdirSync(path.dirname(to), { recursive: true });
                        fs.copyFileSync(from, to);
                        this.output.appendLine(`Pre-launch: copied ${from} -> ${to}`);
                    }
                } catch (err) {
                    void vscode.window.showErrorMessage(`Pre-launch step failed: ${(err as Error).message}`);
                    return false;
                }
            }
        }

        const executable = resolve(profile.executable ?? '');
        if (!executable || executable.includes('${')) {
            const choice = await vscode.window.showErrorMessage(
                `${profile.displayName} is not configured.`, 'Open Settings');
            if (choice === 'Open Settings') {
                await vscode.commands.executeCommand('workbench.action.openSettings', 'ti99.emulator');
            }
            return false;
        }
        if (!fs.existsSync(executable)) {
            void vscode.window.showErrorMessage(
                `${profile.displayName} was not found at ${executable}. Update the path in TI-99 emulator settings.`);
            return false;
        }
        // existsSync is true for a directory, and spawning one fails with an
        // error that says nothing about the setting that caused it.
        if (fs.statSync(executable).isDirectory()) {
            void vscode.window.showErrorMessage(
                `${profile.displayName}: ${executable} is a folder, not a program. ` +
                `The setting wants the executable itself.`);
            return false;
        }

        const args = (profile.args ?? [])
            .map(a => resolve(a))
            .filter(a => a !== '' && !a.includes('${'));

        if (profile.singleInstance) {
            const existing = this.running.get(profile.id);
            if (existing && !existing.killed) {
                existing.kill();
                this.running.delete(profile.id);
                this.output.appendLine(`Restarted ${profile.displayName}.`);
            }
        }

        this.output.appendLine('');
        this.output.appendLine(`> ${profile.displayName}`);
        this.output.appendLine(`  ${[executable, ...args].join(' ')}`);

        try {
            const child = spawn(executable, args, {
                cwd: path.dirname(executable),
                detached: profile.detached ?? true,
                stdio: 'ignore',
                shell: false,
                windowsHide: false,
            });
            child.unref();
            this.running.set(profile.id, child);
            if (profile.hint) {
                const hint = resolve(profile.hint);
                this.output.appendLine(`  ${hint}`);
                void vscode.window.showInformationMessage(`TI-99: ${hint}`);
            }
            child.on('error', err => {
                void vscode.window.showErrorMessage(`${profile.displayName} failed to start: ${err.message}`);
            });
            return true;
        } catch (err) {
            void vscode.window.showErrorMessage(`${profile.displayName} failed to start: ${(err as Error).message}`);
            return false;
        }
    }

    /** Build the ${...} substitution function for a launch. */
    private makeResolver(project: Project, artifacts: Artifact[]): (template: string) => string {
        const cfg = vscode.workspace.getConfiguration(undefined, project.root);
        const root = project.root.fsPath;

        const byKind = new Map<string, Artifact>();
        for (const a of artifacts) if (!byKind.has(a.kind)) byKind.set(a.kind, a);

        const primary = artifacts.find(a => a.runnable);
        // An explicit tiName wins: the program may name the file it loads.
        const tiFilename = project.config.tiName
            ? project.config.tiName.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10)
            : primary
            ? path.basename(primary.path).toUpperCase().replace(/\.[^.]*$/, '')
            : project.config.name.toUpperCase().slice(0, 10);

        return (template: string): string => template.replace(/\$\{([^}]+)\}/g, (_m, expr: string) => {
            if (expr.startsWith('artifact:')) {
                const kind = expr.slice('artifact:'.length);
                return byKind.get(kind)?.path ?? '';
            }
            if (expr.startsWith('config:')) {
                return cfg.get<string>(expr.slice('config:'.length)) ?? '';
            }
            switch (expr) {
                case 'projectRoot': return root;
                case 'buildDir': return path.resolve(root, project.config.buildDir);
                case 'distDir': return path.resolve(root, project.config.distDir);
                case 'tiFilename': return tiFilename;
                // On-disk name of the tokenised BASIC program. Extended
                // BASIC runs one called LOAD from DSK1 at power-up.
                case 'basicName': return project.config.basicName ?? 'LOAD';
                case 'extraArgs': return '';
                default: return '';
            }
        });
    }

    /** Warn when a cartridge binary is named in a way Classic99 will not recognise. */
    static checkClassic99Naming(project: Project, artifacts: Artifact[]): string | undefined {
        const bin = artifacts.find(a => a.kind === 'cart-bin');
        if (!bin) return undefined;

        const banking = project.config.cartridge?.banking ?? 'none';
        const expected = classic99CartFilename(project.config.name, banking);
        const actual = path.basename(bin.path).toUpperCase();

        if (!/[CDG893]\.BIN$/.test(actual)) {
            return `Classic99 identifies cartridges by the last character of the filename. ` +
                `"${actual}" has no type letter; consider "${expected}".`;
        }
        if (bin.size % 8192 !== 0) {
            return `The cartridge binary is ${bin.size} bytes, not a multiple of 8 KB. ` +
                `Build with -B rather than -b so it is padded, or Classic99 may misbehave.`;
        }
        return undefined;
    }

    dispose(): void {
        for (const child of this.running.values()) {
            if (!child.killed) child.kill();
        }
        this.running.clear();
    }
}
