/** Extract toon name from .toon__name text, e.g. "Chimps Mode (111)" -> "Chimps Mode" */
export function extractToonName(raw: string): string {
  return raw.replace(/\s*\(\d+\)\s*$/, '').trim();
}
