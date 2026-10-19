export interface StoredIdentity {
  clientId: string;
  displayName: string;
}

export function loadStoredIdentity(): StoredIdentity | null {
  return null;
}

export function storeIdentity(_identity: StoredIdentity): void {}
