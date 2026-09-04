/**
 * Accessible title for a GM tweak-panel lock toggle (`wireLockButton` in `blades.ts`). The glyph
 * alone ("🔒"/"🔓") is identical across every row on the panel — not enough to find a specific
 * field's toggle by accessible text (e.g. Playwright's `getByTitle`) — so the field name leads.
 * Kept in its own module (no `tweakpane` import) so it can be unit-tested without pulling in the
 * real Tweakpane package, which Jest can't parse (it ships ESM-only).
 */
export function lockButtonTitle(field: string, locked: boolean): string {
    return `${field} ${locked ? 'locked 🔒' : 'unlocked 🔓'}`;
}
