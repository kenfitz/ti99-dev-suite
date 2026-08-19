import type { SyntaxDialect } from '../lang/dialect';

/** What the project builds. Drives the wizard defaults and the output set. */
export type ProjectType = 'cartridge-rpk' | 'cartridge-bin' | 'ea5-image' | 'ea3-object' | 'disk';

/**
 * A unit of work a toolchain can perform. Profiles advertise these, projects
 * request them, and the coordinator refuses to build one the profile lacks.
 */
export type Capability =
    | 'assemble' | 'link' | 'listing' | 'symbols'
    | 'cart-rpk' | 'cart-bin' | 'ea3-object' | 'ea5-image'
    | 'disk-image' | 'tifiles';

export type Processor = '9900' | '9995' | '99000' | 'f18a';

export type UnresolvedPolicy = 'ignore' | 'information' | 'warning' | 'error';

export type Banking = 'none' | '378' | '379' | 'grom';

export interface CartridgeOptions {
    /** Shown on the TI title screen. Truncated past 20 characters. */
    name: string;
    baseAddress: string;
    banking: Banking;
    /** Classic99 infers the cartridge type from the last letter of this name. */
    binFilename?: string;
}

export interface DiskFileEntry {
    artifact: Capability;
    tiName: string;
    format: string;
}

export interface DiskOptions {
    geometry: string;
    volumeName: string;
    files: DiskFileEntry[];
}

export interface AssemblerOptions {
    unresolvedReferencePolicy: UnresolvedPolicy;
    extraArgs: string[];
}

export interface ProjectConfig {
    version: number;
    name: string;
    type: ProjectType;
    syntaxDialect: SyntaxDialect;
    toolchainProfile: string;
    processor: Processor;
    /** Pass -R so R0..R15 are predefined register symbols. */
    registerSymbols: boolean;
    entrySource: string;
    sources: string[];
    includePaths: string[];
    defines: Record<string, string>;
    outputs: Capability[];
    buildDir: string;
    distDir: string;
    emulatorProfile?: string;
    cartridge?: CartridgeOptions;
    disk?: DiskOptions;
    assembler: AssemblerOptions;
}

export interface ValidationIssue {
    field: string;
    message: string;
    severity: 'error' | 'warning';
    /** Command title that would resolve this, shown in the Problems tree. */
    fix?: string;
}

export const DEFAULT_PROJECT: ProjectConfig = {
    version: 1,
    name: 'untitled',
    type: 'cartridge-rpk',
    syntaxDialect: 'xdt99',
    toolchainProfile: 'xdt99',
    processor: '9900',
    registerSymbols: true,
    entrySource: 'src/main.a99',
    sources: ['src/main.a99'],
    includePaths: ['src', 'lib'],
    defines: {},
    outputs: ['cart-rpk'],
    buildDir: 'build',
    distDir: 'dist',
    cartridge: { name: 'UNTITLED', baseAddress: '>6000', banking: 'none' },
    assembler: { unresolvedReferencePolicy: 'warning', extraArgs: [] },
};

export function defaultUnresolvedPolicy(type: ProjectType): UnresolvedPolicy {
    return type === 'ea3-object' ? 'information' : 'warning';
}

/** Validate before starting a build, so failures name a field rather than a tool. */
export function validate(cfg: ProjectConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!cfg.name) {
        issues.push({ field: 'name', message: 'Project name is required.', severity: 'error' });
    }
    if (!cfg.syntaxDialect) {
        issues.push({
            field: 'syntaxDialect',
            message: 'No syntax dialect set. Formatting and assembly can disagree without it.',
            severity: 'error',
            fix: 'TI-99: Detect Source Dialect',
        });
    }
    if (!cfg.entrySource) {
        issues.push({ field: 'entrySource', message: 'An entry source file is required.', severity: 'error' });
    }
    if (!cfg.outputs || cfg.outputs.length === 0) {
        issues.push({ field: 'outputs', message: 'At least one output format must be selected.', severity: 'error' });
    }

    if (cfg.type === 'cartridge-rpk' || cfg.type === 'cartridge-bin') {
        if (!cfg.cartridge?.name) {
            issues.push({ field: 'cartridge.name', message: 'Cartridge name is required.', severity: 'error' });
        } else if (cfg.cartridge.name.length > 20) {
            issues.push({
                field: 'cartridge.name',
                message: 'Cartridge names longer than 20 characters may be truncated on the menu screen.',
                severity: 'warning',
            });
        }
    }

    if (cfg.type === 'disk' && !cfg.disk?.volumeName) {
        issues.push({ field: 'disk.volumeName', message: 'Disk volume name is required.', severity: 'error' });
    }
    if (cfg.disk?.volumeName && !/^[A-Z0-9_.]{1,10}$/i.test(cfg.disk.volumeName)) {
        issues.push({
            field: 'disk.volumeName',
            message: 'TI volume names are at most 10 characters and cannot contain spaces or punctuation other than . and _.',
            severity: 'error',
        });
    }

    return issues;
}
