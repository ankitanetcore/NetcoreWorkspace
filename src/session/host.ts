let hostClientId = "";

export function setWorkspaceHost(clientId: string) {
  hostClientId = clientId;
}

export function workspaceHostId() {
  return hostClientId;
}
