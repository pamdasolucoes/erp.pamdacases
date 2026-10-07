import React, { useState } from 'react';
import { ShieldAlert, Search, Filter } from 'lucide-react';
import { dbService } from '../../services/db';
import { AuditLog } from '../../types/erp';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>(dbService.getAuditLogs());
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = logs.filter(
    (l) =>
      l.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.action.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Auditoria & Logs Administrativos
        </h1>
        <p className="text-xs text-slate-500">
          Rastreabilidade completa de alterações de preços, custos, vendas e baixas financeiras
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por usuário, ação ou detalhe..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-5">Data e Hora</th>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Ação</th>
                <th className="py-3 px-4">Entidade</th>
                <th className="py-3 px-5">Detalhes da Operação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-5 font-mono text-slate-600">
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-4 font-bold text-purple-700">
                    {log.username}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                      {log.action.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                    {log.entity}
                  </td>
                  <td className="py-3 px-5 font-medium text-slate-900">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
