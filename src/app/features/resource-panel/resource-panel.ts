import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DashboardStore } from '../dashboard/dashboard.store';
import { CpuPipe } from '../../shared/pipes/cpu.pipe';
import { MemoryPipe } from '../../shared/pipes/memory.pipe';
import { ShortTimePipe } from '../../shared/pipes/short-time.pipe';
import { StatusClassPipe } from '../../shared/pipes/status-class.pipe';

@Component({
  selector: 'app-resource-panel',
  imports: [CpuPipe, MemoryPipe, ShortTimePipe, StatusClassPipe],
  templateUrl: './resource-panel.html',
  styleUrl: './resource-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResourcePanelComponent {
  protected readonly store = inject(DashboardStore);

  protected asJson(value: unknown): string {
    return JSON.stringify(value ?? {}, null, 2);
  }
}
