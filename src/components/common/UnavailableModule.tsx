import React from 'react';
import { Lock, AlertCircle } from 'lucide-react';

export const unavailableModules = {
  producao: { title: 'Fila de Produção & Estamparia UV', actions: ['Atualizar produção'], columns: ['Pedido', 'Cliente / Unidade', 'Produtos', 'Situação', 'Ações'] },
  estoque: { title: 'Controle de Estoque & Movimentações', actions: ['Novo ajuste de estoque'], columns: ['Código / SKU', 'Produto físico', 'Estoque conferido', 'Movimentos', 'Ações'] },
  contas_receber: { title: 'Contas a Receber & Pix', actions: ['Registrar pagamento', 'Gerar cobrança'], columns: ['Pedido', 'Cliente', 'Vencimento', 'Saldo pendente', 'Ações'] },
  fechamentos: { title: 'Fechamentos Semanais & Mensais', actions: ['Novo fechamento'], columns: ['Período', 'Cliente', 'Vendas', 'Saldo pendente', 'Situação'] },
  entregas: { title: 'Frete & Entregas', actions: ['Registrar custo de entrega'], columns: ['Pedido', 'Cliente / Unidade', 'Frete cobrado', 'Custo real', 'Situação'] },
  despesas: { title: 'Despesas Operacionais', actions: ['Nova despesa'], columns: ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável'] },
  compras: { title: 'Compras & Entradas de Lote', actions: ['Nova compra', 'Novo fornecedor'], columns: ['Data da compra', 'Fornecedor', 'Itens comprados', 'Valor total', 'Comprador'] },
  fornecedores: { title: 'Fornecedores Homologados', actions: ['Novo fornecedor'], columns: ['Fornecedor', 'Contato', 'Telefone', 'Observações'] },
  relatorios: { title: 'Relatórios Comerciais de Vendas', actions: ['Exportar relatório'], columns: ['Pedido', 'Data', 'Cliente', 'Produtos', 'Total'] },
  lucratividade: { title: 'Demonstrativo de Lucratividade Real', actions: ['Exportar demonstrativo'], columns: ['Pedido', 'Cliente', 'Valor da venda', 'Custo histórico', 'Resultado'] },
  logs: { title: 'Auditoria & Logs Administrativos', actions: [], columns: ['Data / Hora', 'Responsável', 'Operação', 'Registro'] },
  configuracoes: { title: 'Configurações Globais', actions: ['Salvar configurações'], columns: ['Configuração', 'Valor oficial', 'Atualização'] },
  usuarios: { title: 'Funcionários e acessos', actions: ['Novo funcionário'], columns: ['Usuário', 'Nome', 'Perfil', 'Situação', 'Ações'] },
} as const;

export function UnavailableModule({ module }: { module: keyof typeof unavailableModules }) {
  const config = unavailableModules[module];
  return <section className="space-y-5" data-testid="unavailable-module">
    <div className="flex flex-wrap justify-between items-center gap-4"><div><h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{config.title}</h1><p className="text-xs text-slate-500 mt-1">PAMDA CORE</p></div><div className="flex flex-wrap gap-2">{config.actions.map(action=><button key={action} type="button" disabled className="rounded-xl bg-slate-100 border border-slate-200 text-slate-500 px-4 py-2 text-xs font-bold cursor-not-allowed">{action}</button>)}</div></div>
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3"><AlertCircle className="w-5 h-5 shrink-0"/><div><p className="font-bold">Operação oficial indisponível</p><p className="mt-1">Este módulo aguarda integração e homologação do backend. Consultas e gravações operacionais permanecem indisponíveis.</p>{module==='usuarios'&&<p className="mt-2">O login utiliza Supabase Auth e erp_user_profiles. A administração de funcionários aguarda uma integração segura; a função pamda-auth não está implantada.</p>}{module==='estoque'&&<p className="mt-2">O estoque físico ainda não foi conferido. Saldos provisórios do catálogo não são movimentos ou saldos físicos validados.</p>}</div></div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{['Consulta oficial', 'Operações', 'Histórico do módulo'].map(label=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase font-bold text-slate-400">{label}</p><p className="mt-2 text-sm font-bold text-slate-700">Integração pendente</p></div>)}</div>
    <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{config.columns.map(column=><th key={column} className="p-4">{column}</th>)}</tr></thead><tbody><tr><td colSpan={config.columns.length} className="p-10 text-center text-slate-500"><Lock className="w-5 h-5 mx-auto mb-2"/>Integração pendente. Os dados oficiais serão apresentados após homologação.</td></tr></tbody></table></div>
  </section>;
}
