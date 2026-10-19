export interface CatalogSnapshot<T> { data: T | null; loading: boolean; error: string }

// One active authenticated scope. No browser storage, credentials or persisted business data.
export class SessionCatalog<T> {
  private scope: string | null = null;
  private state: CatalogSnapshot<T> = { data: null, loading: false, error: '' };
  private listeners = new Set<() => void>();
  private flight: Promise<T> | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(private loader: (scope: string, signal: AbortSignal) => Promise<T>) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: CatalogSnapshot<T>) { this.state = state; for (const listener of this.listeners) listener(); }
  setScope(scope: string | null) {
    if (scope === this.scope) return;
    this.scope = scope; this.clear();
  }
  private cancel() { this.generation++; this.controller?.abort(); this.controller = null; this.flight = null; }
  clear() { this.cancel(); this.publish({ data: null, loading: false, error: '' }); }
  load = (force = false): Promise<T> => {
    if (!this.scope) return Promise.reject(new Error('Valide sua sessão antes de consultar o catálogo.'));
    if (this.flight) return this.flight;
    if (!force && this.state.data !== null) return Promise.resolve(this.state.data);
    const generation = ++this.generation, controller = new AbortController(), scope = this.scope;
    this.controller = controller; this.publish({ ...this.state, loading: true, error: '' });
    const flight = Promise.resolve().then(() => this.loader(scope, controller.signal)).then(data => {
      if (generation !== this.generation || scope !== this.scope) throw new DOMException('Consulta substituída.', 'AbortError');
      this.publish({ data, loading: false, error: '' }); return data;
    }, error => {
      if (generation === this.generation) this.publish({ data: null, loading: false, error: error instanceof Error ? error.message : 'Não foi possível carregar o catálogo.' });
      throw error;
    }).finally(() => { if (generation === this.generation) { this.flight = null; this.controller = null; } });
    this.flight = flight; return flight;
  };
  refreshActive() { if (this.listeners.size) void this.load(true).catch(() => {}); }
  revalidate() { if (this.listeners.size) this.refreshActive(); else this.clear(); }
  invalidate() { this.clear(); this.refreshActive(); }
  replace(scope: string, update: (previous: T) => T) {
    if (scope !== this.scope) return;
    const previous = this.state.data; this.cancel();
    this.publish({ data: previous === null ? null : update(previous), loading: false, error: '' });
    if (previous === null) this.refreshActive();
  }
}
