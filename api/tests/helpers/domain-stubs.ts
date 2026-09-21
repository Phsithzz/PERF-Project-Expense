import type { CategoryService } from '../../src/services/category.service.js';
import type { ExpenseService } from '../../src/services/expense.service.js';

function unexpectedCall(name: string): never {
  throw new Error(`Unexpected domain stub call: ${name}`);
}

export function createUnusedCategoryService(): CategoryService {
  return {
    listActive: async () => unexpectedCall('listActive'),
  };
}

export function createUnusedExpenseService(): ExpenseService {
  return {
    listOwned: async () => unexpectedCall('listOwned'),
    create: async () => unexpectedCall('create'),
    getOwned: async () => unexpectedCall('getOwned'),
    update: async () => unexpectedCall('update'),
    delete: async () => unexpectedCall('delete'),
  };
}
