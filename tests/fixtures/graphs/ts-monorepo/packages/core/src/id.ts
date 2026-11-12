let counter = 0;

export default function createId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
