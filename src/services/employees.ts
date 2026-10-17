import type { EmployeeInput, EmployeeUpdate, AuthEndpointResponse } from '../types/employees';
import { supabase } from './supabase';

async function invoke(body: object): Promise<AuthEndpointResponse> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke<AuthEndpointResponse>('pamda-auth', { body });
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error && 'context' in error && error.context instanceof Response) {
      try { message = (await error.context.json()).error; } catch {}
    }
    throw new Error(message || 'Não foi possível concluir a operação. Confira suas permissões e a conexão.');
  }
  return data || {};
}

export const employeeService = {
  async list() { return (await invoke({ action: 'list-employees' })).employees || []; },
  async create(input: EmployeeInput) { return (await invoke({ action: 'create-employee', ...input })).employee; },
  async update(id: string, input: EmployeeUpdate) { return (await invoke({ action: 'update-employee', id, ...input })).employee; },
  async resetPassword(id: string, newPassword: string) { await invoke({ action: 'reset-password', id, newPassword }); },
};
