import { emit } from './events';

export class Store {
  private values = new Map<string, string>();

  constructor(readonly scale: number) {}

  set(key: string, value: string): void {
    this.values.set(key, value);
    emit('change', key);
  }
}

export function createStore(scale: number): Store {
  return new Store(scale);
}
