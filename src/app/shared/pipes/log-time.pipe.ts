import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'logTime' })
export class LogTimePipe implements PipeTransform {
  transform(line: string): string {
    const match = line.match(/^\S+\s+([0-9T:.-]+Z?)\s+/);
    const value = match?.[1] ?? line.match(/^([0-9T:.-]+Z?)\s+/)?.[1] ?? '';
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value.slice(0, 12)
      : date.toLocaleTimeString([], { hour12: false });
  }
}
