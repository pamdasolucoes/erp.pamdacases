import type { EmployeeInput, EmployeeUpdate } from '../types/employees';

// The legacy pamda-auth function and erp_employees schema are not deployed.
// Fail closed until the official administrative backend has been inspected and homologated.
async function unavailable(): Promise<never> {
  throw new Error('Administração de funcionários indisponível: integração oficial ainda não homologada.');
}
export const employeeService = {
  list: unavailable,
  create: (_input: EmployeeInput) => unavailable(),
  update: (_id: string, _input: EmployeeUpdate) => unavailable(),
  resetPassword: (_id: string, _newPassword: string) => unavailable(),
};
