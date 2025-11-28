/**
 * Normalizes a name for card embossing:
 *  - Uses provided full name or falls back to email local part or "DIVVI USER".
 *  - Uppercases, trims, collapses whitespace, and truncates to max length.
 */
export function buildEmbossName(
  fullName?: string | null,
  email?: string | null,
  maxLength: number = 21
): string {
  const fallbackEmail = email?.split("@")[0];
  const raw =
    (fullName && fullName.trim()) ||
    (fallbackEmail && fallbackEmail.trim()) ||
    "DIVVI USER";

  const upper = raw.toUpperCase().replace(/\s+/g, " ").trim();
  return upper.slice(0, maxLength);
}
