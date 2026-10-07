import React, { useState } from 'react';
import { Users, Plus, Shield, CheckCircle2, XCircle, Key, Edit2 } from 'lucide-react';
import { User, UserRole } from '../../types/erp';
import { authService } from '../../services/auth';
import { Modal } from '../../components/common/Modal';

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<User[]>(authService.getUsers());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: '',
    name: '',
    role: 'venda_atendimento' as UserRole,
    password: '',
    canViewFinancialMetrics: false,
    active: true,
  });

  const refreshUsers = () => {
    setUsers(authService.getUsers());
  };

  const handleOpenNewUser = () => {
    setEditingUserId(null);
    setForm({
      username: '',
      name: '',
      role: 'venda_atendimento',
      password: '',
      canViewFinancialMetrics: false,
      active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditUser = (user: User) => {
    setEditingUserId(user.id);
    setForm({
      username: user.username,
      name: user.name,
      role: user.role,
      password: '', // deixar vazio se não quiser alterar senha
      canViewFinancialMetrics: user.role === 'admin_gerencial' ? true : !!user.canViewFinancialMetrics,
      active: user.active,
    });
    setIsModalOpen(true);
  };

  const handleToggleFinancialPermission = async (userId: string) => {
    await authService.toggleUserFinancialMetrics(userId);
    refreshUsers();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.name.trim()) {
      alert('Nome e Nome de usuário são obrigatórios.');
      return;
    }

    if (editingUserId) {
      const res = await authService.updateUser(editingUserId, {
        name: form.name,
        role: form.role,
        active: form.active,
        canViewFinancialMetrics: form.role === 'admin_gerencial' ? true : form.canViewFinancialMetrics,
        newPassword: form.password ? form.password : undefined,
      });
      if (res.success) {
        alert('Usuário atualizado com sucesso!');
        refreshUsers();
        setIsModalOpen(false);
      } else {
        alert(res.error);
      }
    } else {
      if (!form.password) {
        alert('A senha é obrigatória para um novo usuário.');
        return;
      }
      const res = await authService.createUser({
        username: form.username,
        name: form.name,
        role: form.role,
        password: form.password,
        canViewFinancialMetrics: form.role === 'admin_gerencial' ? true : form.canViewFinancialMetrics,
        active: form.active,
      });
      if (res.success) {
        alert('Novo usuário cadastrado com sucesso!');
        refreshUsers();
        setIsModalOpen(false);
      } else {
        alert(res.error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gestão de Usuários & Níveis de Acesso
          </h1>
          <p className="text-xs text-slate-500">
            Controle de operadores, vendedores e equipe de produção (sem exigência de e-mail)
          </p>
        </div>

        <button
          onClick={handleOpenNewUser}
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Usuário</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-5">Nome do Funcionário</th>
                <th className="py-3 px-4">Usuário (Login)</th>
                <th className="py-3 px-4">Perfil / Permissão</th>
                <th className="py-3 px-4 text-center">Faturamento no Dashboard</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Data Cadastro</th>
                <th className="py-3 px-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {users.map((u) => {
                const isGerencial = u.role === 'admin_gerencial';
                const hasFinancialAccess = isGerencial || !!u.canViewFinancialMetrics;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-bold text-slate-900">
                      {u.name}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-blue-700">
                      {u.username}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          u.role === 'admin_gerencial'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : u.role === 'venda_atendimento'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {u.role === 'admin_gerencial'
                          ? 'Admin / Gerencial'
                          : u.role === 'venda_atendimento'
                          ? 'Venda / Atendimento'
                          : 'Produção'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isGerencial ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          Total (Admin)
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleFinancialPermission(u.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer border ${
                            hasFinancialAccess
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {hasFinancialAccess ? '✓ Liberado' : '🔒 Oculto (Clique p/ liberar)'}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button
                        onClick={() => handleOpenEditUser(u)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Novo/Editar Usuário */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUserId ? 'Editar Usuário' : 'Novo Usuário do ERP'}
        subtitle="Defina o nome de login e perfil de acesso sem exigir e-mail"
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Nome Completo do Funcionário *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Carlos Oliveira"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Nome de Usuário (Para Login) *
            </label>
            <input
              type="text"
              required
              disabled={!!editingUserId}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Ex: carlos.producao"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Perfil de Acesso (Permissões) *
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-purple-600 focus:outline-none bg-white"
            >
              <option value="venda_atendimento">Venda / Atendimento (Vendas, Clientes, Recibos)</option>
              <option value="producao">Produção (Fila de Produção, Status dos Modelos)</option>
              <option value="admin_gerencial">Admin / Gerencial (Lucratividade, Custos, Usuários)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              {editingUserId ? 'Nova Senha (Opcional)' : 'Senha de Acesso *'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editingUserId ? 'Deixe em branco para não alterar' : 'Mínimo 4 caracteres'}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none"
            />
          </div>

          <div className="pt-1 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
              />
              <span>Usuário Ativo no Sistema</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-blue-900 bg-blue-50/70 p-2 rounded-xl border border-blue-200">
              <input
                type="checkbox"
                disabled={form.role === 'admin_gerencial'}
                checked={form.role === 'admin_gerencial' ? true : form.canViewFinancialMetrics}
                onChange={(e) => setForm({ ...form, canViewFinancialMetrics: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="block font-bold">
                  {form.role === 'admin_gerencial'
                    ? 'Acesso Financeiro Total (Incluso no perfil Admin)'
                    : 'Permitir visualizar Faturamento e Contas a Receber no Dashboard'}
                </span>
                <span className="text-[10px] text-slate-500 font-normal block">
                  Permite que este operador veja faturamento do dia, do mês e indicadores financeiros no painel.
                </span>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              Salvar Usuário
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
