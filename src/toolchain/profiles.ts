/**
 * Pluggable toolchain model.
 *
 * xdt99 is a *profile*, not the architecture. Anyone can register another
 * assembler by contributing a profile to `ti99.toolchain.profiles`, which is
 * what makes "configure your own assembler and linker" a real feature rather
 * than a single escape-hatch setting.
 */

import type { Capability } from '../config/project';

export interface DetectRule {
    /** Every one of these must exist in a directory for it to be the tool. */
    files: string[];
    /** Searched in order. Supports ${config:...}, ${env:...}, ${workspaceFolder}, ${globalStorage}. */
    searchPaths: string[];
    versionCommand?: string[];
    versionPattern?: string;
    minimumVersion?: string;
}

export interface ToolCommand {
    program: string;
    args: string[];
    cwd: string;
    /** Named parser ('xas99', 'xdm99') or 'regex' with a problemPattern. */
    problemMatcher: string;
    problemPattern?: string;
    /** The step fails unless this file exists and is non-empty afterwards. */
    successRequiresArtifact?: string;
}

export interface ToolProfile {
    id: string;
    displayName: string;
    description?: string;
    capabilities: Capability[];
    detect: DetectRule;
    /** Lookup tables for ${...} flags, keyed by setting value. */
    variables?: Record<string, string | Record<string, string>>;
    commands: Partial<Record<string, ToolCommand>>;
}

/**
 * Built-in xdt99 profile.
 *
 * Command lines here were executed against xdt99 3.6.5 and verified to produce
 * the expected artifacts. Notes on the non-obvious choices:
 *
 *   -B  (not -b) for cartridge binaries: aligns to >2000 and pads to a multiple
 *       of 8 KB. An unpadded ROM makes Classic99 misbehave.
 *   ";" after -I: argparse consumes list options greedily, so the terminator
 *       keeps the source files from being swallowed as include paths.
 *   --color off: keeps ANSI escapes out of the diagnostic stream.
 *   -E: symbol EQU file in hex, which is what the memory-map view should parse.
 *       The -S symbol table in the listing is decimal and dot-padded.
 */
