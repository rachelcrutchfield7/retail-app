export type Category = {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  parent_id?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};
