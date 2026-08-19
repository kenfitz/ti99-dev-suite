/**
 * Diagnostic parser for xas99 / xdm99.
 *
 * Wire format (stderr), two lines per diagnostic:
 *
 *   > errs.a99 <2> 0002 - START  LI   R1,NOSUCH
 *   ***** Error: Unknown symbol: NOSUCH
 *
 * Behaviours this parser accounts for, all observed in xas99 3.6.5:
 *   - pass marker is 1, 2 or L (link / global phase)
 *   - file may be '---' and line may be '****' for project-scoped messages
 *   - the SAME diagnostic is emitted once per pass, so it must be deduplicated
 *   - the version banner and the 'N Errors found.' summary share the stream
 *   - everything goes to stderr; stdout is only used for `-o -`
 */

export type ParsedSeverity = 'error' | 'warning';

export interface RelatedSymbol {
    name: string;
    line: number | null;
}

export interface ParsedDiagnostic {
    file: string | null;
    /** One-based, as reported by the tool. Null for project-scoped messages. */
    line: number | null;
    column: number;
    length: number;
    severity: ParsedSeverity;
    message: string;
    source: string;
    pass?: string;
    scope: 'line' | 'project';
    sourceText?: string;
    related: RelatedSymbol[];
}

export interface DiagnosticParseResult {
    diagnostics: ParsedDiagnostic[];
    /** What the tool itself claimed, before deduplication. */
    reportedErrorCount: number | null;
    uniqueErrorCount: number;
    uniqueWarningCount: number;
}

interface PendingHeader {
    file: string | null;
    pass: string;
    line: number | null;
    sourceText: string;
}

const HEADER = /^>\s+(\S+)\s+<([0-9L]+)>\s+(\d+|\*+)\s+-\s?(.*)$/;
const BODY = /^\*{5}\s+(Error|Warning):\s+(.*)$/;
const SUMMARY = /^(\d+)\s+Errors?\s+found\.$/;
const BANNER = /^:\s+x[a-z]{2}99,\s+version/;

/** Messages that describe the program as a whole rather than one line. */
const PROJECT_SCOPED = [
    /^Unresolved references:/i,
    /^Unused constants:/i,
    /^Unused symbols:/i,
];

/** Messages that name the offending token after a colon. */
const TOKEN_BEARING = /^(?:Unknown symbol|Duplicate symbol|Invalid register|Invalid hex integer literal|Invalid decimal integer literal|Invalid binary integer literal):\s*(.+)$/i;

function stripAnsi(s: string): string {
    // xas99 colours output by default on Linux and macOS. Always pass --color off,
    // but strip defensively in case a user overrides via XAS99_CONFIG.
    return s.replace(/\u001b\[[0-9;]*m/g, '');
}

export function parseXas99(stderrText: string, defaultFile?: string): DiagnosticParseResult {
    const lines = stripAnsi(stderrText).split(/\r?\n/);
    const diagnostics: ParsedDiagnostic[] = [];
    const seen = new Set<string>();
    let reportedErrorCount: number | null = null;
    let pending: PendingHeader | null = null;

    for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        if (!line) continue;
        if (BANNER.test(line)) continue;

        const sum = SUMMARY.exec(line);
        if (sum) {
            reportedErrorCount = parseInt(sum[1], 10);
            continue;
        }

        const h = HEADER.exec(line);
        if (h) {
            pending = {
                file: h[1] === '---' ? (defaultFile ?? null) : h[1],
                pass: h[2],
                line: /^\d+$/.test(h[3]) ? parseInt(h[3], 10) : null,
                sourceText: h[4],
            };
            continue;
        }

        const b = BODY.exec(line);
        if (!b) continue;

        const severity = b[1].toLowerCase() as ParsedSeverity;
        const message = b[2];
        const isProject = PROJECT_SCOPED.some(rx => rx.test(message));
        const span = locateToken(pending?.sourceText ?? '', message);

        const d: ParsedDiagnostic = {
            file: pending?.file ?? defaultFile ?? null,
            line: pending?.line ?? null,
            column: span.column,
            length: span.length,
            severity,
            message,
            source: 'xas99',
            pass: pending?.pass,
            scope: isProject || !pending?.line ? 'project' : 'line',
            sourceText: pending?.sourceText,
            related: extractRelated(message),
        };

        const key = `${d.file}|${d.line}|${d.severity}|${d.message}`;
        if (!seen.has(key)) {
            seen.add(key);
            diagnostics.push(d);
        }
        pending = null;
    }

    return {
        diagnostics,
        reportedErrorCount,
        uniqueErrorCount: diagnostics.filter(d => d.severity === 'error').length,
        uniqueWarningCount: diagnostics.filter(d => d.severity === 'warning').length,
    };
}

/**
 * xas99 reports a line but not a column. Recover a tight span by finding the
 * token named in the message inside the echoed source text. Underlining the
 * token rather than the whole line is a large perceived-quality difference.
 */
function locateToken(sourceText: string, message: string): { column: number; length: number } {
    if (!sourceText) return { column: 0, length: 0 };

    const m = TOKEN_BEARING.exec(message);
    if (m) {
        // The token may have absorbed a trailing comment when the source used a
        // single-blank separator, e.g. "Invalid register: R1 * GET THE BODY CHAR."
        const token = m[1].trim().split(/\s{2,}|\s(?=\*)/)[0];
        const idx = sourceText.toUpperCase().indexOf(token.toUpperCase());
        if (idx >= 0) return { column: idx, length: token.length };
    }

    const first = sourceText.search(/\S/);
    const start = first < 0 ? 0 : first;
    return { column: start, length: Math.max(1, sourceText.trimEnd().length - start) };
}

/** "Unused constants: loop:6, other:12" -> related locations. */
function extractRelated(message: string): RelatedSymbol[] {
    const m = /^Unused (?:constants|symbols):\s*(.+)$/i.exec(message);
    if (!m) return [];
    return m[1].split(/\s*,\s*/).map(part => {
        const p = /^(.+?):(\d+)$/.exec(part.trim());
        return p
            ? { name: p[1], line: parseInt(p[2], 10) }
            : { name: part.trim(), line: null };
    });
}

/**
 * xdm99 does not use the two-line format; it reports plain messages.
 * Kept separate so the two parsers can evolve independently.
 */
export function parseXdm99(stderrText: string): DiagnosticParseResult {
    const diagnostics: ParsedDiagnostic[] = [];

    for (const raw of stripAnsi(stderrText).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || BANNER.test(line)) continue;

        const b = BODY.exec(line);
        const severity: ParsedSeverity = b
            ? (b[1].toLowerCase() as ParsedSeverity)
            : /error/i.test(line) ? 'error' : 'warning';

        diagnostics.push({
            file: null, line: null, column: 0, length: 0,
            severity, message: b ? b[2] : line,
            source: 'xdm99', scope: 'project', related: [],
        });
    }

    return {
        diagnostics,
        reportedErrorCount: null,
        uniqueErrorCount: diagnostics.filter(d => d.severity === 'error').length,
        uniqueWarningCount: diagnostics.filter(d => d.severity === 'warning').length,
    };
}
