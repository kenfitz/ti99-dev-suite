import * as vscode from 'vscode';
import * as path from 'path';

import { DEFAULT_PROJECT, defaultUnresolvedPolicy, validate } from './project';
import type { ProjectConfig, ValidationIssue } from './project';

export const PROJECT_FILENAME = 'ti99.json';

export interface Project {
    config: ProjectConfig;
    configUri: vscode.Uri;
    root: vscode.Uri;
    issues: ValidationIssue[];
}

/** Strip // and /* *\/ comments so ti99.json can be commented like tsconfig. */
function stripJsonComments(text: string): string {
    let out = '';
    let inString = false;
    let inLine = false;
    let inBlock = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const n = text[i + 1];

        if (inLine) {
            if (c === '\n') {
                inLine = false;
                out += c;
            }
            continue;
        }
        if (inBlock) {
            if (c === '*' && n === '/') {
                inBlock = false;
                i++;
            }
            continue;
        }
        if (inString) {
            out += c;
            if (c === '\\') {
                out += text[++i] ?? '';
                continue;
            }
            if (c === '"') inString = false;
            continue;
        }
        if (c === '"') {
            inString = true;
            out += c;
            continue;
        }
        if (c === '/' && n === '/') { inLine = true; i++; continue; }
        if (c === '/' && n === '*') { inBlock = true; i++; continue; }
        out += c;
    }
    return out;
}

export async function findProjects(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles(`**/${PROJECT_FILENAME}`, '**/node_modules/**', 32);
}

export async function loadProject(configUri: vscode.Uri): Promise<Project> {
    const bytes = await vscode.workspace.fs.readFile(configUri);
    const raw = Buffer.from(bytes).toString('utf8');

    let parsed: Partial<ProjectConfig>;
    try {
        parsed = JSON.parse(stripJsonComments(raw));
    } catch (err) {
        throw new Error(`${PROJECT_FILENAME} is not valid JSON: ${(err as Error).message}`);
    }

    const config: ProjectConfig = {
        ...DEFAULT_PROJECT,
        ...parsed,
        assembler: {
            ...DEFAULT_PROJECT.assembler,
            unresolvedReferencePolicy: defaultUnresolvedPolicy(parsed.type ?? DEFAULT_PROJECT.type),
            ...(parsed.assembler ?? {}),
        },
    };

    return {
        config,
        configUri,
        root: vscode.Uri.file(path.dirname(configUri.fsPath)),
        issues: validate(config),
    };
}

export async function saveProject(project: Project): Promise<void> {
    const text = JSON.stringify(project.config, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(project.configUri, Buffer.from(text, 'utf8'));
}

interface ProjectPick extends vscode.QuickPickItem {
    project: Project;
}

/**
 * Track which project is active. In a multi-root or multi-project workspace the
 * active editor decides, falling back to the single project when there is one.
 */
export class ProjectManager implements vscode.Disposable {
    private projects = new Map<string, Project>();
    private activeKey: string | undefined;
    private emitter = new vscode.EventEmitter<Project | undefined>();
    readonly onDidChangeActive = this.emitter.event;
    private watcher: vscode.FileSystemWatcher | undefined;

    async initialise(): Promise<void> {
        await this.refresh();
        this.watcher = vscode.workspace.createFileSystemWatcher(`**/${PROJECT_FILENAME}`);
        this.watcher.onDidChange(() => void this.refresh());
        this.watcher.onDidCreate(() => void this.refresh());
        this.watcher.onDidDelete(() => void this.refresh());
        vscode.window.onDidChangeActiveTextEditor(() => this.recomputeActive());
    }

    async refresh(): Promise<void> {
        this.projects.clear();
        for (const uri of await findProjects()) {
            try {
                const project = await loadProject(uri);
                this.projects.set(uri.toString(), project);
            } catch (err) {
                void vscode.window.showErrorMessage(`TI-99: ${(err as Error).message}`);
            }
        }
        this.recomputeActive();
    }

    private recomputeActive(): void {
        const previous = this.activeKey;

        if (this.projects.size === 1) {
            this.activeKey = [...this.projects.keys()][0];
        } else {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const file = editor.document.uri.fsPath;
                let best: { key: string; length: number } | undefined;
                for (const [key, project] of this.projects) {
                    const root = project.root.fsPath;
                    if (file.startsWith(root) && (!best || root.length > best.length)) {
                        best = { key, length: root.length };
                    }
                }
                if (best) this.activeKey = best.key;
            }
            if (this.activeKey && !this.projects.has(this.activeKey)) this.activeKey = undefined;
        }

        if (previous !== this.activeKey) this.emitter.fire(this.active);
    }

    get active(): Project | undefined {
        return this.activeKey ? this.projects.get(this.activeKey) : undefined;
    }

    get all(): Project[] {
        return [...this.projects.values()];
    }

    /** Return the active project, or explain why there is not one. */
    async require(): Promise<Project | undefined> {
        if (this.active) return this.active;

        if (this.projects.size === 0) {
            const choice = await vscode.window.showWarningMessage(
                `No ${PROJECT_FILENAME} found in this workspace.`,
                'Create New Project', 'Import Existing Source');
            if (choice === 'Create New Project') await vscode.commands.executeCommand('ti99.newProject');
            if (choice === 'Import Existing Source') await vscode.commands.executeCommand('ti99.importProject');
            return undefined;
        }

        const picked = await vscode.window.showQuickPick<ProjectPick>(
            this.all.map(p => ({ label: p.config.name, description: p.root.fsPath, project: p })),
            { title: 'Which TI-99 project?' });
        if (!picked) return undefined;

        this.activeKey = picked.project.configUri.toString();
        this.emitter.fire(picked.project);
        return picked.project;
    }

    dispose(): void {
        this.watcher?.dispose();
        this.emitter.dispose();
    }
}
