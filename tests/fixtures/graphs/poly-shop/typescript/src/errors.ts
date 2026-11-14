export interface Reporter {
	report(message: string): void;
}

export class AppError extends Error {
	describe(): string {
		return this.message;
	}
}

export class LoggedError extends AppError implements Reporter {
	report(message: string) {
		console.warn(message, this.describe());
	}
}
