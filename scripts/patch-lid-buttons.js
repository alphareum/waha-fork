/**
 * Build-time patch: render native_flow (interactive) buttons to @lid recipients.
 *
 * WAHA's bundled Baileys (@adiwajshing/baileys -> npm:@rexxhayanasi/elaina-baileys)
 * only appends the `biz`/`native_flow` marker -- the node that tells WhatsApp "render
 * these as tappable buttons" -- when the recipient JID is a group or a phone user:
 *
 *     if (((0, WABinary_1.isJidGroup)(jid) || (0, WABinary_1.isJidUser)(jid)) && (contentType === 'interactiveMessage' || ...))
 *
 * For a `@lid` recipient both `isJidGroup` (endsWith '@g.us') and `isJidUser`
 * (endsWith '@s.whatsapp.net') are false, so the marker is skipped: WhatsApp delivers
 * the message body (text survives) but renders no buttons. The same phone arrives as
 * `@c.us` OR `@lid` unpredictably, so buttons were a coin-flip.
 *
 * Fix (one condition): add `|| isLidUser(jid)` so the marker is attached for `@lid` too.
 * `isLidUser` (endsWith '@lid') is already exported from the WABinary module; it was just
 * never used in this path. Proven in the spike on 2026-05-29 (buttons rendered to a real
 * @lid after this exact change). This is the targeted form of that change.
 *
 * Idempotent + fail-loud: if the condition already includes isLidUser we exit 0; if the
 * anchor cannot be found (e.g. a future elaina-baileys bump shifted the code) we exit 1 so
 * the Docker build fails LOUDLY rather than silently shipping an unpatched image.
 */

const fs = require('fs');
const path = require('path');

const REL = 'node_modules/@adiwajshing/baileys/lib/Socket/messages-send.js';
// In the Dockerfile this runs with WORKDIR /git (cwd === /git). Fall back to the repo
// root relative to this script in case it is run from elsewhere.
const candidates = [
  path.join(process.cwd(), REL),
  path.join(__dirname, '..', REL),
];

const TARGET = candidates.find((p) => fs.existsSync(p));

if (!TARGET) {
  console.error('[PATCH-LID] Target not found. Looked in:');
  candidates.forEach((p) => console.error('  - ' + p));
  console.error('[PATCH-LID] Is the @adiwajshing/baileys dependency installed? Aborting.');
  process.exit(1);
}

let code = fs.readFileSync(TARGET, 'utf8');

const ANCHOR = "(0, WABinary_1.isJidUser)(jid)) && (contentType === 'interactiveMessage'";
const REPLACEMENT =
  "(0, WABinary_1.isJidUser)(jid) || (0, WABinary_1.isLidUser)(jid)) && (contentType === 'interactiveMessage'";

// Already patched? (handles re-runs and a future upstream that ships the fix.)
if (code.includes(REPLACEMENT) || code.includes('isLidUser)(jid)) && (contentType')) {
  console.log('[PATCH-LID] Biz-node condition already includes isLidUser; nothing to do.');
  process.exit(0);
}

if (!code.includes(ANCHOR)) {
  console.error('[PATCH-LID] Could not find the biz-node condition anchor:');
  console.error('  ' + ANCHOR);
  console.error('[PATCH-LID] elaina-baileys layout changed -- failing the build so this is caught.');
  process.exit(1);
}

// Sanity: isLidUser must be exported by the WABinary module, or the patched call throws.
const wabinary = path.join(path.dirname(TARGET), '..', 'WABinary', 'jid-utils.js');
try {
  if (fs.existsSync(wabinary) && !fs.readFileSync(wabinary, 'utf8').includes('isLidUser')) {
    console.error('[PATCH-LID] WABinary does not export isLidUser at ' + wabinary + ' -- aborting.');
    process.exit(1);
  }
} catch (_) {
  // Non-fatal: if we cannot locate the helper file we still proceed; the runtime require
  // resolves isLidUser from the package's WABinary index (confirmed present in 1.2.9).
}

code = code.replace(ANCHOR, REPLACEMENT);

if (!code.includes(REPLACEMENT)) {
  console.error('[PATCH-LID] Replacement did not apply. Aborting.');
  process.exit(1);
}

fs.writeFileSync(TARGET, code);
console.log('[PATCH-LID] Patched ' + TARGET);
console.log('[PATCH-LID] Biz-node marker now attached for @lid recipients (buttons render on @lid).');
