import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$xZuC7neI2+4J8IlpYZgDAg$d/vR2Xp30S/mz6rx2nzNxUkmkOYsppludxlzDgGsY2I';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(encodedHash: string, password: string): Promise<boolean>;
}

export class ArgonPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(encodedHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(encodedHash, password);
    } catch {
      return false;
    }
  }
}
