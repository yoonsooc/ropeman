export interface AppConfig {
  apiBase: string;
  debug: boolean;
}

export function readConfig(): AppConfig {
  return { apiBase: '/api', debug: false };
}
