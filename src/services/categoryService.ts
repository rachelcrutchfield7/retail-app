import { supabase } from '../lib/supabase';
import type { Category } from '../types/category';
import { throwSupabaseError } from './supabaseData';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sortCategories(categories: Category[]): Category[] {
  return categories.sort((first, second) => first.sort_order - second.sort_order || first.name.localeCompare(second.name));
}

async function resolveCategoryParentId(parentIdOrSlug: string): Promise<string> {
  if (uuidPattern.test(parentIdOrSlug)) {
    return parentIdOrSlug;
  }

  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('is_active', true)
    .eq('slug', parentIdOrSlug)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load categories.');
  }

  if (!data?.id) {
    return parentIdOrSlug;
  }

  return String(data.id);
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throwSupabaseError(error, 'We could not load categories.');
  }

  return sortCategories((data ?? []) as Category[]);
}

export async function getTopLevelCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .is('parent_id', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throwSupabaseError(error, 'We could not load categories.');
  }

  return sortCategories((data ?? []) as Category[]);
}

export async function getSubcategories(parentId: string): Promise<Category[]> {
  const resolvedParentId = await resolveCategoryParentId(parentId);

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .eq('parent_id', resolvedParentId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throwSupabaseError(error, 'We could not load subcategories.');
  }

  return sortCategories((data ?? []) as Category[]);
}
