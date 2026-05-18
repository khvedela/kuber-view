import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DashboardStore } from '../dashboard/dashboard.store';
import { StatusClassPipe } from '../../shared/pipes/status-class.pipe';

@Component({
  selector: 'app-metric-strip',
  imports: [StatusClassPipe],
  templateUrl: './metric-strip.html',
  styleUrl: './metric-strip.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricStripComponent {
  protected readonly store = inject(DashboardStore);
}
