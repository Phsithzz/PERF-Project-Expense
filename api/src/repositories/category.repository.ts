import type { Pool } from 'pg';

export interface CategoryRecord {
  id: string;
  slug: string;
  displayName: string;
}

export interface CategoryStatusRecord extends CategoryRecord {
  isActive: boolean;
}

interface CategoryRow {
  id: string;
  slug: string;
  display_name: string;
}

interface CategoryStatusRow extends CategoryRow {
  is_active: boolean;
}

function mapCategory(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
  };
}

export interface CategoryRepository {
  listActive(): Promise<CategoryRecord[]>;
  findStatusById(id: string): Promise<CategoryStatusRecord | null>;
}

export class PostgresCategoryRepository implements CategoryRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async listActive(): Promise<CategoryRecord[]> {
    const result = await this.pool.query<CategoryRow>(
      `SELECT id, slug, display_name
       FROM categories
       WHERE is_active = TRUE
       ORDER BY sort_order ASC`,
    );
    return result.rows.map(mapCategory);
  }

  async findStatusById(id: string): Promise<CategoryStatusRecord | null> {
    const result = await this.pool.query<CategoryStatusRow>(
      `SELECT id, slug, display_name, is_active
       FROM categories
       WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? { ...mapCategory(row), isActive: row.is_active } : null;
  }
}
