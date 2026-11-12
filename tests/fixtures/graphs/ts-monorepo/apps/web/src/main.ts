import { formatDate, Logger, createId } from '@acme/core';
import type { Entity } from '@acme/core';
import { readConfig } from '@shared/config';
import { startApp } from '$lib/app';
import * as math from '$lib/math';
import './polyfills';

const log = new Logger();

export function main(): Entity {
  const config = readConfig();
  const id = createId('app');
  log.info(formatDate(2026, 11, 12));
  startApp(config, math.clamp(3, 0, 10));
  return { id };
}
