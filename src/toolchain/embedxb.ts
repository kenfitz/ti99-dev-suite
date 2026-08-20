/**
 * Compatibility guard for the xas99 --embed-xb option.
 *
 * xdt99 3.6.5 and earlier compute the loader padding as
 *
 *     bytes(256 - size + 1)
 *
 * where size is the assembled code size. Once the code exceeds 257 bytes that
 * count goes negative and Python raises ValueError: negative count, so xas99
 * aborts and writes nothing.
 *
 * What that means in practice, established by running a stock installation
 * rather than assuming:
 *
 *   - It does NOT produce a corrupt artifact. It produces no artifact at all
 *     and exits non-zero. The build already fails; what the user sees is an
 *     unexplained Python traceback.
 *   - Below the threshold, stock and fixed installations produce byte-identical
 *     output, so the fix is a no-op for small programs and there is no
 *     divergence to worry about.
 *
 * The guard therefore exists to turn an opaque crash into an actionable
 * message, and to stop before doing work that cannot succeed.
 *
 * The extension must never modify a user installation of xdt99. This module
 * only observes and reports.
 */

/**
 * Largest code size a stock installation can embed.
 *
 * 256 - size + 1 reaches zero at 257 and goes negative at 258. Verified by
 * assembling programs either side of the boundary.
 */
export const EMBED_XB_MAX_SAFE_SIZE = 257;

/** What a probe found out about this installation. */
export type EmbedXbCapability =
    /** Handles any payload size. The padding calculation is guarded. */
    | 'fixed'
    /** Fails once the code exceeds EMBED_XB_MAX_SAFE_SIZE. */
    | 'affected'
    /** The probe could not run or its result could not be interpreted. */
    | 'unknown';

export interface EmbedXbProbe {
    capability: EmbedXbCapability;
    /** One sentence describing what was observed, for the output channel. */
    detail: string;
}

/**
 * The signature of the failure, as emitted by Python.
 *
 * Matched case-insensitively and without anchoring, because the traceback
 * wraps it in surrounding text that varies between Python versions.
 */
const NEGATIVE_COUNT = /negative count/i;

/**
 * Classify the result of assembling the probe program.
 *
 * The probe is deliberately a program just over the threshold, so a fixed
 * installation succeeds and an affected one raises. Anything else is reported
 * as unknown rather than guessed at, because a probe that failed for an
 * unrelated reason says nothing about this option.
 */
export function classifyProbe(
    exitCode: number | null, output: string, artifactExists: boolean,
): EmbedXbProbe {
    if (exitCode === 0 && artifactExists) {
        return {
            capability: 'fixed',
            detail: 'xas99 embedded a program larger than ' +
                EMBED_XB_MAX_SAFE_SIZE + ' bytes successfully.',
        };
    }
    if (NEGATIVE_COUNT.test(output)) {
        return {
            capability: 'affected',
            detail: 'xas99 failed with "negative count", the padding defect ' +
                'present in xdt99 3.6.5 and earlier.',
        };
    }
    if (exitCode === null) {
        return { capability: 'unknown', detail: 'The probe could not be started.' };
    }
    return {
        capability: 'unknown',
        detail: 'The probe exited with code ' + exitCode +
            ' for a reason unrelated to the padding defect.',
    };
}

/**
 * Source for the probe program.
 *
 * BSS pads the program to a chosen size without emitting instructions, so the
 * probe stays one byte over the boundary rather than approximating it.
 */
export function probeSource(size: number = EMBED_XB_MAX_SAFE_SIZE + 1): string {
    // MAIN is the two-byte return; BSS supplies the rest.
    return [
        '       DEF  MAIN',
        'MAIN   B    *R11',
        '       BSS  ' + (size - 2),
        '       END',
        '',
    ].join('\n');
}

export interface EmbedXbDecision {
    allowed: boolean;
    /** Present when the build must not proceed. */
    message?: string;
    /** Longer explanation for the output channel. */
    detail?: string;
}

/**
 * Decide whether an Extended BASIC loader build may proceed.
 *
 * Conservative by design. When the installation is affected, the build is
 * stopped even though a program of 257 bytes or fewer would still work,
 * because a program that small is not a realistic distribution and because
 * the code size is not known until the assembly has already run. The message
 * states the threshold so a user with a genuinely tiny program understands
 * the limit rather than only being refused.
 */
export function decideEmbedXb(probe: EmbedXbProbe): EmbedXbDecision {
    if (probe.capability === 'fixed') {
        return { allowed: true };
    }
    if (probe.capability === 'unknown') {
        // Not proven affected, so not blocked. If it does fail, the failure is
        // translated afterwards by explainEmbedXbFailure.
        return { allowed: true, detail: 'embed-xb support could not be verified: ' + probe.detail };
    }
    return {
        allowed: false,
        message: 'This xdt99 cannot build an Extended BASIC loader for a program ' +
            'larger than ' + EMBED_XB_MAX_SAFE_SIZE + ' bytes.',
        detail: [
            'Affected capability: the --embed-xb option of xas99.',
            'Detected behaviour: ' + probe.detail,
            'Why the loader cannot be built safely: xas99 computes the loader ' +
                'padding as 256 - size + 1. Once the assembled code passes ' +
                EMBED_XB_MAX_SAFE_SIZE + ' bytes that count goes negative, and ' +
                'xas99 stops without writing a program. No usable disk is produced.',
            'Your xdt99 installation has not been modified. The extension does ' +
                'not patch tools it did not install.',
            'What is required: an xdt99 release in which the padding count is ' +
                'clamped at zero. Until then, the cartridge, E/A option 3, E/A ' +
                'option 5 and E/A disk routes are unaffected and build normally.',
        ].join('\n'),
    };
}

/**
 * Translate the raw failure into the same explanation, after the fact.
 *
 * A backstop for the case where the probe was inconclusive and the real build
 * then hit the defect. Returns undefined when the failure was something else,
 * so unrelated errors keep their own message.
 */
export function explainEmbedXbFailure(output: string): string | undefined {
    if (!NEGATIVE_COUNT.test(output)) { return undefined; }
    return decideEmbedXb({
        capability: 'affected',
        detail: 'xas99 failed with "negative count" during this build.',
    }).detail;
}
