import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('OpenAPI executable contract', () => {
  it('validates operation inventory, references, examples, security, and error parity', async () => {
    const repositoryRoot = path.resolve('../..');
    const validator = path.join(repositoryRoot, 'docs', 'api', 'validate_contract.py');
    const { stdout, stderr } = await execFileAsync('python', [validator], {
      cwd: repositoryRoot,
      timeout: 30_000,
      windowsHide: true,
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('OPENAPI_CONTRACT_CHECKS_OK');
  });
});
