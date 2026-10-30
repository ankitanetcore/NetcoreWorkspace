export interface StoredIdentity {
  clientId: string;
  displayName: string;
  title?: string;
  location?: string;
  photoUri?: string;
}

export function loadStoredIdentity(): StoredIdentity | null {
  return null;
}

export function storeIdentity(_identity: StoredIdentity): void {}
