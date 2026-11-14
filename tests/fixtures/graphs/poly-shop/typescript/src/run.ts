import { next } from './steps';

export function run(next: () => void): void {
	next();
}

export function go(): void {
	next();
}
