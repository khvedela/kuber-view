import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DashboardStore } from '../../features/dashboard/dashboard.store';
import { CpuPipe } from '../../shared/pipes/cpu.pipe';
import { MemoryPipe } from '../../shared/pipes/memory.pipe';
import { StatusClassPipe } from '../../shared/pipes/status-class.pipe';

@Component({
  selector: 'app-sidebar',
  imports: [CpuPipe, MemoryPipe, StatusClassPipe],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  protected readonly store = inject(DashboardStore);
}
