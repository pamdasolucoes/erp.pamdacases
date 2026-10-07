// PAMDA CASES - Tipagens de Domínio do ERP B2B

export type UserRole = 'admin_gerencial' | 'venda_atendimento' | 'producao';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  passwordHash: string; // SHA-256 ou hash seguro
  canViewFinancialMetrics?: boolean; // Permissão específica para visualizar faturamento e métricas no Dashboard
  createdAt: string;
}

export type PaymentPolicyType =
  | 'pre_pago'
  | 'pagamento_entrega'
  | 'pix_manual'
  | 'fechamento_semanal'
  | 'fechamento_mensal'
  | 'condicao_especial';

export type ClosingFrequency = 'none' | 'weekly' | 'monthly' | 'custom';
export type BillingMode = 'consolidado' | 'separado';

export interface CustomerPaymentPolicy {
  policyType: PaymentPolicyType;
  produceOnlyAfterPayment: boolean;
  closingFrequency: ClosingFrequency;
  closingDay?: number; // ex: 5 para dia 5 ou sexta-feira
  paymentTermDays: number; // ex: 7, 15, 30
  creditLimit: number;
  allowNewOrdersWithOverdue: boolean;
  autoBlockOnOverdue: boolean;
  financialNotes?: string;
  showPixOnPendingReceipts: boolean;
}

export interface CustomerBranch {
  id: string;
  customerId: string;
  name: string;
  tradeName?: string;
  address: string;
  number?: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  contactName: string;
  notes?: string;
  active: boolean;
  // Exceção opcional de política para a filial
  overridePolicy?: Partial<CustomerPaymentPolicy>;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  companyName?: string;
  cnpj?: string;
  cpf?: string;
  phone: string;
  email?: string;
  contactName: string;
  notes?: string;
  active: boolean;
  isChain: boolean; // É uma rede de filiais
  billingMode: BillingMode;
  paymentPolicy: CustomerPaymentPolicy;
  branches: CustomerBranch[];
  createdAt: string;
  updatedAt: string;
}

export type ProductType = 'fisico' | 'servico' | 'kit' | 'insumo';

export interface ProductCostHistory {
  id: string;
  productId: string;
  cost: number;
  recordedAt: string;
  recordedByUsername: string;
  reason?: string;
}

export interface KitComponent {
  id: string;
  componentProductId: string;
  componentName: string;
  componentType: ProductType;
  quantity: number;
  currentUnitCost: number;
  controlsInventory: boolean;
  sortOrder: number;
}

export interface Product {
  id: string;
  code: string; // ex: 11143 ou CAP-TPU-IP15
  sku: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  modelPhone?: string; // ex: iPhone 15, S25 FE
  type: ProductType;
  currentCost: number; // Custo direto calculado ou de compra
  managerialCost?: number; // Custo gerencial manual (opcional para kits/produtos)
  salePrice: number;
  controlsInventory: boolean;
  currentInventory: number;
  minInventory: number;
  maxInventory?: number;
  active: boolean;
  b2bSiteVisible: boolean;
  notes?: string;
  components?: KitComponent[]; // Se for Kit
  costHistory?: ProductCostHistory[];
  createdAt: string;
  updatedAt: string;
}

export type InventoryMovementType =
  | 'compra'
  | 'ajuste_positivo'
  | 'ajuste_negativo'
  | 'reserva'
  | 'consumo_venda'
  | 'devolucao'
  | 'cancelamento'
  | 'correcao_manual';

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  quantity: number; // Positivo para entrada, negativo para saída
  previousInventory: number;
  resultingInventory: number;
  movementType: InventoryMovementType;
  username: string;
  recordedAt: string;
  relatedSaleId?: string;
  relatedReceiptNumber?: number;
  notes?: string;
}

export type SaleStatus = 'orcamento' | 'confirmada' | 'cancelada';

export type FinancialStatus =
  | 'aguardando_pagamento'
  | 'parcialmente_pago'
  | 'pago'
  | 'faturamento_semanal'
  | 'faturamento_mensal'
  | 'vencido'
  | 'cancelado';

export type ProductionStatus =
  | 'aguardando_liberacao'
  | 'aguardando_producao'
  | 'em_producao'
  | 'conferencia'
  | 'pronto'
  | 'entregue';

