import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PostgresExpenseRepository } from '../../../src/repositories/expense.repository.js';

function repositoryWithQuerySpy() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const repository = new PostgresExpenseRepository({
    query,
  } as unknown as Pick<Pool, 'query'>);
  return { query, repository };
}

describe('PostgresExpenseRepository list query', () => {
  it('keeps search/filter values parameterized and escapes ILIKE wildcard characters', async () => {
    const { query, repository } = repositoryWithQuerySpy();
    const hostileSearch = `50%_\\' OR TRUE --`;

    await repository.listOwned({
      userId: '20000000-0000-4000-8000-000000000001',
      q: hostileSearch,
      categoryId: '10000000-0000-4000-8000-000000000001',
      from: '2026-08-01',
      to: '2026-08-31',
      sort: 'amountDesc',
      limit: 20,
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain(hostileSearch);
    expect(sql).not.toContain('SELECT *');
    expect(sql).toContain('ORDER BY e.amount DESC, e.id DESC');
    expect(values).toContain(`%50\\%\\_\\\\' OR TRUE --%`);
    expect(values.at(-1)).toBe(21);
  });

  it('uses a matching composite comparison for cursor direction', async () => {
    const { query, repository } = repositoryWithQuerySpy();

    await repository.listOwned({
      userId: '20000000-0000-4000-8000-000000000001',
      sort: 'expenseDateAsc',
      limit: 2,
      after: {
        sortValue: '2026-08-08',
        id: '30000000-0000-4000-8000-000000000001',
      },
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('(e.expense_date, e.id) > ($2::date, $3::uuid)');
    expect(sql).toContain('ORDER BY e.expense_date ASC, e.id ASC');
    expect(values).toEqual([
      '20000000-0000-4000-8000-000000000001',
      '2026-08-08',
      '30000000-0000-4000-8000-000000000001',
      3,
    ]);
  });
});
