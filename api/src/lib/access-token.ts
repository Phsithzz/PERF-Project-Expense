import { randomUUID } from 'node:crypto';

import { errors, jwtVerify, SignJWT } from 'jose';

interface AccessTokenConfig {
  secret: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export type AccessTokenVerification =
  { valid: true; userId: string } | { valid: false; reason: 'expired' | 'invalid' };

export interface AccessTokenVerifier {
  verify(token: string): Promise<AccessTokenVerification>;
}

type Clock = () => Date;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AccessTokenService implements AccessTokenVerifier {
  private readonly key: Uint8Array;

  constructor(
    private readonly config: AccessTokenConfig,
    private readonly clock: Clock = () => new Date(),
  ) {
    this.key = new TextEncoder().encode(config.secret);
  }

  async issue(userId: string): Promise<IssuedAccessToken> {
    const now = this.clock();
    const issuedAtSeconds = Math.floor(now.getTime() / 1_000);
    const expiresAt = new Date(now.getTime() + this.config.ttlSeconds * 1_000);
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1_000);

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setJti(randomUUID())
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.key);

    return { token, expiresAt };
  }

  async verify(token: string): Promise<AccessTokenVerification> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        currentDate: this.clock(),
      });

      if (typeof payload.sub !== 'string' || !uuidPattern.test(payload.sub)) {
        return { valid: false, reason: 'invalid' };
      }

      return { valid: true, userId: payload.sub };
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        return { valid: false, reason: 'expired' };
      }
      return { valid: false, reason: 'invalid' };
    }
  }
}
