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
    | 'disk-image' | 'tifiles' | 'basic-program';

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
    /**
     * TI BASIC / Extended BASIC source to tokenise for the 'basic-program'
     * capability. An Extended BASIC boot disk needs a program called LOAD,
     * which XB runs at power-up; this is where that program comes from.
     */
    basicSource?: string;
    /** On-disk name for the tokenised program. Defaults to LOAD. */
    basicName?: string;
    assembler: AssemblerOptions;
    /** Distribution routes. Omit for a single-output project. */
    targets?: TargetConfig[];
}
/**
 * One distribution route.
 *
 * A target is a partial override of the project config: it names its own
 * entry source, output set and dist folder, and inherits everything else.
 * Merging a target onto the base produces an ordinary ProjectConfig, so the
 * build path below it is unchanged and a project without targets behaves
 * exactly as before.
 */
export interface TargetConfig {
    /** Stable identifier, used on the command line and in the build cache. */
    id: string;
    /** Shown in the target picker. Defaults to the id. */
    label?: string;
    description?: string;
    type?: ProjectType;
    entrySource?: string;
    sources?: string[];
    includePaths?: string[];
    defines?: Record<string, string>;
    outputs?: Capability[];
    buildDir?: string;
    distDir?: string;
    emulatorProfile?: string;
    cartridge?: CartridgeOptions;
    disk?: DiskOptions;
    basicSource?: string;
    basicName?: string;
    assembler?: Partial<AssemblerOptions>;
}

/** Target ids in declaration order. Empty when the project has no targets. */
export function targetIds(cfg: ProjectConfig): string[] {
    return (cfg.targets ?? []).map(t => t.id);
}

export function findTarget(cfg: ProjectConfig, id: string): TargetConfig | undefined {
    return (cfg.targets ?? []).find(t => t.id === id);
}

/**
 * Merge a target onto the base config.
 *
 * With no targets, or no id, this returns the base unchanged, which is what
 * keeps single-target projects working. An unknown id is an error rather than
 * a silent fallback: building the wrong thing is worse than not building.
 */
export function resolveTarget(cfg: ProjectConfig, id?: string): ProjectConfig {
    const targets = cfg.targets ?? [];
    if (targets.length === 0) return cfg;

    const target = id ? findTarget(cfg, id) : targets[0];
    if (!target) {
        throw new Error(
            `Unknown target '${id}'. This project defines: ${targetIds(cfg).join(', ')}.`);
    }

    // entrySource is the usual reason a target exists, so when it is overridden
    // without an explicit source list, the entry becomes the source list.
    const sources = target.sources
        ?? (target.entrySource ? [target.entrySource] : cfg.sources);

    return {
        ...cfg,
        type: target.type ?? cfg.type,
        entrySource: target.entrySource ?? cfg.entrySource,
        sources,
        includePaths: target.includePaths ?? cfg.includePaths,
        defines: target.defines ?? cfg.defines,
        outputs: target.outputs ?? cfg.outputs,
        buildDir: target.buildDir ?? cfg.buildDir,
        distDir: target.distDir ?? cfg.distDir,
        emulatorProfile: target.emulatorProfile ?? cfg.emulatorProfile,
        cartridge: target.cartridge ?? cfg.cartridge,
        disk: target.disk ?? cfg.disk,
        basicSource: target.basicSource ?? cfg.basicSource,
        basicName: target.basicName ?? cfg.basicName,
        assembler: { ...cfg.assembler, ...target.assembler },
        // A resolved target is a plain config. Dropping the list prevents a
        // second resolve from being applied on top of the first.
        targets: undefined,
    };
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

    // Validate each target by resolving it and validating the result, so a
    // target cannot pass by inheriting a field it actually overrides badly.
    const seen = new Set<string>();
    for (const target of cfg.targets ?? []) {
        if (!target.id) {
            issues.push({ field: 'targets[].id', message: 'Every target needs an id.', severity: 'error' });
            continue;
        }
        if (seen.has(target.id)) {
            issues.push({
                field: `targets.${target.id}`,
                message: `Duplicate target id '${target.id}'.`,
                severity: 'error',
            });
            continue;
        }
        seen.add(target.id);

        // Guard against a target writing its artifacts on top of another's.
        const clash = (cfg.targets ?? []).find(
            o => o !== target && o.id && (o.distDir ?? cfg.distDir) === (target.distDir ?? cfg.distDir));
        if (clash) {
            issues.push({
                field: `targets.${target.id}.distDir`,
                message: `Targets '${target.id}' and '${clash.id}' share distDir ` +
                    `'${target.distDir ?? cfg.distDir}'; their artifacts would overwrite each other.`,
                severity: 'warning',
            });
        }

        for (const issue of validate(resolveTarget(cfg, target.id))) {
            issues.push({ ...issue, field: `targets.${target.id}.${issue.field}` });
        }
    }

    return issues;
}
