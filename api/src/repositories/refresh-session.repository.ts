import type { Pool, PoolClient } from 'pg';

import type { ClientType } from '../validation/auth.validation.js';
import type { SafeUserRecord } from './user.repository.js';

export interface CreateRefreshSessionInput {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  clientType: ClientType;
  expiresAt: Date;
  createdAt: Date;
}

export interface RotateRefreshSessionInput {
  tokenHash: string;
  clientType: ClientType;
  newSessionId: string;
  newTokenHash: string;
  now: Date;
}

interface RefreshSessionRow {
  id: string;
  user_id: string;
  family_id: string;
  client_type: ClientType;
  expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
  replaced_by_id: string | null;
  user_name: string;
  user_email: string;
  user_created_at: Date;
  user_updated_at: Date;
}

export type RotateRefreshSessionResult =
  | { outcome: 'rotated'; user: SafeUserRecord; expiresAt: Date }
  | { outcome: 'invalid' }
  | { outcome: 'reused' };

export interface RefreshSessionRepository {
  create(input: CreateRefreshSessionInput): Promise<void>;
  rotate(input: RotateRefreshSessionInput): Promise<RotateRefreshSessionResult>;
  revokeByToken(tokenHash: string, clientType: ClientType, now: Date): Promise<void>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
}

function mapUser(row: RefreshSessionRow): SafeUserRecord {
  return {
    id: row.user_id,
    name: row.user_name,
    email: row.user_email,
    createdAt: row.user_created_at,
    updatedAt: row.user_updated_at,
  };
}

async function rollbackSafely(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original transaction error.
  }
}

export class PostgresRefreshSessionRepository implements RefreshSessionRepository {
  constructor(private readonly pool: Pick<Pool, 'connect' | 'query'>) {}

  async create(input: CreateRefreshSessionInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_sessions (
         id, user_id, family_id, token_hash, client_type, expires_at, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        input.userId,
        input.familyId,
        input.tokenHash,
        input.clientType,
        input.expiresAt,
        input.createdAt,
      ],
    );
  }

  async rotate(input: RotateRefreshSessionInput): Promise<RotateRefreshSessionResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query<RefreshSessionRow>(
        `SELECT
           rs.id,
           rs.user_id,
           rs.family_id,
           rs.client_type,
           rs.expires_at,
           rs.revoked_at,
           rs.revoke_reason,
           rs.replaced_by_id,
           u.name AS user_name,
           u.email AS user_email,
           u.created_at AS user_created_at,
           u.updated_at AS user_updated_at
         FROM refresh_sessions AS rs
         INNER JOIN users AS u ON u.id = rs.user_id
         WHERE rs.token_hash = $1
         FOR UPDATE OF rs`,
        [input.tokenHash],
      );
      const session = result.rows[0];

      if (!session || session.client_type !== input.clientType) {
        await client.query('COMMIT');
        return { outcome: 'invalid' };
      }

      if (session.revoked_at) {
        if (session.replaced_by_id || session.revoke_reason === 'rotated') {
          await client.query(
            `UPDATE refresh_sessions
             SET revoked_at = $2, revoke_reason = 'reuse_detected'
             WHERE family_id = $1
               AND revoked_at IS NULL`,
            [session.family_id, input.now],
          );
          await client.query('COMMIT');
          return { outcome: 'reused' };
        }

        await client.query('COMMIT');
        return { outcome: 'invalid' };
      }

      if (session.expires_at.getTime() <= input.now.getTime()) {
        await client.query(
          `UPDATE refresh_sessions
           SET revoked_at = $2, revoke_reason = 'expired'
           WHERE id = $1`,
          [session.id, input.now],
        );
        await client.query('COMMIT');
        return { outcome: 'invalid' };
      }

      await client.query(
        `INSERT INTO refresh_sessions (
           id, user_id, family_id, token_hash, client_type, expires_at, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.newSessionId,
          session.user_id,
          session.family_id,
          input.newTokenHash,
          session.client_type,
          session.expires_at,
          input.now,
        ],
      );
      await client.query(
        `UPDATE refresh_sessions
         SET
           replaced_by_id = $2,
           last_used_at = $3,
           revoked_at = $3,
           revoke_reason = 'rotated'
         WHERE id = $1`,
        [session.id, input.newSessionId, input.now],
      );
      await client.query('COMMIT');

      return {
        outcome: 'rotated',
        user: mapUser(session),
        expiresAt: session.expires_at,
      };
    } catch (error) {
      await rollbackSafely(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeByToken(tokenHash: string, clientType: ClientType, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_sessions
       SET revoked_at = $3, revoke_reason = 'logout'
       WHERE token_hash = $1
         AND client_type = $2
         AND revoked_at IS NULL`,
      [tokenHash, clientType, now],
    );
  }

  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_sessions
       SET revoked_at = $2, revoke_reason = 'logout_all'
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [userId, now],
    );
  }
}
