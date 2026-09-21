import type { CategoryRecord, CategoryRepository } from '../repositories/category.repository.js';

export interface CategoryService {
  listActive(): Promise<CategoryRecord[]>;
}

export class DefaultCategoryService implements CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  async listActive(): Promise<CategoryRecord[]> {
    return this.categories.listActive();
  }
}
