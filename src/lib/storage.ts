const memoryStorage = new Map<string, string>();

export async function setStoredItem(key: string, value: string): Promise<void> {
  memoryStorage.set(key, value);
}

export async function getStoredItem(key: string): Promise<string | null> {
  return memoryStorage.get(key) ?? null;
}

export async function removeStoredItem(key: string): Promise<void> {
  memoryStorage.delete(key);
}
