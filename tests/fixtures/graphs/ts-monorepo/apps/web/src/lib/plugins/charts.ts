import { lerp } from '../math';

export function register(): number {
  return lerp(0, 100, 0.5);
}