export const XDT99_PROFILE: ToolProfile = {
    id: 'xdt99',
    displayName: 'xdt99 (xas99 / xdm99)',
    description: 'Ralph Benzinger\'s cross-development tools. Pure Python, no installation step.',
    capabilities: [
        'assemble', 'link', 'listing', 'symbols',
        'cart-rpk', 'cart-bin', 'ea3-object', 'ea5-image',
        'disk-image', 'tifiles',
    ],
    detect: {
        files: ['xas99.py'],
        searchPaths: [
            '${config:ti99.toolchain.xdt99Path}',
            '${env:XDT99_HOME}',
            '${workspaceFolder}/tools/xdt99',
            '${env:PATH}',
            '${globalStorage}/xdt99',
        ],
        versionCommand: ['${python}', '${tool}/xas99.py', '--help'],
        versionPattern: 'cross-assembler,\\s+v([0-9]+\\.[0-9]+\\.[0-9]+)',
        minimumVersion: '3.6.0',
    },
    variables: {
        dialectFlag: { ea: '-s', xdt99: '', relaxed: '-r' },
        registerFlag: { true: '-R', false: '' },
        cpuFlag: { '9900': '', '9995': '-5', '99000': '-105', f18a: '-18' },
        cartBase: '>6000',
    },
    commands: {
        'ea3-object': {
            program: '${python}',
            args: [
                '${tool}/xas99.py', '${dialectFlag}', '${registerFlag}', '${cpuFlag}',
                '${sources}',
                '-o', '${output}',
                '-L', '${listing}', '-S',
                '-E', '${symbolFile}',
                '-I', '${includePaths}', ';',
                '--color', 'off',
            ],
            cwd: '${projectRoot}',
            problemMatcher: 'xas99',
            successRequiresArtifact: '${output}',
        },
        'ea5-image': {
            program: '${python}',
            args: [
                '${tool}/xas99.py', '-i', '${dialectFlag}', '${registerFlag}', '${cpuFlag}',
                '${sources}',
                '-o', '${output}',
                '-L', '${listing}', '-S',
                '-E', '${symbolFile}',
                '-I', '${includePaths}', ';',
                '--color', 'off',
            ],
            cwd: '${projectRoot}',
            problemMatcher: 'xas99',
            successRequiresArtifact: '${output}',
        },
        'cart-rpk': {
            program: '${python}',
            args: [
                '${tool}/xas99.py', '-c', '${dialectFlag}', '${registerFlag}', '${cpuFlag}',
                '${sources}',
                '-n', '${cartridgeName}',
                '-o', '${output}',
                '-L', '${listing}', '-S',
                '-E', '${symbolFile}',
                '-I', '${includePaths}', ';',
                '--color', 'off',
            ],
            cwd: '${projectRoot}',
            problemMatcher: 'xas99',
            successRequiresArtifact: '${output}',
        },
        'cart-bin': {
            program: '${python}',
            args: [
                '${tool}/xas99.py', '-B', '-a', '${cartBase}',
                '${dialectFlag}', '${registerFlag}', '${cpuFlag}',
                '${sources}',
                '-o', '${output}',
                '-I', '${includePaths}', ';',
                '--color', 'off',
            ],
            cwd: '${projectRoot}',
            problemMatcher: 'xas99',
            successRequiresArtifact: '${output}',
        },
        'disk-image': {
            program: '${python}',
            // The image name MUST precede list options or argparse eats it.
            args: ['${tool}/xdm99.py', '-X', '${diskGeometry}', '${output}', '-n', '${diskName}'],
            cwd: '${projectRoot}',
            problemMatcher: 'xdm99',
            successRequiresArtifact: '${output}',
        },
        tifiles: {
            program: '${python}',
            args: ['${tool}/xdm99.py', '-T', '${input}', '-f', '${fileType}', '-o', '${output}'],
            cwd: '${projectRoot}',
            problemMatcher: 'xdm99',
            successRequiresArtifact: '${output}',
        },
    },
};

/**
 * Template for a user-supplied assembler. Shipped so the settings UI has
 * something to copy rather than leaving people to invent a schema.
 */
export const CUSTOM_PROFILE_TEMPLATE: ToolProfile = {
    id: 'custom',
    displayName: 'Custom assembler',
    capabilities: ['assemble'],
    detect: { files: [], searchPaths: ['${config:ti99.toolchain.customPath}'] },
    commands: {
        assemble: {
            program: '${config:ti99.toolchain.customPath}',
            args: ['${sources}', '-o', '${output}'],
            cwd: '${projectRoot}',
            problemMatcher: 'regex',
            problemPattern: '^(?<file>[^(]+)\\((?<line>\\d+)\\):\\s*(?<severity>error|warning):\\s*(?<message>.*)$',
            successRequiresArtifact: '${output}',
        },
    },
};

export const BUILTIN_PROFILES: ToolProfile[] = [XDT99_PROFILE];

/**
 * Expand ${...} placeholders in an argument list.
 * Empty expansions are dropped; array expansions are spliced.
 */
export function expandArgs(
    args: string[],
    scalars: Record<string, string>,
    lists: Record<string, string[]> = {},
): string[] {
    const out: string[] = [];
    for (const arg of args) {
        const listMatch = /^\$\{(\w+)\}$/.exec(arg);
        if (listMatch && lists[listMatch[1]]) {
            out.push(...lists[listMatch[1]]);
            continue;
        }
        const expanded = arg.replace(/\$\{(\w+(?::[\w.]+)?)\}/g, (_m, name: string) => {
            const v = scalars[name];
            return v === undefined ? '' : v;
        });
        if (expanded !== '') out.push(expanded);
    }
    return out;
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}
