import { randomUUID } from 'node:crypto';

import { AppError } from '../errors/app-error.js';
import type { AccessTokenService } from '../lib/access-token.js';
import { DUMMY_PASSWORD_HASH, type PasswordHasher } from '../lib/password.js';
import { generateRefreshToken, hashRefreshToken } from '../lib/refresh-token.js';
import type { RefreshSessionRepository } from '../repositories/refresh-session.repository.js';
import {
  DuplicateEmailRepositoryError,
  type SafeUserRecord,
  type UserRepository,
} from '../repositories/user.repository.js';
import type { ClientType, LoginRequest, RegisterRequest } from '../validation/auth.validation.js';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  clientType: ClientType;
}

export interface AuthenticationService {
  register(input: RegisterRequest): Promise<PublicUser>;
  login(input: LoginRequest): Promise<AuthSession>;
  refresh(clientType: ClientType, rawRefreshToken?: string): Promise<AuthSession>;
  logout(clientType: ClientType, rawRefreshToken?: string): Promise<void>;
  logoutAll(userId: string): Promise<void>;
  getCurrentUser(userId: string): Promise<PublicUser>;
}

interface AuthServiceConfig {
  refreshTokenTtlDays: number;
}

interface AuthServiceFactories {
  now?: () => Date;
  id?: () => string;
  refreshToken?: () => string;
}

function mapPublicUser(user: SafeUserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function invalidCredentialsError(): AppError {
  return new AppError({
    status: 401,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password',
  });
}

export class AuthService implements AuthenticationService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly createRefreshToken: () => string;

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: RefreshSessionRepository,
    private readonly passwords: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly config: AuthServiceConfig,
    factories: AuthServiceFactories = {},
  ) {
    this.now = factories.now ?? (() => new Date());
    this.createId = factories.id ?? randomUUID;
    this.createRefreshToken = factories.refreshToken ?? generateRefreshToken;
  }

  async register(input: RegisterRequest): Promise<PublicUser> {
    const passwordHash = await this.passwords.hash(input.password);

    try {
      const user = await this.users.create({
        name: input.name,
        email: input.email,
        passwordHash,
      });
      return mapPublicUser(user);
    } catch (error) {
      if (error instanceof DuplicateEmailRepositoryError) {
        throw new AppError({
          status: 409,
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists',
        });
      }
      throw error;
    }
  }

  async login(input: LoginRequest): Promise<AuthSession> {
    const user = await this.users.findByEmail(input.email);
    const passwordMatches = await this.passwords.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );

    if (!user || !passwordMatches) {
      throw invalidCredentialsError();
    }

    const now = this.now();
    const refreshToken = this.createRefreshToken();
    const accessToken = await this.accessTokens.issue(user.id);
    const expiresAt = new Date(
      now.getTime() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1_000,
    );

    await this.sessions.create({
      id: this.createId(),
      userId: user.id,
      familyId: this.createId(),
      tokenHash: hashRefreshToken(refreshToken),
      clientType: input.clientType,
      expiresAt,
      createdAt: now,
    });

    return {
      user: mapPublicUser(user),
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      clientType: input.clientType,
    };
  }

  async refresh(clientType: ClientType, rawRefreshToken?: string): Promise<AuthSession> {
    if (!rawRefreshToken) {
      throw new AppError({
        status: 401,
        code: 'REFRESH_TOKEN_INVALID',
        message: 'Refresh token is invalid',
      });
    }

    const refreshToken = this.createRefreshToken();
    const result = await this.sessions.rotate({
      tokenHash: hashRefreshToken(rawRefreshToken),
      clientType,
      newSessionId: this.createId(),
      newTokenHash: hashRefreshToken(refreshToken),
      now: this.now(),
    });

    if (result.outcome === 'reused') {
      throw new AppError({
        status: 401,
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token reuse was detected',
      });
    }

    if (result.outcome === 'invalid') {
      throw new AppError({
        status: 401,
        code: 'REFRESH_TOKEN_INVALID',
        message: 'Refresh token is invalid',
      });
    }

    const accessToken = await this.accessTokens.issue(result.user.id);
    return {
      user: mapPublicUser(result.user),
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: result.expiresAt.toISOString(),
      clientType,
    };
  }

  async logout(clientType: ClientType, rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    await this.sessions.revokeByToken(hashRefreshToken(rawRefreshToken), clientType, this.now());
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId, this.now());
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.users.findSafeById(userId);
    if (!user) {
      throw new AppError({
        status: 401,
        code: 'ACCESS_TOKEN_INVALID',
        message: 'Access token is invalid',
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
    }
    return mapPublicUser(user);
  }
}
