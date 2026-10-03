export interface EpisodeServerOption {
  name: string;
  type: string;
}

export function nextAniwavesServer(
  servers: readonly EpisodeServerOption[],
  category: string,
  currentServer: string | undefined,
  failedServers: readonly string[],
): string | undefined {
  const attempted = new Set([...failedServers, ...(currentServer ? [currentServer] : [])]);
  return servers.find(server => server.type === category && !attempted.has(server.name))?.name;
}