export type DeliveryStatus =
  | 'nao_definido'
  | 'retirada'
  | 'aguardando_entrega'
  | 'saiu_para_entrega'
  | 'entregue';

export type SaleOrigin =
  | 'erp_manual'
  | 'site_b2b'
  | 'whatsapp'
  | 'vendedor'
  | 'balcao'
  | 'outro';

export interface SaleItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  sku: string;
  productType: ProductType;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitDiscount: number;
  subtotal: number;
  // Snapshot imutável de custo no exato instante da venda!
  unitCostSnapshot: number;
  managerialUnitCostSnapshot: number;
  componentsSnapshot?: Array<{
    componentProductId: string;
    componentName: string;
    quantity: number;
    unitCostSnapshot: number;
  }>;
}

export interface Sale {
  id: string;
  receiptNumber: number; // Ex: 10000, 10025
  createdAt: string; // Data e hora original e imutável da realização
  updatedAt: string;
  customerId: string;
  customerName: string;
  branchId?: string;
  branchName?: string;
  branchAddressSnapshot?: string; // Endereço registrado imutável
  salespersonName: string;
  origin: SaleOrigin;
  saleStatus: SaleStatus;
  financialStatus: FinancialStatus;
  productionStatus: ProductionStatus;
  deliveryStatus: DeliveryStatus;

  // Itens e Totais
  items: SaleItem[];
  itemsCount: number;
  productsTotal: number;
  shippingFeeCharged: number; // Frete cobrado do cliente
  realDeliveryCost?: number; // Custo real de motoboy/transportadora
  discount: number;
  totalAmount: number;

  // Snapshot da condição comercial utilizada
  paymentPolicySnapshot: CustomerPaymentPolicy;
  notes?: string;

  // Pagamento consolidado
  amountPaid: number;
  pendingBalance: number;
  dueDate: string; // Data de vencimento

  // Produção
  productionStartedAt?: string;
  productionFinishedAt?: string;

  // Metadados
  createdByUser: string;
}

export type PaymentMethod =
  | 'pix_online'
  | 'pix_manual'
  | 'dinheiro'
  | 'transferencia'
  | 'outro';

export interface Payment {
  id: string;
  saleId: string;
  receiptNumber: number;
  customerId: string;
  customerName: string;
  branchId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  recordedAt: string;
  origin: string; // 'sistema', 'site_b2b', 'webhook_pix'
  externalPaymentId?: string;
  webhookEventId?: string;
  notes?: string;
  recordedByUsername: string;
}

export interface BillingClosing {
  id: string;
  code: string; // ex: FECH-2026-001
  customerId: string;
  customerName: string;
  branchId?: string;
  periodStart: string;
  periodEnd: string;
  salesIds: string[];
  receiptNumbers: number[];
  totalAmount: number;
  amountPaid: number;
  pendingBalance: number;
  status: 'aberto' | 'pago' | 'parcial';
  generatedAt: string;
  generatedBy: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email?: string;
  cnpj?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  updateProductCurrentCost: boolean;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  items: PurchaseItem[];
  totalAmount: number;
  notes?: string;
  createdByUser: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  description: string;
  category: 'motoboy' | 'material' | 'manutencao' | 'operacional' | 'outros';
  amount: number;
  date: string;
  notes?: string;
  createdByUser: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  username: string;
  action:
    | 'criacao_venda'
    | 'cancelamento_venda'
    | 'alteracao_preco'
    | 'alteracao_custo'
    | 'baixa_financeira'
    | 'alteracao_cliente'
    | 'alteracao_politica'
    | 'alteracao_usuario'
    | 'movimentacao_estoque'
    | 'status_producao'
    | 'configuracao_sistema';
  details: string;
  entity: string;
  entityId: string;
  diff?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

export interface AppSettings {
  companyName: string;
  tradeName: string;
  cnpj: string;
  phone: string;
  pixKey: string;
  pixKeyType: 'email' | 'cpf' | 'cnpj' | 'telefone' | 'aleatoria';
  pixBeneficiaryName: string;
  receiptInitialNumber: number;
  defaultDeliveryFee: number;
  siteIntegrationWebhookSecret: string;
  updatedAt: string;
}
