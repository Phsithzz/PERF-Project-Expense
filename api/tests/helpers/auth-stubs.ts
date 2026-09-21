import type { AccessTokenVerifier } from '../../src/lib/access-token.js';
import type { AuthenticationService } from '../../src/services/auth.service.js';

function unexpectedCall(name: string): never {
  throw new Error(`Unexpected authentication stub call: ${name}`);
}

export function createUnusedAuthenticationService(): AuthenticationService {
  return {
    register: async () => unexpectedCall('register'),
    login: async () => unexpectedCall('login'),
    refresh: async () => unexpectedCall('refresh'),
    logout: async () => unexpectedCall('logout'),
    logoutAll: async () => unexpectedCall('logoutAll'),
    getCurrentUser: async () => unexpectedCall('getCurrentUser'),
  };
}

export function createRejectingAccessTokenVerifier(): AccessTokenVerifier {
  return {
    verify: async () => ({ valid: false, reason: 'invalid' }),
  };
}
