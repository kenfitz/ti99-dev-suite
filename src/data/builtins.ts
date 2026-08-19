/**
 * Built-in symbol library for the TI-99/4A console and the Editor/Assembler
 * environment. Registering these as known externals means `REF VMBW` resolves,
 * hovers with documentation, and does not raise a spurious "unresolved symbol".
 *
 * Addresses taken from the TMS9900 cheat sheet v1.0 and the E/A manual.
 */

export type BuiltinProvider = 'ea' | 'console' | 'xb';

export interface BuiltinSymbol {
    name: string;
    /** Absolute address, where one is fixed and documented. */
    value?: number;
    kind: 'routine' | 'address';
    provider: BuiltinProvider;
    summary: string;
    detail?: string;
}

export const EA_UTILITIES: BuiltinSymbol[] = [
    { name: 'VSBW', value: 0x2020, kind: 'routine', provider: 'ea',
        summary: 'VDP single byte write',
        detail: 'R0 = VDP address, R1 high byte = data. Requires `REF VSBW`.' },
    { name: 'VMBW', value: 0x2024, kind: 'routine', provider: 'ea',
        summary: 'VDP multiple byte write',
        detail: 'R0 = VDP address, R1 = CPU source address, R2 = byte count. Requires `REF VMBW`.' },
    { name: 'VSBR', kind: 'routine', provider: 'ea',
        summary: 'VDP single byte read',
        detail: 'R0 = VDP address; result in R1 high byte. Requires `REF VSBR`.' },
    { name: 'VMBR', kind: 'routine', provider: 'ea',
        summary: 'VDP multiple byte read',
        detail: 'R0 = VDP address, R1 = CPU destination, R2 = byte count. Requires `REF VMBR`.' },
    { name: 'VWTR', value: 0x2030, kind: 'routine', provider: 'ea',
        summary: 'VDP write to register',
        detail: 'R0 high byte = register number, R0 low byte = value. Requires `REF VWTR`.' },
    { name: 'KSCAN', kind: 'routine', provider: 'ea',
        summary: 'Scan the keyboard',
        detail: 'Set >8374 to the keyboard unit first. Returns the key in >8375 and status in >837C. Requires `REF KSCAN`.' },
    { name: 'GPLLNK', kind: 'routine', provider: 'ea',
        summary: 'Call a GPL routine in console ROM',
        detail: 'Followed by a DATA word holding the GPL entry address. Requires `REF GPLLNK`.' },
    { name: 'XMLLNK', value: 0x2018, kind: 'routine', provider: 'ea',
        summary: 'Call an assembly routine in console ROM',
        detail: 'Followed by a DATA word holding the routine index. Requires `REF XMLLNK`.' },
    { name: 'DSRLNK', kind: 'routine', provider: 'ea',
        summary: 'Call a device service routine',
        detail: 'Followed by DATA 8 for files or DATA 10 for subprograms. Requires `REF DSRLNK`.' },
    { name: 'LOADER', kind: 'routine', provider: 'ea', summary: 'Load an object file at run time' },
    { name: 'NUMASG', value: 0x2008, kind: 'routine', provider: 'xb', summary: 'Assign a numeric value to an XB variable' },
    { name: 'NUMREF', value: 0x200C, kind: 'routine', provider: 'xb', summary: 'Read a numeric parameter from XB' },
    { name: 'STRASG', value: 0x2010, kind: 'routine', provider: 'xb', summary: 'Assign a string to an XB variable' },
    { name: 'STRREF', value: 0x2014, kind: 'routine', provider: 'xb', summary: 'Read a string parameter from XB' },
    { name: 'ERR', kind: 'routine', provider: 'xb', summary: 'Report an error to XB' },
];

export const CONSOLE_ADDRESSES: BuiltinSymbol[] = [
    { name: 'VDPRD', value: 0x8800, kind: 'address', provider: 'console', summary: 'VDP read data port' },
    { name: 'VDPSTA', value: 0x8802, kind: 'address', provider: 'console', summary: 'VDP status port' },
    { name: 'VDPWD', value: 0x8C00, kind: 'address', provider: 'console', summary: 'VDP write data port' },
    { name: 'VDPWA', value: 0x8C02, kind: 'address', provider: 'console', summary: 'VDP set read/write address port',
        detail: 'Write the low byte then the high byte. Set bit 6 of the high byte for a write.' },
    { name: 'GRMRD', value: 0x9800, kind: 'address', provider: 'console', summary: 'GROM read data port' },
    { name: 'GRMRA', value: 0x9802, kind: 'address', provider: 'console', summary: 'GROM read address port' },
    { name: 'GRMWD', value: 0x9C00, kind: 'address', provider: 'console', summary: 'GROM write data port' },
    { name: 'GRMWA', value: 0x9C02, kind: 'address', provider: 'console', summary: 'GROM write address port' },
    { name: 'SOUND', value: 0x8400, kind: 'address', provider: 'console', summary: 'Sound chip port (TMS9919)' },
    { name: 'SCRPAD', value: 0x8300, kind: 'address', provider: 'console', summary: 'Start of 256-byte scratchpad RAM',
        detail: 'Not multiplexed, so accesses avoid the 4-cycle wait state. The conventional home for your workspace.' },
    { name: 'RAND16', value: 0x83C0, kind: 'address', provider: 'console', summary: '16-bit random number, maintained by the console ISR' },
    { name: 'RANDOM', value: 0x83C1, kind: 'address', provider: 'console', summary: '8-bit random number' },
    { name: 'FAC', value: 0x834A, kind: 'address', provider: 'console', summary: 'Floating point accumulator' },
    { name: 'KEYBRD', value: 0x8374, kind: 'address', provider: 'console', summary: 'Keyboard unit select for KSCAN' },
    { name: 'KEYCOD', value: 0x8375, kind: 'address', provider: 'console', summary: 'Key code returned by KSCAN' },
    { name: 'STATUS', value: 0x837C, kind: 'address', provider: 'console', summary: 'GPL status byte' },
    { name: 'SPRMOT', value: 0x837A, kind: 'address', provider: 'console', summary: 'Number of sprites in automatic motion',
        detail: 'Clear this early in a cartridge, or the console ISR will move sprites you have not defined.' },
];

export const ALL_BUILTINS: BuiltinSymbol[] = [...EA_UTILITIES, ...CONSOLE_ADDRESSES];

const index = new Map<string, BuiltinSymbol>();
for (const s of ALL_BUILTINS) index.set(s.name.toUpperCase(), s);

export function lookupBuiltin(name: string): BuiltinSymbol | undefined {
    return index.get(name.toUpperCase());
}

export function describeBuiltin(s: BuiltinSymbol): string {
    const lines: string[] = [];
    const val = s.value !== undefined
        ? ` = >${s.value.toString(16).toUpperCase().padStart(4, '0')}`
        : '';
    lines.push('```tms9900');
    lines.push(`${s.name}${val}`);
    lines.push('```');
    lines.push(`**${s.summary}**`);
    if (s.detail) {
        lines.push('');
        lines.push(s.detail);
    }
    lines.push('');
    const provider = { ea: 'Editor/Assembler', console: 'console ROM', xb: 'Extended BASIC' }[s.provider];
    lines.push(`*Supplied by:* ${provider}`);
    return lines.join('\n');
}
