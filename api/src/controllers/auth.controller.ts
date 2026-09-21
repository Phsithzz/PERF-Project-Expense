import type { Request, RequestHandler, Response } from 'express';

import type { AuthSession, AuthenticationService } from '../services/auth.service.js';
import { getValidatedRequest } from '../validation/request-validation.js';
import type {
  LoginRequest,
  RefreshCredentialRequest,
  RegisterRequest,
} from '../validation/auth.validation.js';

export const REFRESH_COOKIE_NAME = '__Host-expense_refresh';

const refreshCookieBase = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
};

function setRefreshCookie(response: Response, session: AuthSession): void {
  response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
    ...refreshCookieBase,
    expires: new Date(session.refreshTokenExpiresAt),
  });
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieBase);
}

function getWebRefreshToken(request: Request): string | undefined {
  const value = (request.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' ? value : undefined;
}

function authResponseData(session: AuthSession): Record<string, unknown> {
  const common = {
    user: session.user,
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
  };

  return session.clientType === 'mobile'
    ? { ...common, refreshToken: session.refreshToken }
    : common;
}

export class AuthController {
  constructor(private readonly auth: AuthenticationService) {}

  readonly register: RequestHandler = async (_request, response) => {
    const input = getValidatedRequest(response.locals).body as RegisterRequest;
    const user = await this.auth.register(input);
    response.location('/api/v1/users/me').status(201).json({ data: user });
  };

  readonly login: RequestHandler = async (_request, response) => {
    const input = getValidatedRequest(response.locals).body as LoginRequest;
    const session = await this.auth.login(input);
    if (session.clientType === 'web') {
      setRefreshCookie(response, session);
    }
    response.status(200).json({ data: authResponseData(session) });
  };

  readonly refresh: RequestHandler = async (request, response) => {
    const input = getValidatedRequest(response.locals).body as RefreshCredentialRequest;
    const rawToken = input.clientType === 'web' ? getWebRefreshToken(request) : input.refreshToken;

    try {
      const session = await this.auth.refresh(input.clientType, rawToken);
      if (session.clientType === 'web') {
        setRefreshCookie(response, session);
      }
      response.status(200).json({ data: authResponseData(session) });
    } catch (error) {
      if (input.clientType === 'web') {
        clearRefreshCookie(response);
      }
      throw error;
    }
  };

  readonly logout: RequestHandler = async (request, response) => {
    const input = getValidatedRequest(response.locals).body as RefreshCredentialRequest;
    const rawToken = input.clientType === 'web' ? getWebRefreshToken(request) : input.refreshToken;
    await this.auth.logout(input.clientType, rawToken);
    if (input.clientType === 'web') {
      clearRefreshCookie(response);
    }
    response.status(204).send();
  };

  readonly logoutAll: RequestHandler = async (request, response) => {
    await this.auth.logoutAll(request.auth!.userId);
    clearRefreshCookie(response);
    response.status(204).send();
  };
}
