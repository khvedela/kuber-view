import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'shortTime' })
export class ShortTimePipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '-';
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
