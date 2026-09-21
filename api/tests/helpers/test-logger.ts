import pino, { type Logger } from 'pino';

export function createTestLogger(): Logger {
  return pino({ level: 'silent' });
}
