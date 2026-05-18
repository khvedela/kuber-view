import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { ClusterSnapshot, PodLogState } from '../../models/cluster';

const BASE = 'http://127.0.0.1:4201/api';

@Injectable({ providedIn: 'root' })
export class KubeApiService {
  private readonly http = inject(HttpClient);

  getSnapshot(): Observable<ClusterSnapshot> {
    return this.http.get<ClusterSnapshot>(`${BASE}/snapshot`);
  }

  getLogs(namespace: string, pod: string, tail = 260): Observable<PodLogState> {
    return this.http.get<PodLogState>(
      `${BASE}/logs?namespace=${encodeURIComponent(namespace)}&pod=${encodeURIComponent(pod)}&tail=${tail}`,
    );
  }

  getContexts(): Observable<{ active: string; contexts: string[] }> {
    return this.http.get<{ active: string; contexts: string[] }>(`${BASE}/contexts`);
  }

  switchContext(context: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${BASE}/contexts/switch`, { context });
  }

  applyYaml(yaml: string, dryRun = false): Observable<unknown> {
    return this.http.post(`${BASE}/apply`, { yaml, dryRun });
  }

  scaleWorkload(namespace: string, kind: string, name: string, replicas: number): Observable<unknown> {
    return this.http.post(`${BASE}/scale`, { namespace, kind, name, replicas });
  }

  restartWorkload(namespace: string, kind: string, name: string): Observable<unknown> {
    return this.http.post(`${BASE}/restart`, { namespace, kind, name });
  }

  deleteResource(namespace: string, kind: string, name: string): Observable<unknown> {
    return this.http.post(`${BASE}/delete`, { namespace, kind, name });
  }

  getPortForwards(): Observable<unknown[]> {
    return this.http.get<unknown[]>(`${BASE}/portforward`);
  }

  createPortForward(namespace: string, pod: string, podPort: number): Observable<{ localPort: number; id: string }> {
    return this.http.post<{ localPort: number; id: string }>(`${BASE}/portforward`, { namespace, pod, podPort });
  }

  deletePortForward(id: string): Observable<unknown> {
    return this.http.delete(`${BASE}/portforward/${encodeURIComponent(id)}`);
  }
}
