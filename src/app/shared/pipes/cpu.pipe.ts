import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'cpu' })
export class CpuPipe implements PipeTransform {
  transform(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(2)} cores`;
    return `${Math.round(value)}m`;
  }
}
