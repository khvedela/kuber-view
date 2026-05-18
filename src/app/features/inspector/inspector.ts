import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DashboardStore } from '../dashboard/dashboard.store';
import { PodPaneComponent } from '../pod-pane/pod-pane';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { StatusClassPipe } from '../../shared/pipes/status-class.pipe';
import type { PodRow } from '../../core/models/cluster';

@Component({
  selector: 'app-inspector',
  imports: [PodPaneComponent, EmptyStateComponent, StatusClassPipe],
  templateUrl: './inspector.html',
  styleUrl: './inspector.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorComponent {
  protected readonly store = inject(DashboardStore);

  protected onClose(event: Event, pod: PodRow): void {
    event.stopPropagation();
    this.store.closePod(pod);
  }
}
