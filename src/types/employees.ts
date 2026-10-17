import type { User, UserRole } from './erp';

export interface EmployeeInput {
  username: string;
  name: string;
  password: string;
  role: UserRole;
  active: boolean;
  canReadCustomers: boolean;
  canViewFinancialMetrics: boolean;
}

export type EmployeeUpdate = Omit<EmployeeInput, 'username' | 'password'>;

export interface AuthEndpointResponse {
  employee?: User;
  employees?: User[];
  session?: { access_token: string; refresh_token: string };
  error?: string;
}
