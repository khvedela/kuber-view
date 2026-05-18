import { Pipe, PipeTransform } from '@angular/core';
import type { Health } from '../../core/models/cluster';

@Pipe({ name: 'statusClass' })
export class StatusClassPipe implements PipeTransform {
  transform(status: Health | string): string {
    switch (status) {
      case 'Critical': return 'status-critical';
      case 'Warning':  return 'status-warning';
      default:         return 'status-healthy';
    }
  }
}
