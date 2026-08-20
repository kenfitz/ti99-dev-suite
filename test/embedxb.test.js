// The xas99 --embed-xb compatibility guard.
//
// xdt99 3.6.5 and earlier compute the loader padding as 256 - size + 1, which
// goes negative once the assembled code passes 257 bytes. Python then raises
// ValueError: negative count and xas99 writes nothing.
//
// The behaviour below was established by running a stock installation, not by
// reading the code and assuming. Both outcomes are modelled here so the guard
// is not tested only against the patched installation on this machine.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
    EMBED_XB_MAX_SAFE_SIZE, classifyProbe, decideEmbedXb, explainEmbedXbFailure,
    probeSource,
} = require("../out/toolchain/embedxb.js");

// What a stock installation actually prints. Trimmed from a real run.
const STOCK_FAILURE = [
    "Traceback (most recent call last):",
    '  File "xas99.py", line 3200, in embed',
    "    token_table = (bytes((len(loader) + 1,)) + loader + bytes(256 - size + 1) + payload",
    "ValueError: negative count",
].join("\n");

test("the threshold matches the arithmetic in xas99", () => {
    // 256 - size + 1 reaches zero at 257 and goes negative at 258.
    assert.strictEqual(EMBED_XB_MAX_SAFE_SIZE, 257);
    assert.strictEqual(256 - EMBED_XB_MAX_SAFE_SIZE + 1, 0);
    assert.ok(256 - (EMBED_XB_MAX_SAFE_SIZE + 1) + 1 < 0);
});

test("the probe program sits one byte over the boundary", () => {
    const src = probeSource();
    assert.match(src, /BSS\s+256/, "two bytes of code plus 256 reserved is 258");
    assert.match(src, /--embed-xb|DEF\s+MAIN/, "must be a valid embeddable program");
});

test("a stock installation is classified as affected", () => {
    const probe = classifyProbe(1, STOCK_FAILURE, false);
    assert.strictEqual(probe.capability, "affected");
    assert.match(probe.detail, /negative count/);
});

test("a fixed installation is classified as fixed", () => {
    const probe = classifyProbe(0, "", true);
    assert.strictEqual(probe.capability, "fixed");
});

test("exit zero without an artifact is not treated as success", () => {
    // A tool can return zero and write nothing. That is not proof of a fix.
    const probe = classifyProbe(0, "", false);
    assert.notStrictEqual(probe.capability, "fixed");
});

test("an unrelated failure is not blamed on the padding defect", () => {
    const probe = classifyProbe(1, "error: cannot open source file", false);
    assert.strictEqual(probe.capability, "unknown");
    const spawnFailure = classifyProbe(null, "", false);
    assert.strictEqual(spawnFailure.capability, "unknown");
});

test("an affected installation blocks the build", () => {
    const decision = decideEmbedXb(classifyProbe(1, STOCK_FAILURE, false));
    assert.strictEqual(decision.allowed, false);
    assert.ok(decision.message, "must carry a user-facing message");
    assert.ok(decision.detail, "must carry an explanation");
});

test("the block explains everything the requirement asks for", () => {
    const { detail, message } = decideEmbedXb(classifyProbe(1, STOCK_FAILURE, false));
    const all = message + "\n" + detail;
    assert.match(all, /--embed-xb/, "names the affected capability");
    assert.match(all, /negative count/, "names the detected behaviour");
    assert.match(all, /256 - size \+ 1/, "explains why it cannot be built");
    assert.match(all, /has not been modified/, "states the install was untouched");
    assert.match(all, /xdt99 release/, "says what is required to fix it");
    assert.match(all, new RegExp(String(EMBED_XB_MAX_SAFE_SIZE)), "states the threshold");
});

test("the block names the routes that still work", () => {
    // A user blocked from one route needs to know the others are unaffected.
    const { detail } = decideEmbedXb(classifyProbe(1, STOCK_FAILURE, false));
    for (const route of ["cartridge", "option 3", "option 5", "disk"]) {
        assert.ok(detail.toLowerCase().includes(route.toLowerCase()), route);
    }
});

test("a fixed installation is allowed through silently", () => {
    const decision = decideEmbedXb(classifyProbe(0, "", true));
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.message, undefined);
});

test("an inconclusive probe does not block, but is reported", () => {
    // Not proven affected is not the same as proven broken. The build runs and
    // the failure translation acts as the backstop.
    const decision = decideEmbedXb(classifyProbe(1, "something else", false));
    assert.strictEqual(decision.allowed, true);
    assert.match(decision.detail, /could not be verified/);
});

test("a raw failure is translated into the same explanation", () => {
    const explained = explainEmbedXbFailure(STOCK_FAILURE);
    assert.ok(explained);
    assert.match(explained, /has not been modified/);
});

test("an unrelated failure keeps its own message", () => {
    assert.strictEqual(explainEmbedXbFailure("error: no such file"), undefined);
    assert.strictEqual(explainEmbedXbFailure(""), undefined);
});

// The live check. It runs only where a real xdt99 is present, and it is the
// reason the constants above can be trusted: it asserts the boundary against
// the actual tool rather than against our reading of it.
test("the boundary holds against a real xdt99", (t) => {
    const xdt = "C:/Users/kenfi/OneDrive/Desktop/xdt99-master";
    const stock = path.join(xdt, "xas99.py.bak-before-embedxb-fix");
    if (!fs.existsSync(stock)) {
        t.skip("no stock xdt99 available on this machine");
        return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ti99-embedxb-test-"));
    const assemble = (size) => {
        const src = path.join(dir, "p.a99");
        const out = path.join(dir, "p.prg");
        fs.rmSync(out, { force: true });
        fs.writeFileSync(src, probeSource(size), "utf8");
        try {
            execFileSync("python", [stock, "-R", "--embed-xb", src, "-o", out],
                { stdio: "pipe" });
            return { failed: false, artifact: fs.existsSync(out) };
        } catch (e) {
            return { failed: true, output: String(e.stderr || "") + String(e.stdout || "") };
        }
    };

    const under = assemble(EMBED_XB_MAX_SAFE_SIZE);
    assert.strictEqual(under.failed, false, "at the threshold stock xdt99 still works");
    assert.ok(under.artifact, "and writes a program");

    const over = assemble(EMBED_XB_MAX_SAFE_SIZE + 1);
    assert.strictEqual(over.failed, true, "one byte over, stock xdt99 fails");
    assert.strictEqual(classifyProbe(1, over.output, false).capability, "affected",
        "and the guard recognises it");

    fs.rmSync(dir, { recursive: true, force: true });
});
