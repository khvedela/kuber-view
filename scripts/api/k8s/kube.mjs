import * as k8s from '@kubernetes/client-node';

/** Memoised per-context client bundle. */
const cache = new Map();

export function getClients(contextName) {
  if (cache.has(contextName)) return cache.get(contextName);

  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  if (contextName && contextName !== kc.getCurrentContext()) {
    kc.setCurrentContext(contextName);
  }

  const clients = {
    kc,
    context: kc.getCurrentContext(),
    core:         kc.makeApiClient(k8s.CoreV1Api),
    apps:         kc.makeApiClient(k8s.AppsV1Api),
    batch:        kc.makeApiClient(k8s.BatchV1Api),
    networking:   kc.makeApiClient(k8s.NetworkingV1Api),
    rbac:         kc.makeApiClient(k8s.RbacAuthorizationV1Api),
    custom:       kc.makeApiClient(k8s.CustomObjectsApi),
    apiext:       kc.makeApiClient(k8s.ApiextensionsV1Api),
    metrics:      new k8s.Metrics(kc),
    log:          new k8s.Log(kc),
    exec:         new k8s.Exec(kc),
    portForward:  new k8s.PortForward(kc),
    watch:        new k8s.Watch(kc),
  };

  cache.set(contextName, clients);
  return clients;
}

export function getContexts() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return {
    active: kc.getCurrentContext(),
    contexts: kc.getContexts().map((c) => c.name),
  };
}

export function clearCache() {
  cache.clear();
}
