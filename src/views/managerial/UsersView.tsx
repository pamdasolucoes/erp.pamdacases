import React, { useEffect, useState } from 'react';
import type { User } from '../../types/erp';
import type { EmployeeInput } from '../../types/employees';
import { authService } from '../../services/auth';
import { employeeService } from '../../services/employees';
import { Modal } from '../../components/common/Modal';

const emptyForm = (): EmployeeInput => ({ username: '', name: '', password: '', role: 'venda_atendimento', active: true, canReadCustomers: false, canViewFinancialMetrics: false });

export const UsersView: React.FC = () => {
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const user = authService.getCurrentUser();

  async function load() {
    setLoading(true);
    setError('');
    try { setEmployees(await employeeService.list()); }
    catch (error) { setError(error instanceof Error ? error.message : 'Erro ao carregar funcionários.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  if (user?.role !== 'admin_gerencial') return <p role="alert">Acesso não autorizado.</p>;

  function edit(employee: User | null) {
    setEditing(employee);
    setForm(employee ? { username: employee.username, name: employee.name, password: '', role: employee.role, active: employee.active, canReadCustomers: !!employee.canReadCustomers, canViewFinancialMetrics: !!employee.canViewFinancialMetrics } : emptyForm());
    setError('');
    setOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) await employeeService.update(editing.id, form);
      else await employeeService.create(form);
      setOpen(false);
      setForm(emptyForm());
      setNotice(editing ? 'Funcionário atualizado.' : 'Funcionário criado. Entregue a senha temporária por canal privado; a troca será exigida no primeiro acesso.');
      await load();
      if (editing?.id === user?.id) await authService.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!resetting) return;
    setBusy(true);
    setError('');
    try {
      await employeeService.resetPassword(resetting.id, temporaryPassword);
      setResetting(null);
      setTemporaryPassword('');
      setNotice('Senha temporária redefinida. Confirme a identidade do funcionário e entregue a senha por canal privado.');
      await load();
      if (resetting.id === user?.id) await authService.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível redefinir a senha.'); }
    finally { setBusy(false); }
  }
  return (
    <section className="space-y-5">
      <div className="flex justify-between items-center gap-3">
        <div><h1 className="text-xl font-bold text-slate-900">Funcionários e acessos</h1><p className="text-sm text-slate-500">Contas de acesso ao ERP Pamda</p></div>
        <button onClick={() => edit(null)} className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-bold">Novo funcionário</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      {loading ? <p role="status">Carregando funcionários...</p> : (
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
          <table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Usuário</th><th className="p-3">Nome</th><th className="p-3">Perfil</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr></thead>
            <tbody>{employees.map(employee => <tr key={employee.id} className="border-t border-slate-100">
              <td className="p-3 font-mono">{employee.username}</td><td className="p-3">{employee.name}</td><td className="p-3">{employee.role === 'admin_gerencial' ? 'Administrador' : employee.role === 'producao' ? 'Produção' : 'Venda / Atendimento'}</td><td className="p-3">{employee.active ? 'Ativo' : 'Inativo'}</td>
              <td className="p-3 space-x-3"><button onClick={() => edit(employee)} className="text-blue-700">Editar</button><button onClick={() => { setResetting(employee); setTemporaryPassword(''); setError(''); }} className="text-blue-700">Redefinir senha</button></td>
            </tr>)}</tbody></table>
          {!employees.length && <p className="p-4 text-slate-500">Nenhum funcionário disponível.</p>}
        </div>
      )}
      <Modal isOpen={open} onClose={() => { setOpen(false); setForm(emptyForm()); }} title={editing ? 'Editar funcionário' : 'Novo funcionário'}>
        <form onSubmit={save} className="space-y-4 text-sm">
          {error && <p role="alert" className="text-rose-700">{error}</p>}
          <label className="block">Usuário<input required readOnly={!!editing} pattern="[a-z0-9][a-z0-9._-]{2,39}" value={form.username} onChange={event => setForm({ ...form, username: event.target.value.toLowerCase() })} className="block w-full border rounded-lg p-2 mt-1" /></label>
          <label className="block">Nome<input required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="block w-full border rounded-lg p-2 mt-1" /></label>
          {!editing && <label className="block">Senha temporária<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} className="block w-full border rounded-lg p-2 mt-1" /></label>}
          <label className="block">Perfil<select value={form.role} onChange={event => { const role = event.target.value as User['role']; setForm({ ...form, role, ...(role === 'producao' ? { canReadCustomers: false, canViewFinancialMetrics: false } : {}) }); }} className="block w-full border rounded-lg p-2 mt-1"><option value="venda_atendimento">Venda / Atendimento</option><option value="producao">Produção</option><option value="admin_gerencial">Administrador</option></select></label>
          <label className="flex gap-2"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />Funcionário ativo</label>
          <label className="flex gap-2"><input type="checkbox" disabled={form.role === 'producao'} checked={form.canReadCustomers} onChange={event => setForm({ ...form, canReadCustomers: event.target.checked })} />Consultar clientes e unidades</label>
          <label className="flex gap-2"><input type="checkbox" disabled={form.role === 'producao'} checked={form.canViewFinancialMetrics} onChange={event => setForm({ ...form, canViewFinancialMetrics: event.target.checked })} />Visualizar métricas financeiras de demonstração</label>
          <button disabled={busy} className="bg-blue-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar funcionário'}</button>
        </form>
      </Modal>
      <Modal isOpen={!!resetting} onClose={() => { setResetting(null); setTemporaryPassword(''); }} title={`Redefinir senha de ${resetting?.username || ''}`}>
        <form onSubmit={resetPassword} className="space-y-4 text-sm">
          {error && <p role="alert" className="text-rose-700">{error}</p>}
          <p>Confirme a identidade do funcionário antes de redefinir a senha. Ele precisará trocar a senha temporária ao entrar.</p>
          <label className="block">Nova senha temporária<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={temporaryPassword} onChange={event => setTemporaryPassword(event.target.value)} className="block w-full border rounded-lg p-2 mt-1" /></label>
          <button disabled={busy} className="bg-blue-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">Redefinir senha</button>
        </form>
      </Modal>
    </section>
  );
};
