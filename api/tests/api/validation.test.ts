import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createErrorHandler } from '../../src/middleware/error-handler.middleware.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.middleware.js';
import { getValidatedRequest, validateRequest } from '../../src/validation/request-validation.js';
import { createTestLogger } from '../helpers/test-logger.js';

describe('request validation middleware', () => {
  it('returns field-safe validation details and exposes parsed data to the controller boundary', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());
    app.post(
      '/test-only',
      validateRequest({
        body: z.object({
          name: z.string().trim().min(1),
          count: z.coerce.number().int().positive(),
        }),
      }),
      (_request, response) => {
        response.status(200).json({ data: getValidatedRequest(response.locals).body });
      },
    );
    app.use(createErrorHandler(createTestLogger()));

    const invalid = await request(app).post('/test-only').send({ name: '', count: 0 }).expect(422);
    expect(invalid.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'One or more fields are invalid',
    });
    expect(invalid.body.error.details.map((detail: { field: string }) => detail.field)).toEqual([
      'name',
      'count',
    ]);

    const valid = await request(app)
      .post('/test-only')
      .send({ name: '  lunch  ', count: '2' })
      .expect(200);
    expect(valid.body).toEqual({ data: { name: 'lunch', count: 2 } });
  });
});
