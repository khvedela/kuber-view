import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AngularSplitModule, SplitGutterInteractionEvent } from 'angular-split';
import { ResourcePanelComponent } from '../resource-panel/resource-panel';
import { InspectorComponent } from '../inspector/inspector';
import { LayoutService } from '../../core/services/ui/layout.service';

@Component({
  selector: 'app-dashboard',
  imports: [AngularSplitModule, ResourcePanelComponent, InspectorComponent],
  template: `
    <as-split
      direction="horizontal"
      [gutterSize]="4"
      (dragEnd)="onInspectorDragEnd($event)"
      class="dashboard-split"
    >
      <as-split-area [size]="100 - layout.sizes().inspector" [minSize]="28">
        <app-resource-panel />
      </as-split-area>
      <as-split-area [size]="layout.sizes().inspector" [minSize]="28">
        <app-inspector />
      </as-split-area>
    </as-split>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }
    .dashboard-split {
      height: 100% !important;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  protected readonly layout = inject(LayoutService);

  protected onInspectorDragEnd(event: SplitGutterInteractionEvent): void {
    const size = event.sizes[1];
    if (typeof size === 'number') this.layout.save({ inspector: size });
  }
}
