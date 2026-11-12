export function formatPrice(cents: number): string {
  const whole = (cents - (cents % 100)) / 100;
  return `$${whole}.${twoDigits(cents % 100)}`;
}

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}
