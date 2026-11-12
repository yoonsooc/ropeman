import type { AppConfig } from '@shared/config';
import { createStore } from './store';
import { fetchUser } from '$lib/api';
import { loadPlugin } from './plugins';

export function startApp(config: AppConfig, scale: number): void {
  const store = createStore(scale);
  store.set('apiBase', config.apiBase);
  fetchUser(config.apiBase, 'me');
  loadPlugin('charts');
}
