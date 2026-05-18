import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'logSource' })
export class LogSourcePipe implements PipeTransform {
  transform(line: string): string {
    return (
      line.match(/^\[pod\/([^\]]+)\]/)?.[1] ??
      line.match(/^\S+\s+\[pod\/([^\]]+)\]/)?.[1] ??
      ''
    );
  }
}
