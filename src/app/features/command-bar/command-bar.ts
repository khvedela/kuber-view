import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DashboardStore } from '../dashboard/dashboard.store';
import { ShortTimePipe } from '../../shared/pipes/short-time.pipe';

@Component({
  selector: 'app-command-bar',
  imports: [ShortTimePipe],
  templateUrl: './command-bar.html',
  styleUrl: './command-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandBarComponent {
  protected readonly store = inject(DashboardStore);

  protected setQuery(event: Event): void {
    this.store.setQuery((event.target as HTMLInputElement).value);
  }
}
