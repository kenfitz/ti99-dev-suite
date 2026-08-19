import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { run } from './runner';
import { BUILTIN_PROFILES, compareVersions } from './profiles';
import type { ToolProfile } from './profiles';

export interface PythonInfo {
    path: string;
    version: string;
}

export interface FoundTool {
    directory: string;
    version?: string;
}

export interface ToolchainState {
    python?: PythonInfo;
    tool?: {
        profile: ToolProfile;
        directory: string;
        version?: string;
    };
    problems: string[];
    ready: boolean;
}

interface SearchContext {
    workspaceFolder?: string;
    globalStorage?: string;
}

const PYTHON_CANDIDATES = process.platform === 'win32'
    ? ['python.exe', 'python3.exe', 'py.exe']
    : ['python3', 'python'];

/** Split PATH into directories, tolerating a trailing separator. */
function pathDirs(): string[] {
    return (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
}

function exists(p: string): boolean {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
}

export async function findPython(configured?: string): Promise<PythonInfo | undefined> {
    const candidates: string[] = [];
    if (configured) candidates.push(configured);
    for (const name of PYTHON_CANDIDATES) {
        candidates.push(name);
        for (const dir of pathDirs()) candidates.push(path.join(dir, name));
    }

    for (const candidate of candidates) {
        const result = await run({
            program: candidate,
            args: ['--version'],
            cwd: process.cwd(),
            timeoutMs: 5000,
        });
        if (result.exitCode !== 0) continue;
        const text = `${result.stdout}${result.stderr}`;
        const m = /Python\s+(\d+\.\d+\.\d+)/.exec(text);
        if (!m) continue;
        // xdt99 will not run on Python 2.
        if (compareVersions(m[1], '3.8.0') < 0) continue;
        return { path: candidate, version: m[1] };
    }
    return undefined;
}

/** Expand ${config:...}, ${env:...}, ${workspaceFolder} and ${globalStorage}. */
function expandSearchPath(raw: string, ctx: SearchContext): string[] {
    const env = /^\$\{env:(\w+)\}$/.exec(raw);
    if (env) {
        const value = process.env[env[1]];
        if (!value) return [];
        // PATH-like variables expand to many directories.
        return value.includes(path.delimiter) ? value.split(path.delimiter).filter(Boolean) : [value];
    }

    const cfg = /^\$\{config:([\w.]+)\}$/.exec(raw);
    if (cfg) {
        const value = vscode.workspace.getConfiguration().get<string>(cfg[1]);
        return value ? [value] : [];
    }

    let out = raw;
    if (ctx.workspaceFolder) out = out.replace('${workspaceFolder}', ctx.workspaceFolder);
    if (ctx.globalStorage) out = out.replace('${globalStorage}', ctx.globalStorage);
    if (out.includes('${')) return [];
    return [out];
}

export async function findTool(
    profile: ToolProfile,
    python: string | undefined,
    ctx: SearchContext,
): Promise<FoundTool | undefined> {
    const searched: string[] = [];
    for (const raw of profile.detect.searchPaths) {
        searched.push(...expandSearchPath(raw, ctx));
    }

    for (const dir of searched) {
        if (!dir) continue;
        const allPresent = profile.detect.files.every(f => exists(path.join(dir, f)));
        if (!allPresent) continue;

        let version: string | undefined;
        if (profile.detect.versionCommand && python) {
            const args = profile.detect.versionCommand
                .slice(1)
                .map(a => a.replace('${tool}', dir).replace('${python}', python));
            const result = await run({ program: python, args, cwd: dir, timeoutMs: 10000 });
            const text = `${result.stdout}${result.stderr}`;
            if (profile.detect.versionPattern) {
                const m = new RegExp(profile.detect.versionPattern).exec(text);
                if (m) version = m[1];
            }
        }
        return { directory: dir, version };
    }
    return undefined;
}

export async function discover(context: vscode.ExtensionContext): Promise<ToolchainState> {
    const cfg = vscode.workspace.getConfiguration('ti99.toolchain');
    const problems: string[] = [];

    const python = await findPython(cfg.get<string>('pythonPath') || undefined);
    if (!python) {
        problems.push(
            'Python 3.8 or later was not found. xdt99 is written in Python and cannot run without it. ' +
            'Install Python, or set ti99.toolchain.pythonPath.');
    }

    const profileId = cfg.get<string>('profile', 'xdt99');
    const userProfiles = cfg.get<ToolProfile[]>('profiles', []);
    const profile = [...BUILTIN_PROFILES, ...userProfiles].find(p => p.id === profileId);
    if (!profile) {
        problems.push(`No tool profile named "${profileId}" is registered.`);
        return { python, problems, ready: false };
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const globalStorage = context.globalStorageUri.fsPath;
    const found = await findTool(profile, python?.path, { workspaceFolder, globalStorage });
    if (!found) {
        problems.push(
            `${profile.displayName} was not found. It is a directory of Python files, not a pip package — ` +
            `download it and point ti99.toolchain.xdt99Path at the folder containing ${profile.detect.files.join(' and ')}.`);
        return { python, problems, ready: false };
    }

    const minimum = profile.detect.minimumVersion;
    if (minimum && found.version && compareVersions(found.version, minimum) < 0) {
        problems.push(`${profile.displayName} ${found.version} was found, but ${minimum} or later is required.`);
    }

    return {
        python,
        tool: { profile, directory: found.directory, version: found.version },
        problems,
        ready: !!python && problems.length === 0,
    };
}

export function describeState(state: ToolchainState): string {
    const lines = ['TI-99 toolchain status', ''];

    lines.push(state.python
        ? `  Python    ${state.python.version}  (${state.python.path})`
        : '  Python    NOT FOUND');

    if (state.tool) {
        lines.push(`  Toolchain ${state.tool.profile.displayName}${state.tool.version ? ` ${state.tool.version}` : ''}`);
        lines.push(`            ${state.tool.directory}`);
        lines.push(`  Provides  ${state.tool.profile.capabilities.join(', ')}`);
    } else {
        lines.push('  Toolchain NOT FOUND');
    }

    const emu = vscode.workspace.getConfiguration('ti99.emulator');
    const classic99 = emu.get<string>('classic99Path');
    const mame = emu.get<string>('mamePath');
    lines.push('');
    lines.push(`  Classic99 ${classic99 && exists(classic99) ? classic99 : 'not configured'}`);
    lines.push(`  MAME      ${mame && exists(mame) ? mame : 'not configured'}`);

    if (state.problems.length) {
        lines.push('', 'Problems:');
        for (const p of state.problems) lines.push(`  - ${p}`);
    } else {
        lines.push('', 'Ready to build.');
    }

    return lines.join('\n');
}
