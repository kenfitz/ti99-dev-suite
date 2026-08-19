import { spawn } from 'child_process';
import * as fs from 'fs';

export interface RunOptions {
    program: string;
    args: string[];
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export interface RunResult {
    program: string;
    args: string[];
    cwd: string;
    /** null when the process could not be spawned at all. */
    exitCode: number | null;
    stdout: string;
    stderr: string;
    cancelled: boolean;
    timedOut: boolean;
    durationMs: number;
    /** Quoted form for the output channel. Never used to execute anything. */
    displayCommand: string;
}

export class Cancellation {
    private handlers: Array<() => void> = [];
    cancelled = false;

    cancel(): void {
        if (this.cancelled) return;
        this.cancelled = true;
        for (const h of this.handlers) h();
    }

    onCancel(h: () => void): void {
        if (this.cancelled) h();
        else this.handlers.push(h);
    }
}

/** Quote for *display* only. Actual execution always uses an argv array. */
function quoteForDisplay(part: string): string {
    return /[\s"'&|<>^]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part;
}

/**
 * Run a tool.
 *
 * Never uses `shell: true`. TI project paths routinely contain spaces
 * ("C:\TI Stuff\ASM\Sound.asm") and shell interpolation on Windows is a
 * reliable source of quoting bugs and, worse, injection.
 */
export function run(opts: RunOptions, token?: Cancellation): Promise<RunResult> {
    const started = Date.now();
    const displayCommand = [opts.program, ...opts.args].map(quoteForDisplay).join(' ');

    return new Promise<RunResult>(resolve => {
        let stdout = '';
        let stderr = '';
        let cancelled = false;
        let timedOut = false;

        const child = spawn(opts.program, opts.args, {
            cwd: opts.cwd,
            env: { ...process.env, ...opts.env },
            shell: false,
            windowsHide: true,
        });

        const timer = opts.timeoutMs
            ? setTimeout(() => { timedOut = true; child.kill(); }, opts.timeoutMs)
            : undefined;

        token?.onCancel(() => { cancelled = true; child.kill(); });

        child.stdout?.on('data', (d: Buffer) => {
            const s = d.toString();
            stdout += s;
            opts.onOutput?.(s, 'stdout');
        });
        child.stderr?.on('data', (d: Buffer) => {
            const s = d.toString();
            stderr += s;
            opts.onOutput?.(s, 'stderr');
        });

        const finish = (exitCode: number | null): void => {
            if (timer) clearTimeout(timer);
            resolve({
                program: opts.program, args: opts.args, cwd: opts.cwd,
                exitCode, stdout, stderr, cancelled, timedOut,
                durationMs: Date.now() - started,
                displayCommand,
            });
        };

        child.on('error', err => {
            stderr += `\n${err.message}`;
            finish(null);
        });
        child.on('close', code => finish(code));
    });
}

/**
 * A step succeeds only when the exit code is zero AND the declared artifact
 * exists. xas99 returns 1 and writes nothing on error, but a tool that returns
 * 0 without producing output would otherwise register as a false success.
 */
export function verifyArtifact(path: string | undefined): { ok: boolean; reason?: string } {
    if (!path) return { ok: true };
    try {
        const st = fs.statSync(path);
        if (st.size === 0) return { ok: false, reason: `${path} was created but is empty.` };
        return { ok: true };
    } catch {
        return { ok: false, reason: `Expected output file was not created: ${path}` };
    }
}
