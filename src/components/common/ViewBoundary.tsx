import { Component, type ReactNode } from 'react';
export class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
      <p>Não foi possível carregar esta tela. Confira a conexão e recarregue o aplicativo. A preparação salva nesta aba será recuperada.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-3 font-bold underline">Recarregar aplicativo</button>
    </div> : this.props.children;
  }
}
