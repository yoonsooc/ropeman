import { LoggedError } from './errors';

export function fail(message: string): never {
	const error = new LoggedError(message);
	error.report(message);
	throw error;
}
