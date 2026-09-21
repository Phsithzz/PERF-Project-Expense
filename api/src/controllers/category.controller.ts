import type { RequestHandler } from 'express';

import type { CategoryService } from '../services/category.service.js';

export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  readonly list: RequestHandler = async (_request, response) => {
    response.status(200).json({ data: await this.categories.listActive() });
  };
}
