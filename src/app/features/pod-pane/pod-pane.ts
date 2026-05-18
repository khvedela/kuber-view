import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DashboardStore } from '../dashboard/dashboard.store';
import { CpuPipe } from '../../shared/pipes/cpu.pipe';
import { MemoryPipe } from '../../shared/pipes/memory.pipe';
import { ShortTimePipe } from '../../shared/pipes/short-time.pipe';
import { LogLevelPipe } from '../../shared/pipes/log-level.pipe';
import { LogTimePipe } from '../../shared/pipes/log-time.pipe';
import { LogSourcePipe } from '../../shared/pipes/log-source.pipe';
import { LogMessagePipe } from '../../shared/pipes/log-message.pipe';
import type { PodRow } from '../../core/models/cluster';

@Component({
  selector: 'app-pod-pane',
  imports: [
    CpuPipe,
    MemoryPipe,
    ShortTimePipe,
    LogLevelPipe,
    LogTimePipe,
    LogSourcePipe,
    LogMessagePipe,
  ],
  templateUrl: './pod-pane.html',
  styleUrl: './pod-pane.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodPaneComponent {
  readonly pod = input.required<PodRow>();

  protected readonly store = inject(DashboardStore);

  protected onRefresh(event: Event): void {
    event.stopPropagation();
    this.store.refreshPod(this.pod());
  }
}
