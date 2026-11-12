import type { Level } from './types';

export class Logger {
  private lines: string[] = [];

  info(message: string): void {
    this.write('info', message);
  }

  warn(message: string): void {
    this.write('warn', message);
  }

  private write(level: Level, message: string): void {
    this.lines.push(`[${level}] ${message}`);
  }
}
