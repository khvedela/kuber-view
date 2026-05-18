import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'memory' })
export class MemoryPipe implements PipeTransform {
  transform(value: number): string {
    if (value >= 1024) return `${(value / 1024).toFixed(2)} Gi`;
    return `${Math.round(value)} Mi`;
  }
}
