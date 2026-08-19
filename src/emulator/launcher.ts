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

        const configured = vscode.workspace.getConfiguration('ti99.emulator').get<string>('profile') ||
            project.config.emulatorProfile;

        if (configured) {
            const found = BUILTIN_EMULATORS.find(e => e.id === configured);
            if (found) return found;
            this.output.appendLine(`Unknown emulator profile "${configured}"; falling back to a prompt.`);
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
        const cfg = vscode.workspace.getConfiguration();
        const root = project.root.fsPath;

        const byKind = new Map<string, Artifact>();
        for (const a of artifacts) if (!byKind.has(a.kind)) byKind.set(a.kind, a);

        const primary = artifacts.find(a => a.runnable);
        const tiFilename = primary
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
