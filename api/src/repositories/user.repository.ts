import type { Pool } from 'pg';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeUserRecord {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

interface SafeUserRow {
  id: string;
  name: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

export class DuplicateEmailRepositoryError extends Error {
  constructor() {
    super('Normalized email already exists');
    this.name = 'DuplicateEmailRepositoryError';
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'users_email_unique'
  );
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSafeUser(row: SafeUserRow): SafeUserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<SafeUserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findSafeById(id: string): Promise<SafeUserRecord | null>;
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async create(input: CreateUserInput): Promise<SafeUserRecord> {
    try {
      const result = await this.pool.query<SafeUserRow>(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, created_at, updated_at`,
        [input.name, input.email, input.passwordHash],
      );
      return mapSafeUser(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateEmailRepositoryError();
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, name, email, password_hash, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email],
    );
    const row = result.rows[0];
    return row ? mapUser(row) : null;
  }

  async findSafeById(id: string): Promise<SafeUserRecord | null> {
    const result = await this.pool.query<SafeUserRow>(
      `SELECT id, name, email, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? mapSafeUser(row) : null;
  }
}
