import { debounce } from 'lodash-es';
import { userRoute, postsRoute } from './routes';
import { Logger } from '@acme/core';

const log = new Logger();

export function fetchUser(base: string, id: string): string {
  const url = userRoute(base, id);
  log.warn(url);
  return url;
}

export function fetchPosts(base: string): string {
  return postsRoute(base);
}

export const refresh = debounce(fetchPosts, 100);
