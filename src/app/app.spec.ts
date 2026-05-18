import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController).expectOne('http://127.0.0.1:4201/api/snapshot').flush({
      context: 'minikube',
      generatedAt: '2026-05-18T21:00:00Z',
      totals: {
        namespaces: 0,
        pods: 0,
        runningPods: 0,
        warnings: 0,
        critical: 0,
        restarts: 0,
        cpuMillicores: 0,
        memoryMi: 0,
      },
      namespaces: [],
      workloads: [],
      pods: [],
      nodes: [],
      services: [],
      events: [],
      logPanes: [],
      upfPools: [],
      decisions: [],
    });
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the monitoring dashboard', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController).expectOne('http://127.0.0.1:4201/api/snapshot').flush({
      context: 'minikube',
      generatedAt: '2026-05-18T21:00:00Z',
      totals: {
        namespaces: 1,
        pods: 1,
        runningPods: 1,
        warnings: 0,
        critical: 0,
        restarts: 0,
        cpuMillicores: 100,
        memoryMi: 128,
      },
      namespaces: [],
      workloads: [],
      pods: [],
      nodes: [],
      services: [],
      events: [],
      logPanes: [],
      upfPools: [],
      decisions: [],
    });
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(compiled.querySelector('h1')?.textContent).toContain('Minikube operations');
    expect(compiled.textContent).toContain('Pod workspace');
  });
});
