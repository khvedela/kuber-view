import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'logLevel' })
export class LogLevelPipe implements PipeTransform {
  transform(line: string): string {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('fail') || lower.includes('panic')) return 'log-error';
    if (lower.includes('warn') || lower.includes('invalid') || lower.includes('timeout')) return 'log-warn';
    if (lower.includes('info') || lower.includes('associated') || lower.includes('connected')) return 'log-info';
    return 'log-neutral';
  }
}
