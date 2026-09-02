import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | null = null;

export function loadDesignSystem(): string {
  if (cached === null) {
    const path = join(process.cwd(), 'docs', 'brand', 'DESIGN.md');
    cached = readFileSync(path, 'utf-8');
  }
  return cached;
}
