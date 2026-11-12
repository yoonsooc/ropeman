export function wrap(n: number): number {
  return n;
}

export function plan(): number {
  return 1;
}

export function apply(): number {
  return wrap(plan());
}

export function again(): number {
  return wrap(1) + wrap(2);
}
