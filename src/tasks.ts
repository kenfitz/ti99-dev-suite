import * as vscode from 'vscode';

import { DIALECTS } from './lang/dialect';
import type { ProjectManager } from './config/loader';
import type { ToolchainState } from './toolchain/discovery';

export interface Ti99TaskDefinition extends vscode.TaskDefinition {
    type: 'ti99';
    task: string;
    /** Path to ti99.json when the workspace holds more than one project. */
    project?: string;
    /** Distribution route, for projects that declare targets. */
    target?: string;
}

/**
 * Surfaces TI-99 operations in the Tasks menu so they compose with the rest of
 * VS Code: task dependencies, keybindings, and "Run Build Task".
 *
 * The tasks shell out to the extension's own commands rather than duplicating
 * the argv construction, which keeps a single source of truth for the pipeline.
 */
export class Ti99TaskProvider implements vscode.TaskProvider {
    static readonly type = 'ti99';

    constructor(private readonly projects: ProjectManager) {}

    provideTasks(): vscode.Task[] {
        const active = this.projects.active;
        if (!active) return [];

        const tasks = [
            this.make('build', 'Build', vscode.TaskGroup.Build),
            this.make('rebuild', 'Rebuild', vscode.TaskGroup.Build),
            this.make('clean', 'Clean', vscode.TaskGroup.Clean),
            this.make('run', 'Run in Emulator'),
        ];

        // One task per distribution route, so "Run Task" can build a single
        // one without going through the picker. Build above still does all.
        for (const target of active.config.targets ?? []) {
            tasks.push(this.make(
                'buildTarget',
                `Build ${target.label ?? target.id}`,
                vscode.TaskGroup.Build,
                target.id));
        }

        return tasks;
    }

    resolveTask(task: vscode.Task): vscode.Task | undefined {
        const def = task.definition as Ti99TaskDefinition;
        if (def.type !== Ti99TaskProvider.type || !def.task) return undefined;
        return this.make(def.task, task.name, task.group, def.target);
    }

    private make(name: string, label: string, group?: vscode.TaskGroup, target?: string): vscode.Task {
        const definition: Ti99TaskDefinition = { type: Ti99TaskProvider.type, task: name };
        if (target) definition.target = target;

        const commandId: string = ({
            build: 'ti99.build',
            rebuild: 'ti99.rebuild',
            buildTarget: 'ti99.buildTarget',
            rebuildTarget: 'ti99.rebuildTarget',
            clean: 'ti99.clean',
            package: 'ti99.build',
            run: 'ti99.run',
        } as Record<string, string>)[name];

        const task = new vscode.Task(
            definition,
            vscode.TaskScope.Workspace,
            label,
            'TI-99',
            new vscode.CustomExecution(async () => new CommandTerminal(commandId, label, target)));

        if (group) task.group = group;
        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Silent,
            panel: vscode.TaskPanelKind.Shared,
            clear: true,
        };
        return task;
    }
}

/** Minimal pseudo-terminal that runs one extension command and reports status. */
class CommandTerminal implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<number>();
    readonly onDidWrite = this.writeEmitter.event;
    readonly onDidClose = this.closeEmitter.event;

    constructor(
        private readonly commandId: string,
        private readonly label: string,
        private readonly target?: string,
    ) {}

    async open(): Promise<void> {
        this.writeEmitter.fire(`${this.label}...\r\n`);
        try {
            const ok = this.target === undefined
                ? await vscode.commands.executeCommand(this.commandId)
                : await vscode.commands.executeCommand(this.commandId, this.target);
            this.writeEmitter.fire(ok === false ? `${this.label} failed.\r\n` : `${this.label} finished.\r\n`);
            this.closeEmitter.fire(ok === false ? 1 : 0);
        } catch (err) {
            this.writeEmitter.fire(`${this.label} failed: ${(err as Error).message}\r\n`);
            this.closeEmitter.fire(1);
        }
    }

    close(): void { }
}

// ---------------------------------------------------------------------------

export class StatusBar implements vscode.Disposable {
    private project: vscode.StatusBarItem;
    private build: vscode.StatusBarItem;

    constructor() {
        this.project = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.project.command = 'ti99.toolchainStatus';
        this.build = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.build.command = 'ti99.buildAndRun';
    }

    update(projects: ProjectManager, toolchain: ToolchainState): void {
        const active = projects.active;
        if (!active) {
            this.project.hide();
            this.build.hide();
            return;
        }

        const dialect = DIALECTS[active.config.syntaxDialect];
        const ready = toolchain.ready;

        this.project.text = `$(circuit-board) ${active.config.name}  $(law) ${dialect.label}`;
        this.project.tooltip = new vscode.MarkdownString(
            `**${active.config.name}** — ${active.config.type}\n\n` +
            `Dialect: ${dialect.label}\n\n` +
            `Toolchain: ${toolchain.tool ? `${toolchain.tool.profile.displayName} ${toolchain.tool.version ?? ''}` : 'not found'}\n\n` +
            `Python: ${toolchain.python?.version ?? 'not found'}\n\n` +
            `Click for full status.`);
        this.project.backgroundColor = ready
            ? undefined
            : new vscode.ThemeColor('statusBarItem.warningBackground');
        this.project.show();

        this.build.text = '$(debug-start) Build & Run';
        this.build.tooltip = 'TI-99: Build and Run (F5)';
        this.build.show();
    }

    building(what: string): void {
        this.build.text = `$(sync~spin) ${what}`;
        this.build.show();
    }

    built(success: boolean, durationMs: number): void {
        this.build.text = success
            ? `$(check) Built in ${durationMs} ms`
            : '$(error) Build failed';
        setTimeout(() => { this.build.text = '$(debug-start) Build & Run'; }, 4000);
    }

    dispose(): void {
        this.project.dispose();
        this.build.dispose();
    }
}
