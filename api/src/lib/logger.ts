import pino, { type DestinationStream, type Logger } from 'pino';

import type { AppConfig } from '../config/env.js';

export function createLogger(
  config: Pick<AppConfig, 'logLevel' | 'nodeEnv'>,
  destination?: DestinationStream,
): Logger {
  const options = {
    level: config.logLevel,
    base: {
      service: 'expense-tracker-api',
      environment: config.nodeEnv,
    },
    redact: {
      paths: [
        'password',
        'accessToken',
        'refreshToken',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
