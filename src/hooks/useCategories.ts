import { useCallback } from 'react';
import { getQueryData, setQueryData } from '../lib/queryClient';
import { getCategories, getSubcategories, getTopLevelCategories } from '../services/categoryService';
import type { Category } from '../types/category';
import { useAsyncResource } from './useAsyncResource';

const categoryKeys = {
  all: ['categories'] as const,
  topLevel: ['categories', 'top-level'] as const,
  subcategories: (parentId: string) => ['categories', 'subcategories', parentId] as const,
};

export function useCategories() {
  const loadCategories = useCallback(async (): Promise<Category[]> => {
    const cached = getQueryData<Category[]>(categoryKeys.all);

    if (cached) {
      return cached;
    }

    const categories = await getCategories();
    setQueryData(categoryKeys.all, categories);
    return categories;
  }, []);

  return useAsyncResource(loadCategories);
}

export function useTopLevelCategories() {
  const loadCategories = useCallback(async (): Promise<Category[]> => {
    const cached = getQueryData<Category[]>(categoryKeys.topLevel);

    if (cached) {
      return cached;
    }

    const categories = await getTopLevelCategories();
    setQueryData(categoryKeys.topLevel, categories);
    return categories;
  }, []);

  return useAsyncResource(loadCategories);
}

export function useSubcategories(parentId: string) {
  const loadSubcategories = useCallback(async (): Promise<Category[]> => {
    const key = categoryKeys.subcategories(parentId);
    const cached = getQueryData<Category[]>(key);

    if (cached) {
      return cached;
    }

    const categories = await getSubcategories(parentId);
    setQueryData(key, categories);
    return categories;
  }, [parentId]);

  return useAsyncResource(loadSubcategories, Boolean(parentId));
}
