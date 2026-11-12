import { Store } from './store';

type Listener = (key: string) => void;

const listeners: Listener[] = [];

export function on(listener: Listener): void {
  listeners.push(listener);
}

export function emit(event: string, key: string): void {
  for (const listener of listeners) listener(`${event}:${key}`);
}

export function describeValue(value: unknown): string {
  return value instanceof Store ? `store x${value.scale}` : 'other';
}
