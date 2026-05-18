import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AngularSplitModule, SplitGutterInteractionEvent } from 'angular-split';
import { SidebarComponent } from '../sidebar/sidebar';
import { CommandBarComponent } from '../../features/command-bar/command-bar';
import { MetricStripComponent } from '../../features/metric-strip/metric-strip';
import { CmdkComponent } from '../../shared/components/cmdk/cmdk';
import { ToastComponent } from '../../shared/components/toast/toast';
import { LayoutService } from '../../core/services/ui/layout.service';
import { DashboardStore } from '../../features/dashboard/dashboard.store';

@Component({
  selector: 'app-layout-shell',
  imports: [
    RouterOutlet,
    AngularSplitModule,
    SidebarComponent,
    CommandBarComponent,
    MetricStripComponent,
    CmdkComponent,
    ToastComponent,
  ],
  templateUrl: './layout-shell.html',
  styleUrl: './layout-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DashboardStore],
})
export class LayoutShellComponent {
  protected readonly layout = inject(LayoutService);

  protected onSidebarDragEnd(event: SplitGutterInteractionEvent): void {
    const size = event.sizes[0];
    if (typeof size === 'number') this.layout.save({ sidebar: size });
  }
}
