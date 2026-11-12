import { pad } from './pad';

export function formatDate(year: number, month: number, day: number): string {
  const mm = pad(month);
  const dd = pad(day);
  return `${year}-${mm}-${dd}`;
}

export function formatMoney(cents: number): string {
  const whole = (cents - (cents % 100)) / 100;
  return `$${whole}.${pad(cents % 100)}`;
}
