import type { RequestHandler } from 'express';

import type { AuthenticationService } from '../services/auth.service.js';

export class UserController {
  constructor(private readonly auth: AuthenticationService) {}

  readonly getCurrentUser: RequestHandler = async (request, response) => {
    const user = await this.auth.getCurrentUser(request.auth!.userId);
    response.status(200).json({ data: user });
  };
}
