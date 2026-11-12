export function parse(a: string): number;
export function parse(a: number): number;
export function parse(a: unknown): number {
  return Number(a);
}

export function outer(): number {
  function inner(): number {
    return 1;
  }
  const arrow = () => inner();
  return arrow();
}

export class Box {
  get size(): number {
    return 1;
  }
  set size(v: number) {}
  static make(): Box {
    return new Box();
  }
}

export const helper = (): number => 2;

export function dup(): number {
  return 1;
}
