import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
    }),
  );

  return nested.flat();
}

describe('backend architecture boundaries', () => {
  it('keeps SQL statements inside repositories', async () => {
    const sourceRoot = path.resolve('src');
    const sourceFiles = await collectTypeScriptFiles(sourceRoot);
    const sqlPattern = /(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\s+/i;
    const violations: string[] = [];

    for (const file of sourceFiles) {
      if (file.includes(`${path.sep}repositories${path.sep}`)) {
        continue;
      }

      const source = await readFile(file, 'utf8');
      if (sqlPattern.test(source)) {
        violations.push(path.relative(sourceRoot, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
