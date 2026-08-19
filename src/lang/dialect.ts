export type SyntaxDialect = 'ea' | 'xdt99' | 'relaxed';

export interface DialectInfo {
    id: SyntaxDialect;
    label: string;
    description: string;
    /** Flag passed to xas99 to select this dialect. */
    assemblerFlag: string;
    /** Human-readable description of where the comment field begins. */
    commentRule: string;
}

export interface DialectDetection {
    dialect: SyntaxDialect;
    /** 0..1. Low values mean "no strong signal, this is the safe default". */
    confidence: number;
    reason: string;
}

export const DIALECTS: Record<SyntaxDialect, DialectInfo> = {
    ea: {
        id: 'ea',
        label: 'Editor/Assembler (strict)',
        description:
            'TI Editor/Assembler compatible. A single blank ends the operand field. ' +
            'Required for most legacy sources, including those written with Asm994a.',
        assemblerFlag: '-s',
        commentRule: 'one or more blanks after the operand',
    },
    xdt99: {
        id: 'xdt99',
        label: 'xas99 extended',
        description:
            'xas99 default. Two or more blanks, or a tab, end the operand field; ' +
            'single blanks may pad expressions. Enables local labels, macros, ' +
            'BANK, SAVE, extended expressions and Unicode labels.',
        assemblerFlag: '',
        commentRule: 'two blanks or a tab after the operand',
    },
    relaxed: {
        id: 'relaxed',
        label: 'xas99 relaxed',
        description:
            'Whitespace is unrestricted anywhere. Comments after the operand field ' +
            'must be introduced with a semicolon.',
        assemblerFlag: '-r',
        commentRule: 'a semicolon',
    },
};

/**
 * Guess the dialect of an existing source file.
 * Used by the project import wizard; defaults to the safe choice.
 */
export function detectDialect(text: string): DialectDetection {
    const lines = text.split(/\r?\n/);
    let singleBlankComments = 0;
    let semicolonComments = 0;
    let code = 0;

    for (const line of lines) {
        if (!line.trim() || line[0] === '*' || line[0] === ';') continue;
        code++;
        if (/;/.test(line)) semicolonComments++;
        // operand followed by exactly one blank then a '*' comment
        if (/\S\s\*(?!\S*')/.test(line) && !/^\s*\S+\s+\S*\*[Rr]/.test(line)) singleBlankComments++;
    }

    if (singleBlankComments > 0) {
        return {
            dialect: 'ea',
            confidence: Math.min(1, singleBlankComments / 5),
            reason:
                `${singleBlankComments} line(s) separate a comment from the operand by a single blank, ` +
                `which only assembles with -s (strict).`,
        };
    }
    if (semicolonComments > code * 0.3) {
        return { dialect: 'xdt99', confidence: 0.6, reason: 'Semicolon comments are used throughout.' };
    }
    return { dialect: 'ea', confidence: 0.3, reason: 'No strong signal; defaulting to the compatible dialect.' };
}
