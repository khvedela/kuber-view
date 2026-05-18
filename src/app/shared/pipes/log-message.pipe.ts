import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'logMessage' })
export class LogMessagePipe implements PipeTransform {
  transform(line: string): string {
    return line
      .replace(/^\S+\s+[0-9T:.-]+Z?\s+/, '')
      .replace(/^\[pod\/[^\]]+\]\s+/, '')
      .trim();
  }
}
