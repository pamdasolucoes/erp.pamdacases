import React, { useState } from 'react';
import { DollarSign, Plus, Calendar, Trash2 } from 'lucide-react';
import { dbService } from '../../services/db';
import { Expense } from '../../types/erp';
import { Modal } from '../../components/common/Modal';

export const ExpensesView: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>(dbService.getExpenses());
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    description: '',
    category: 'motoboy' as Expense['category'],
    amount: 50.0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const refresh = () => {
    setExpenses(dbService.getExpenses());
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim() || form.amount <= 0) {
      alert('Descrição e valor válido são obrigatórios.');
      return;
    }

    dbService.createExpense({
      description: form.description.trim(),
      category: form.category,
      amount: Number(form.amount),
      date: form.date,
      notes: form.notes.trim() || undefined,
    });

    refresh();
    setIsModalOpen(false);
  };

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Despesas Operacionais
          </h1>
          <p className="text-xs text-slate-500">
            Lançamento simplificado de custos fixos, motoboys, manutenção e insumos
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Despesa</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-slate-400 uppercase">
            Total de Despesas Lançadas
          </span>
          <p className="text-2xl font-black text-rose-600 font-mono mt-0.5">
            R$ {totalExpenses.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-5">Data</th>
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4 text-right">Valor (R$)</th>
                <th className="py-3 px-4">Lançado Por</th>
                <th className="py-3 px-5">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-5 font-mono text-slate-600">
                    {exp.date}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {exp.description}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                      {exp.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                    R$ {exp.amount.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-blue-700 font-semibold">
                    {exp.createdByUser}
                  </td>
                  <td className="py-3 px-5 text-slate-500">
                    {exp.notes || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Lançamento de Despesa"
        subtitle="Registre uma saída operacional da Pamda Cases"
        maxWidth="md"
      >
        <form onSubmit={handleCreateExpense} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Descrição da Despesa *
            </label>
            <input
              type="text"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Tinta branca DTF UV ou Motoboy entregas centro"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-rose-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Categoria
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold bg-white"
              >
                <option value="motoboy">Motoboy / Entregas</option>
                <option value="material">Material / Insumos</option>
                <option value="manutencao">Manutenção Máquinas</option>
                <option value="operacional">Operacional</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Valor (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-rose-600 focus:ring-2 focus:ring-rose-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Data do Lançamento
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Observações
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
            >
              Salvar Despesa
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
