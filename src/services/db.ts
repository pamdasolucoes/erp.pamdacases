import {
  Customer,
  Product,
  Sale,
  Payment,
  BillingClosing,
  Supplier,
  Purchase,
  Expense,
  AuditLog,
  AppSettings,
  InventoryMovement,
  UserRole,
} from '../types/erp';
import { authService } from './auth';

// Storage keys
const STORAGE_KEYS = {
  SETTINGS: 'pamda_app_settings',
  CUSTOMERS: 'pamda_customers',
  PRODUCTS: 'pamda_products',
  SALES: 'pamda_sales',
  PAYMENTS: 'pamda_payments',
  INVENTORY_MOVEMENTS: 'pamda_inventory_movements',
  CLOSINGS: 'pamda_billing_closings',
  SUPPLIERS: 'pamda_suppliers',
  PURCHASES: 'pamda_purchases',
  EXPENSES: 'pamda_expenses',
  AUDIT_LOGS: 'pamda_audit_logs',
  NEXT_RECEIPT_SEQ: 'pamda_next_receipt_seq',
};

// Initial App Settings
const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'PAMDA CASES',
  tradeName: 'Pamda Cases B2B',
  cnpj: '12.345.678/0001-90',
  phone: '(41) 99999-8888',
  pixKey: 'capaspix@gmail.com',
  pixKeyType: 'email',
  pixBeneficiaryName: 'PAMDA CASES IND E COM',
  receiptInitialNumber: 10000,
  defaultDeliveryFee: 5.0,
  siteIntegrationWebhookSecret: 'pamda_secret_webhook_b2b_2026',
  updatedAt: '2026-10-06T12:00:00Z',
};

// Initial Seed Data (fictícios e claramente identificados conforme requisito)
const SEED_CUSTOMERS: Customer[] = [
  {
    id: 'cust-cristal-cel',
    name: 'Cristal Cel',
    companyName: 'Cristal Cel Acessórios LTDA',
    cnpj: '12.345.678/0001-90',
    phone: '(41) 3333-4444',
    email: 'contato@cristalcel.com.br',
    contactName: 'João Silva',
    notes: 'Rede com 5 lojas em Curitiba. Pagamento na entrega ou fechamento.',
    active: true,
    isChain: true,
    billingMode: 'consolidado',
    paymentPolicy: {
      policyType: 'pagamento_entrega',
      produceOnlyAfterPayment: false,
      closingFrequency: 'weekly',
      closingDay: 5, // sexta-feira
      paymentTermDays: 7,
      creditLimit: 15000,
      allowNewOrdersWithOverdue: true,
      autoBlockOnOverdue: false,
      showPixOnPendingReceipts: true,
      financialNotes: 'Fechamento semanal toda sexta-feira.',
    },
    branches: [
      {
        id: 'br-cristal-centro-1',
        customerId: 'cust-cristal-cel',
        name: 'Centro 1',
        tradeName: 'Cristal Cel Loja XV',
        address: 'Rua XV de Novembro, 123',
        neighborhood: 'Centro',
        city: 'Curitiba',
        state: 'PR',
        zipCode: '80020-310',
        phone: '(41) 99901-0001',
        contactName: 'Marcos Gerente',
        active: true,
        createdAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'br-cristal-centro-2',
        customerId: 'cust-cristal-cel',
        name: 'Centro 2',
        tradeName: 'Cristal Cel Deodoro',
        address: 'Rua Marechal Deodoro, 450',
        neighborhood: 'Centro',
        city: 'Curitiba',
        state: 'PR',
        zipCode: '80010-010',
        phone: '(41) 99901-0002',
        contactName: 'Ana Paula',
        active: true,
        createdAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'br-cristal-centro-3',
        customerId: 'cust-cristal-cel',
        name: 'Centro 3',
        tradeName: 'Cristal Cel Loureiro',
        address: 'Rua José Loureiro, 511',
        neighborhood: 'Centro',
        city: 'Curitiba',
        state: 'PR',
        zipCode: '80010-000',
        phone: '(41) 99901-0003',
        contactName: 'Roberto',
        active: true,
        createdAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'br-cristal-shopping',
        customerId: 'cust-cristal-cel',
        name: 'Shopping Estação',
        tradeName: 'Cristal Cel Estação',
        address: 'Av. Sete de Setembro, 2775',
        neighborhood: 'Rebouças',
        city: 'Curitiba',
        state: 'PR',
        zipCode: '80230-010',
        phone: '(41) 99901-0004',
        contactName: 'Fernanda',
        active: true,
        createdAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'br-cristal-bacacheri',
        customerId: 'cust-cristal-cel',
        name: 'Bacacheri',
        tradeName: 'Cristal Cel Bacacheri',
        address: 'Rua Marechal Trompowski, 265',
        neighborhood: 'Bacacheri',
        city: 'Curitiba',
        state: 'PR',
        zipCode: '82510-150',
        phone: '(41) 99901-0005',
        contactName: 'Juliano',
        active: true,
        createdAt: '2026-09-01T10:00:00Z',
      },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'cust-ziker-tec',
    name: 'Ziker Tec',
    companyName: 'Ziker Tecnologia de Acessórios ME',
    cnpj: '98.765.432/0001-10',
    phone: '(41) 3222-7777',
    contactName: 'Renato Ziker',
    active: true,
    isChain: true,
    billingMode: 'separado',
    paymentPolicy: {
      policyType: 'pre_pago',
      produceOnlyAfterPayment: true, // EXIGÊNCIA: Produzir apenas após pagamento
      closingFrequency: 'none',
      paymentTermDays: 0,
      creditLimit: 3000,
      allowNewOrdersWithOverdue: false,
      autoBlockOnOverdue: true,
      showPixOnPendingReceipts: true,
      financialNotes: 'Cliente pré-pago. Liberar produção somente após quitação.',
    },
    branches: [
      {
        id: 'br-ziker-vermelha',
        customerId: 'cust-ziker-tec',
        name: 'Loja Vermelha',
        address: 'Rua Voluntários da Pátria, 300',
        neighborhood: 'Centro',
        city: 'Curitiba',
        state: 'PR',
        zipCode: '80020-000',
        phone: '(41) 99888-1122',
        contactName: 'Cláudio',
        active: true,
        createdAt: '2026-09-10T10:00:00Z',
      },
    ],
    createdAt: '2026-09-10T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'cust-cane-produtos',
    name: 'Cane Produtos',
    companyName: 'Cane Comercio de Cases Eireli',
    cnpj: '45.123.789/0001-55',
    phone: '(41) 3040-5060',
    contactName: 'Patrícia Cane',
    active: true,
    isChain: false,
    billingMode: 'consolidado',
    paymentPolicy: {
      policyType: 'fechamento_mensal',
      produceOnlyAfterPayment: false,
      closingFrequency: 'monthly',
      closingDay: 10,
      paymentTermDays: 15,
      creditLimit: 10000,
      allowNewOrdersWithOverdue: true,
      autoBlockOnOverdue: false,
      showPixOnPendingReceipts: true,
    },
    branches: [],
    createdAt: '2026-09-15T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
];

// Seed Products (exatamente conforme o exemplo real do usuário)
const SEED_PRODUCTS: Product[] = [
  // 1. Produto Físico: CAPA TPU TRANSPARENTE IPHONE 15
  {
    id: 'prod-tpu-ip15',
    code: 'CAP-TPU-IP15',
    sku: 'CAP-TPU-IP15',
    name: 'Capa TPU Transparente iPhone 15',
    description: 'Capa TPU transparente anti-impacto com bordas reforçadas para iPhone 15.',
    category: 'Capas TPU',
    brand: 'Pamda',
    modelPhone: 'iPhone 15',
    type: 'fisico',
    currentCost: 2.5,
    salePrice: 10.0,
    controlsInventory: true,
    currentInventory: 150,
    minInventory: 20,
    active: true,
    b2bSiteVisible: true,
    costHistory: [
      {
        id: 'ch-1',
        productId: 'prod-tpu-ip15',
        cost: 2.5,
        recordedAt: '2026-09-01T10:00:00Z',
        recordedByUsername: 'admin',
        reason: 'Custo inicial do lote importação',
      },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  // 2. Produto Físico: CAPA TPU TRANSPARENTE IPHONE 15 PRO MAX
  {
    id: 'prod-tpu-ip15promax',
    code: 'CAP-TPU-IP15PM',
    sku: 'CAP-TPU-IP15PM',
    name: 'Capa TPU Transparente iPhone 15 Pro Max',
    description: 'Capa TPU transparente anti-impacto para iPhone 15 Pro Max.',
    category: 'Capas TPU',
    brand: 'Pamda',
    modelPhone: 'iPhone 15 Pro Max',
    type: 'fisico',
    currentCost: 2.7,
    salePrice: 12.0,
    controlsInventory: true,
    currentInventory: 120,
    minInventory: 20,
    active: true,
    b2bSiteVisible: true,
    costHistory: [
      {
        id: 'ch-2',
        productId: 'prod-tpu-ip15promax',
        cost: 2.7,
        recordedAt: '2026-09-01T10:00:00Z',
        recordedByUsername: 'admin',
        reason: 'Custo inicial',
      },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  // 3. Produto Físico: CAPA TPU TRANSPARENTE SAMSUNG S25 FE
  {
    id: 'prod-tpu-s25fe',
    code: 'CAP-TPU-S25FE',
    sku: 'CAP-TPU-S25FE',
    name: 'Capa TPU Transparente Samsung S25 FE',
    description: 'Capa TPU transparente para Samsung Galaxy S25 FE.',
    category: 'Capas TPU',
    brand: 'Pamda',
    modelPhone: 'Samsung S25 FE',
    type: 'fisico',
    currentCost: 2.4,
    salePrice: 10.0,
    controlsInventory: true,
    currentInventory: 85,
    minInventory: 15,
    active: true,
    b2bSiteVisible: true,
    costHistory: [
      {
        id: 'ch-3',
        productId: 'prod-tpu-s25fe',
        cost: 2.4,
        recordedAt: '2026-09-01T10:00:00Z',
        recordedByUsername: 'admin',
        reason: 'Custo inicial',
      },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  // 4. Serviço: IMPRESSÃO DTF UV EM CAPA DE CELULAR
  {
    id: 'prod-srv-dtf-uv',
    code: 'SRV-DTF-UV',
    sku: 'SRV-DTF-UV',
    name: 'Impressão DTF UV em Capa de Celular',
    description: 'Serviço de estamparia e personalização direta DTF UV com tinta curada por ultravioleta.',
    category: 'Serviços de Estamparia',
    brand: 'Pamda Print',
    type: 'servico',
    currentCost: 1.8, // R$ 1,80
    salePrice: 20.0, // Venda avulsa R$ 20,00 quando o cliente traz a capa
    controlsInventory: false,
    currentInventory: 0,
    minInventory: 0,
    active: true,
    b2bSiteVisible: true,
    costHistory: [
      {
        id: 'ch-4',
        productId: 'prod-srv-dtf-uv',
        cost: 1.8,
        recordedAt: '2026-09-01T10:00:00Z',
        recordedByUsername: 'admin',
        reason: 'Custo médio por estampa (tinta + verniz + primer)',
      },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  // 5. Kit: CAPA PERSONALIZADA TPU TRANSPARENTE IPHONE 15
  {
    id: 'prod-kit-ip15',
    code: '11143',
    sku: 'KIT-TPU-DTF-IP15',
    name: 'Capa personalizada TPU transparente - iPhone 15',
    description: 'Kit composto: Capa física TPU transparente + Estampa direta DTF UV alta resolução.',
    category: 'Kits Personalizados',
    brand: 'Pamda',
    modelPhone: 'iPhone 15',
    type: 'kit',
    currentCost: 4.3, // Custo direto calculado (2,50 + 1,80)
    managerialCost: 5.0, // Custo gerencial Pamda
    salePrice: 25.0, // Preço padrão R$ 25,00
    controlsInventory: false,
    currentInventory: 0,
    minInventory: 0,
    active: true,
    b2bSiteVisible: true,
    components: [
      {
        id: 'cmp-1',
        componentProductId: 'prod-tpu-ip15',
        componentName: 'Capa TPU Transparente iPhone 15',
        componentType: 'fisico',
        quantity: 1,
        currentUnitCost: 2.5,
        controlsInventory: true,
        sortOrder: 1,
      },
      {
        id: 'cmp-2',
        componentProductId: 'prod-srv-dtf-uv',
        componentName: 'Impressão DTF UV em Capa de Celular',
        componentType: 'servico',
        quantity: 1,
        currentUnitCost: 1.8,
        controlsInventory: false,
        sortOrder: 2,
      },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  // 6. Kit: CAPA PERSONALIZADA TPU TRANSPARENTE IPHONE 15 PRO MAX
  {
    id: 'prod-kit-ip15pm',
    code: '21152',
    sku: 'KIT-TPU-DTF-IP15PM',
    name: 'Capa personalizada TPU transparente - iPhone 15 Pro Max',
    description: 'Kit composto: Capa física TPU transparente iPhone 15 Pro Max + Estampa DTF UV.',
    category: 'Kits Personalizados',
    brand: 'Pamda',
    modelPhone: 'iPhone 15 Pro Max',
    type: 'kit',
    currentCost: 4.5,
    managerialCost: 5.2,
    salePrice: 25.0,
    controlsInventory: false,
    currentInventory: 0,
    minInventory: 0,
    active: true,
    b2bSiteVisible: true,
    components: [
      {
        id: 'cmp-3',
        componentProductId: 'prod-tpu-ip15promax',
        componentName: 'Capa TPU Transparente iPhone 15 Pro Max',
        componentType: 'fisico',
        quantity: 1,
        currentUnitCost: 2.7,
        controlsInventory: true,
        sortOrder: 1,
      },
      {
        id: 'cmp-4',
        componentProductId: 'prod-srv-dtf-uv',
        componentName: 'Impressão DTF UV em Capa de Celular',
        componentType: 'servico',
        quantity: 1,
        currentUnitCost: 1.8,
        controlsInventory: false,
        sortOrder: 2,
      },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  // 7. Kit: CAPA PERSONALIZADA TPU TRANSPARENTE SAMSUNG S25 FE
  {
    id: 'prod-kit-s25fe',
    code: '33554',
    sku: 'KIT-TPU-DTF-S25FE',
    name: 'Capa personalizada TPU transparente - Samsung S25 FE',
    description: 'Kit composto: Capa física Samsung S25 FE + Estampa DTF UV.',
    category: 'Kits Personalizados',
    brand: 'Pamda',
    modelPhone: 'Samsung S25 FE',
    type: 'kit',
    currentCost: 4.2,
    managerialCost: 4.8,
    salePrice: 25.0,
    controlsInventory: false,
    currentInventory: 0,
    minInventory: 0,
    active: true,
    b2bSiteVisible: true,
    components: [
      {
        id: 'cmp-5',
        componentProductId: 'prod-tpu-s25fe',
        componentName: 'Capa TPU Transparente Samsung S25 FE',
        componentType: 'fisico',
        quantity: 1,
        currentUnitCost: 2.4,
        controlsInventory: true,
        sortOrder: 1,
      },
      {
        id: 'cmp-6',
        componentProductId: 'prod-srv-dtf-uv',
        componentName: 'Impressão DTF UV em Capa de Celular',
        componentType: 'servico',
        quantity: 1,
        currentUnitCost: 1.8,
        controlsInventory: false,
        sortOrder: 2,
      },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
];

// Vendas de demonstração mantidas caso o usuário queira restaurá-las para teste
export const SAMPLE_DEMO_SALES: Sale[] = [
  {
    id: 'sale-10021',
    receiptNumber: 10021,
    createdAt: '2026-10-01T09:30:00Z',
    updatedAt: '2026-10-01T09:30:00Z',
    customerId: 'cust-cristal-cel',
    customerName: 'Cristal Cel',
    branchId: 'br-cristal-centro-1',
    branchName: 'Centro 1',
    branchAddressSnapshot: 'Rua XV de Novembro, 123, Centro, Curitiba - PR, CEP: 80020-310',
    salespersonName: 'Nilu Juca',
    origin: 'whatsapp',
    saleStatus: 'confirmada',
    financialStatus: 'vencido',
    productionStatus: 'entregue',
    deliveryStatus: 'entregue',
    itemsCount: 10,
    productsTotal: 250.0,
    shippingFeeCharged: 0.0,
    realDeliveryCost: 0.0,
    discount: 0.0,
    totalAmount: 250.0,
    amountPaid: 0.0,
    pendingBalance: 250.0,
    dueDate: '2026-10-08',
    paymentPolicySnapshot: {
      policyType: 'fechamento_semanal',
      produceOnlyAfterPayment: false,
      closingFrequency: 'weekly',
      paymentTermDays: 7,
      creditLimit: 15000,
      allowNewOrdersWithOverdue: true,
      autoBlockOnOverdue: false,
      showPixOnPendingReceipts: true,
    },
    items: [
      {
        id: 'si-21-1',
        productId: 'prod-kit-ip15',
        productCode: '11143',
        productName: 'Capa personalizada TPU transparente - iPhone 15',
        sku: 'KIT-TPU-DTF-IP15',
        productType: 'kit',
        unit: 'UN',
        quantity: 10,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 250.0,
        unitCostSnapshot: 4.3,
        managerialUnitCostSnapshot: 5.0,
      },
    ],
    createdByUser: 'admin',
  },
  {
    id: 'sale-10022',
    receiptNumber: 10022,
    createdAt: '2026-10-02T10:15:00Z',
    updatedAt: '2026-10-02T10:15:00Z',
    customerId: 'cust-ziker-tec',
    customerName: 'Ziker Tec',
    branchId: 'br-ziker-vermelha',
    branchName: 'Loja Vermelha',
    branchAddressSnapshot: 'Rua Voluntários da Pátria, 300, Centro, Curitiba - PR',
    salespersonName: 'Nilu Juca',
    origin: 'site_b2b',
    saleStatus: 'confirmada',
    financialStatus: 'pago',
    productionStatus: 'entregue',
    deliveryStatus: 'entregue',
    itemsCount: 5,
    productsTotal: 125.0,
    shippingFeeCharged: 0.0,
    realDeliveryCost: 0.0,
    discount: 0.0,
    totalAmount: 125.0,
    amountPaid: 125.0,
    pendingBalance: 0.0,
    dueDate: '2026-10-05',
    paymentPolicySnapshot: {
      policyType: 'pre_pago',
      produceOnlyAfterPayment: true,
      closingFrequency: 'none',
      paymentTermDays: 0,
      creditLimit: 3000,
      allowNewOrdersWithOverdue: false,
      autoBlockOnOverdue: true,
      showPixOnPendingReceipts: true,
    },
    items: [
      {
        id: 'si-22-1',
        productId: 'prod-kit-ip15',
        productCode: '11143',
        productName: 'Capa personalizada TPU transparente - iPhone 15',
        sku: 'KIT-TPU-DTF-IP15',
        productType: 'kit',
        unit: 'UN',
        quantity: 5,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 125.0,
        unitCostSnapshot: 4.3,
        managerialUnitCostSnapshot: 5.0,
      },
    ],
    createdByUser: 'admin',
  },
  {
    id: 'sale-10023',
    receiptNumber: 10023,
    createdAt: '2026-10-03T11:45:00Z',
    updatedAt: '2026-10-03T11:45:00Z',
    customerId: 'cust-cane-produtos',
    customerName: 'Cane Produtos',
    salespersonName: 'Nilu Juca',
    origin: 'vendedor',
    saleStatus: 'confirmada',
    financialStatus: 'parcialmente_pago',
    productionStatus: 'entregue',
    deliveryStatus: 'entregue',
    itemsCount: 15,
    productsTotal: 375.0,
    shippingFeeCharged: 5.0,
    realDeliveryCost: 4.0,
    discount: 0.0,
    totalAmount: 380.0,
    amountPaid: 200.0,
    pendingBalance: 180.0,
    dueDate: '2026-10-10',
    paymentPolicySnapshot: {
      policyType: 'fechamento_mensal',
      produceOnlyAfterPayment: false,
      closingFrequency: 'monthly',
      paymentTermDays: 15,
      creditLimit: 10000,
      allowNewOrdersWithOverdue: true,
      autoBlockOnOverdue: false,
      showPixOnPendingReceipts: true,
    },
    items: [
      {
        id: 'si-23-1',
        productId: 'prod-kit-ip15pm',
        productCode: '21152',
        productName: 'Capa personalizada TPU transparente - iPhone 15 Pro Max',
        sku: 'KIT-TPU-DTF-IP15PM',
        productType: 'kit',
        unit: 'UN',
        quantity: 15,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 375.0,
        unitCostSnapshot: 4.5,
        managerialUnitCostSnapshot: 5.2,
      },
    ],
    createdByUser: 'admin',
  },
  {
    id: 'sale-10024',
    receiptNumber: 10024,
    createdAt: '2026-10-04T14:20:00Z',
    updatedAt: '2026-10-04T14:20:00Z',
    customerId: 'cust-cristal-cel',
    customerName: 'Cristal Cel',
    branchId: 'br-cristal-centro-2',
    branchName: 'Centro 2',
    branchAddressSnapshot: 'Rua Marechal Deodoro, 450, Centro, Curitiba - PR',
    salespersonName: 'Nilu Juca',
    origin: 'whatsapp',
    saleStatus: 'confirmada',
    financialStatus: 'aguardando_pagamento',
    productionStatus: 'pronto',
    deliveryStatus: 'aguardando_entrega',
    itemsCount: 7,
    productsTotal: 175.0,
    shippingFeeCharged: 0.0,
    realDeliveryCost: 0.0,
    discount: 0.0,
    totalAmount: 175.0,
    amountPaid: 0.0,
    pendingBalance: 175.0,
    dueDate: '2026-10-11',
    paymentPolicySnapshot: {
      policyType: 'pagamento_entrega',
      produceOnlyAfterPayment: false,
      closingFrequency: 'weekly',
      paymentTermDays: 7,
      creditLimit: 15000,
      allowNewOrdersWithOverdue: true,
      autoBlockOnOverdue: false,
      showPixOnPendingReceipts: true,
    },
    items: [
      {
        id: 'si-24-1',
        productId: 'prod-kit-ip15',
        productCode: '11143',
        productName: 'Capa personalizada TPU transparente - iPhone 15',
        sku: 'KIT-TPU-DTF-IP15',
        productType: 'kit',
        unit: 'UN',
        quantity: 7,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 175.0,
        unitCostSnapshot: 4.3,
        managerialUnitCostSnapshot: 5.0,
      },
    ],
    createdByUser: 'admin',
  },
  // Recibo 10025: Destaque do Mockup da tela 6 e 9
  {
    id: 'sale-10025',
    receiptNumber: 10025,
    createdAt: '2026-10-06T18:44:00Z',
    updatedAt: '2026-10-06T18:44:00Z',
    customerId: 'cust-cristal-cel',
    customerName: 'Cristal Cel',
    branchId: 'br-cristal-centro-2',
    branchName: 'Centro 2',
    branchAddressSnapshot: 'Rua Marechal Deodoro, 450, Centro, Curitiba - PR, CEP: 80010-010',
    salespersonName: 'Nilu Juca',
    origin: 'whatsapp',
    saleStatus: 'confirmada',
    financialStatus: 'aguardando_pagamento',
    productionStatus: 'em_producao',
    deliveryStatus: 'nao_definido',
    itemsCount: 3,
    productsTotal: 75.0,
    shippingFeeCharged: 5.0,
    realDeliveryCost: 0.0,
    discount: 0.0,
    totalAmount: 80.0,
    amountPaid: 0.0,
    pendingBalance: 80.0,
    dueDate: '2026-10-13',
    paymentPolicySnapshot: {
      policyType: 'pagamento_entrega',
      produceOnlyAfterPayment: false,
      closingFrequency: 'weekly',
      paymentTermDays: 7,
      creditLimit: 15000,
      allowNewOrdersWithOverdue: true,
      autoBlockOnOverdue: false,
      showPixOnPendingReceipts: true,
    },
    items: [
      {
        id: 'si-25-1',
        productId: 'prod-kit-ip15',
        productCode: '11143',
        productName: 'Capa personalizada TPU transparente - iPhone 15',
        sku: 'KIT-TPU-DTF-IP15',
        productType: 'kit',
        unit: 'UN',
        quantity: 1,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 25.0,
        unitCostSnapshot: 4.3,
        managerialUnitCostSnapshot: 5.0,
      },
      {
        id: 'si-25-2',
        productId: 'prod-kit-ip15pm',
        productCode: '21152',
        productName: 'Capa personalizada TPU transparente - iPhone 15 Pro Max',
        sku: 'KIT-TPU-DTF-IP15PM',
        productType: 'kit',
        unit: 'UN',
        quantity: 1,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 25.0,
        unitCostSnapshot: 4.5,
        managerialUnitCostSnapshot: 5.2,
      },
      {
        id: 'si-25-3',
        productId: 'prod-kit-s25fe',
        productCode: '33554',
        productName: 'Capa personalizada TPU transparente - Samsung S25 FE',
        sku: 'KIT-TPU-DTF-S25FE',
        productType: 'kit',
        unit: 'UN',
        quantity: 1,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 25.0,
        unitCostSnapshot: 4.2,
        managerialUnitCostSnapshot: 4.8,
      },
    ],
    createdByUser: 'admin',
  },
  // Recibo 10026
  {
    id: 'sale-10026',
    receiptNumber: 10026,
    createdAt: '2026-10-06T11:32:00Z',
    updatedAt: '2026-10-06T11:32:00Z',
    customerId: 'cust-ziker-tec',
    customerName: 'Ziker Tec',
    branchId: 'br-ziker-vermelha',
    branchName: 'Loja Vermelha',
    branchAddressSnapshot: 'Rua Voluntários da Pátria, 300, Centro, Curitiba - PR',
    salespersonName: 'Nilu Juca',
    origin: 'site_b2b',
    saleStatus: 'confirmada',
    financialStatus: 'pago',
    productionStatus: 'em_producao',
    deliveryStatus: 'nao_definido',
    itemsCount: 10,
    productsTotal: 200.0,
    shippingFeeCharged: 0.0,
    realDeliveryCost: 0.0,
    discount: 0.0,
    totalAmount: 200.0,
    amountPaid: 200.0,
    pendingBalance: 0.0,
    dueDate: '2026-10-06',
    paymentPolicySnapshot: {
      policyType: 'pre_pago',
      produceOnlyAfterPayment: true,
      closingFrequency: 'none',
      paymentTermDays: 0,
      creditLimit: 3000,
      allowNewOrdersWithOverdue: false,
      autoBlockOnOverdue: true,
      showPixOnPendingReceipts: true,
    },
    items: [
      {
        id: 'si-26-1',
        productId: 'prod-srv-dtf-uv',
        productCode: 'SRV-DTF-UV',
        productName: 'Impressão DTF UV em Capa de Celular (capa cliente)',
        sku: 'SRV-DTF-UV',
        productType: 'servico',
        unit: 'UN',
        quantity: 10,
        unitPrice: 20.0,
        unitDiscount: 0,
        subtotal: 200.0,
        unitCostSnapshot: 1.8,
        managerialUnitCostSnapshot: 1.8,
      },
    ],
    createdByUser: 'admin',
  },
  // Recibo 10027: Pendente e bloqueado para produção devido a produceOnlyAfterPayment = true
  {
    id: 'sale-10027',
    receiptNumber: 10027,
    createdAt: '2026-10-06T14:20:00Z',
    updatedAt: '2026-10-06T14:20:00Z',
    customerId: 'cust-ziker-tec',
    customerName: 'Ziker Tec',
    branchId: 'br-ziker-vermelha',
    branchName: 'Loja Vermelha',
    branchAddressSnapshot: 'Rua Voluntários da Pátria, 300, Centro, Curitiba - PR',
    salespersonName: 'Nilu Juca',
    origin: 'whatsapp',
    saleStatus: 'confirmada',
    financialStatus: 'aguardando_pagamento',
    productionStatus: 'aguardando_liberacao', // Bloqueado aguardando quitação!
    deliveryStatus: 'nao_definido',
    itemsCount: 8,
    productsTotal: 200.0,
    shippingFeeCharged: 0.0,
    realDeliveryCost: 0.0,
    discount: 0.0,
    totalAmount: 200.0,
    amountPaid: 0.0,
    pendingBalance: 200.0,
    dueDate: '2026-10-06',
    paymentPolicySnapshot: {
      policyType: 'pre_pago',
      produceOnlyAfterPayment: true,
      closingFrequency: 'none',
      paymentTermDays: 0,
      creditLimit: 3000,
      allowNewOrdersWithOverdue: false,
      autoBlockOnOverdue: true,
      showPixOnPendingReceipts: true,
    },
    items: [
      {
        id: 'si-27-1',
        productId: 'prod-kit-ip15pm',
        productCode: '21152',
        productName: 'Capa personalizada TPU transparente - iPhone 15 Pro Max',
        sku: 'KIT-TPU-DTF-IP15PM',
        productType: 'kit',
        unit: 'UN',
        quantity: 8,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 200.0,
        unitCostSnapshot: 4.5,
        managerialUnitCostSnapshot: 5.2,
      },
    ],
    createdByUser: 'admin',
  },
  // Recibo 10028
  {
    id: 'sale-10028',
    receiptNumber: 10028,
    createdAt: '2026-10-06T16:05:00Z',
    updatedAt: '2026-10-06T16:05:00Z',
    customerId: 'cust-cristal-cel',
    customerName: 'Cristal Cel',
    branchId: 'br-cristal-shopping',
    branchName: 'Shopping Estação',
    branchAddressSnapshot: 'Av. Sete de Setembro, 2775, Rebouças, Curitiba - PR',
    salespersonName: 'Nilu Juca',
    origin: 'whatsapp',
    saleStatus: 'confirmada',
    financialStatus: 'pago',
    productionStatus: 'em_producao',
    deliveryStatus: 'nao_definido',
    itemsCount: 6,
    productsTotal: 150.0,
    shippingFeeCharged: 0.0,
    realDeliveryCost: 0.0,
    discount: 0.0,
    totalAmount: 150.0,
    amountPaid: 150.0,
    pendingBalance: 0.0,
    dueDate: '2026-10-13',
    paymentPolicySnapshot: {
      policyType: 'pagamento_entrega',
      produceOnlyAfterPayment: false,
      closingFrequency: 'weekly',
      paymentTermDays: 7,
      creditLimit: 15000,
      allowNewOrdersWithOverdue: true,
      autoBlockOnOverdue: false,
      showPixOnPendingReceipts: true,
    },
    items: [
      {
        id: 'si-28-1',
        productId: 'prod-kit-s25fe',
        productCode: '33554',
        productName: 'Capa personalizada TPU transparente - Samsung S25 FE',
        sku: 'KIT-TPU-DTF-S25FE',
        productType: 'kit',
        unit: 'UN',
        quantity: 6,
        unitPrice: 25.0,
        unitDiscount: 0,
        subtotal: 150.0,
        unitCostSnapshot: 4.2,
        managerialUnitCostSnapshot: 4.8,
      },
    ],
    createdByUser: 'admin',
  },
];

// Base inicial zerada conforme solicitação do usuário ("Pode zerar todos os parâmetros de vendas hoje...")
const SEED_SALES: Sale[] = [];

class DatabaseService {
  private settings: AppSettings = DEFAULT_SETTINGS;
  private customers: Customer[] = [];
  private products: Product[] = [];
  private sales: Sale[] = [];
  private payments: Payment[] = [];
  private inventoryMovements: InventoryMovement[] = [];
  private closings: BillingClosing[] = [];
  private suppliers: Supplier[] = [];
  private purchases: Purchase[] = [];
  private expenses: Expense[] = [];
  private auditLogs: AuditLog[] = [];
  private nextReceiptSeq: number = 10001;

  private listeners: Set<() => void> = new Set();

  constructor() {
    this.init();
  }

  private init() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    // Carregar configurações
    const s = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    this.settings = s ? JSON.parse(s) : DEFAULT_SETTINGS;

    // Clientes
    const c = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    this.customers = c ? JSON.parse(c) : SEED_CUSTOMERS;

    // Produtos
    const p = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    this.products = p ? JSON.parse(p) : SEED_PRODUCTS;

    // Verificação de zeramento solicitado pelo usuário:
    const isZeroed = localStorage.getItem('pamda_zeroed_v4');
    if (!isZeroed) {
      this.sales = [];
      this.payments = [];
      this.nextReceiptSeq = this.settings.receiptInitialNumber || 10001;
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.NEXT_RECEIPT_SEQ, this.nextReceiptSeq.toString());
      localStorage.setItem('pamda_zeroed_v4', 'true');
    } else {
      const sl = localStorage.getItem(STORAGE_KEYS.SALES);
      this.sales = sl ? JSON.parse(sl) : [];
      const seq = localStorage.getItem(STORAGE_KEYS.NEXT_RECEIPT_SEQ);
      this.nextReceiptSeq = seq ? parseInt(seq, 10) : 10001;
      const pm = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
      this.payments = pm ? JSON.parse(pm) : [];
    }

    // Movimentações Estoque
    const im = localStorage.getItem(STORAGE_KEYS.INVENTORY_MOVEMENTS);
    this.inventoryMovements = im ? JSON.parse(im) : [];

    // Fechamentos
    const cl = localStorage.getItem(STORAGE_KEYS.CLOSINGS);
    this.closings = cl ? JSON.parse(cl) : [];

    // Fornecedores
    const sp = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
    this.suppliers = sp
      ? JSON.parse(sp)
      : [
          {
            id: 'sup-1',
            name: 'Shenzhen Cases Tech Co.',
            contactName: 'Lin Chen',
            phone: '+86 755 8888 9999',
            notes: 'Fornecedor principal de capas TPU transparente e MagSafe.',
            active: true,
            createdAt: '2026-08-01T10:00:00Z',
          },
        ];

    // Compras
    const pur = localStorage.getItem(STORAGE_KEYS.PURCHASES);
    this.purchases = pur ? JSON.parse(pur) : [];

    // Despesas
    const exp = localStorage.getItem(STORAGE_KEYS.EXPENSES);
    this.expenses = exp
      ? JSON.parse(exp)
      : [
          {
            id: 'exp-1',
            description: 'Motoboy entregas centro',
            category: 'motoboy',
            amount: 45.0,
            date: '2026-10-06',
            createdByUser: 'admin',
            createdAt: '2026-10-06T14:00:00Z',
          },
        ];

    // Logs
    const log = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    this.auditLogs = log ? JSON.parse(log) : [];

    // Salvar initial se estiver vazio
    this.saveAll();
  }

  private saveAll() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers));
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(this.products));
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(this.sales));
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments));
    localStorage.setItem(STORAGE_KEYS.INVENTORY_MOVEMENTS, JSON.stringify(this.inventoryMovements));
    localStorage.setItem(STORAGE_KEYS.CLOSINGS, JSON.stringify(this.closings));
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(this.suppliers));
    localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(this.purchases));
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(this.expenses));
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs));
    localStorage.setItem(STORAGE_KEYS.NEXT_RECEIPT_SEQ, this.nextReceiptSeq.toString());
  }

  public subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    this.saveAll();
    this.listeners.forEach((cb) => cb());
  }

  // Zerar vendas e parâmetros do sistema (conforme solicitado pelo usuário)
  public clearAllSales() {
    this.sales = [];
    this.payments = [];
    this.nextReceiptSeq = this.settings.receiptInitialNumber || 10001;
    this.logAudit('configuracao_sistema', 'Sales', 'ALL', 'Todos os parâmetros de vendas e faturamento foram zerados pelo usuário.');
    this.notify();
  }

  // Restaurar dados de demonstração (caso deseje testar visualizações com massa de dados)
  public loadSampleSales() {
    this.sales = JSON.parse(JSON.stringify(SAMPLE_DEMO_SALES));
    this.nextReceiptSeq = 10029;
    this.logAudit('configuracao_sistema', 'Sales', 'ALL', 'Vendas de exemplo carregadas para demonstração.');
    this.notify();
  }

  // Log de Auditoria
  public logAudit(action: AuditLog['action'], entity: string, entityId: string, details: string, diff?: AuditLog['diff']) {
    const user = authService.getCurrentUser();
    const log: AuditLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      username: user ? user.username : 'sistema',
      action,
      entity,
      entityId,
      details,
      diff,
    };
    this.auditLogs.unshift(log);
    // Manter últimos 500 logs
    if (this.auditLogs.length > 500) {
      this.auditLogs = this.auditLogs.slice(0, 500);
    }
    this.saveAll();
  }

  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs];
  }

  // Configurações
  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...newSettings, updatedAt: new Date().toISOString() };
    this.logAudit('configuracao_sistema', 'AppSettings', 'global', 'Configurações do sistema alteradas');
    this.notify();
  }

  // Clientes
  public getCustomers(): Customer[] {
    return [...this.customers];
  }

  public getCustomerById(id: string): Customer | undefined {
    return this.customers.find((c) => c.id === id);
  }

  public saveCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Customer {
    const now = new Date().toISOString();
    let result: Customer;

    if (customer.id) {
      const idx = this.customers.findIndex((c) => c.id === customer.id);
      if (idx !== -1) {
        result = {
          ...this.customers[idx],
          ...customer,
          updatedAt: now,
        };
        this.customers[idx] = result;
        this.logAudit('alteracao_cliente', 'Customer', result.id, `Cliente ${result.name} atualizado`);
      } else {
        result = {
          ...customer,
          id: customer.id,
          createdAt: now,
          updatedAt: now,
        };
        this.customers.push(result);
      }
    } else {
      result = {
        ...customer,
        id: 'cust-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        createdAt: now,
        updatedAt: now,
      };
      this.customers.push(result);
      this.logAudit('alteracao_cliente', 'Customer', result.id, `Novo cliente cadastrado: ${result.name}`);
    }

    this.notify();
    return result;
  }

  public toggleCustomerActive(id: string): boolean {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;
    cust.active = !cust.active;
    cust.updatedAt = new Date().toISOString();
    this.logAudit('alteracao_cliente', 'Customer', id, `Status de ativo alterado para ${cust.active}`);
    this.notify();
    return cust.active;
  }

  // Filiais
  public addBranch(customerId: string, branchData: Omit<Customer['branches'][0], 'id' | 'customerId' | 'createdAt'>): Customer['branches'][0] | null {
    const cust = this.customers.find((c) => c.id === customerId);
    if (!cust) return null;

    const newBranch: Customer['branches'][0] = {
      ...branchData,
      id: 'br-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      customerId,
      createdAt: new Date().toISOString(),
    };

    cust.branches.push(newBranch);
    cust.updatedAt = new Date().toISOString();
    this.logAudit('alteracao_cliente', 'CustomerBranch', newBranch.id, `Nova filial ${newBranch.name} adicionada a ${cust.name}`);
    this.notify();
    return newBranch;
  }

  public updateBranch(customerId: string, branchId: string, branchData: Partial<Customer['branches'][0]>): boolean {
    const cust = this.customers.find((c) => c.id === customerId);
    if (!cust) return false;

    const bIdx = cust.branches.findIndex((b) => b.id === branchId);
    if (bIdx === -1) return false;

    cust.branches[bIdx] = { ...cust.branches[bIdx], ...branchData };
    cust.updatedAt = new Date().toISOString();
    this.logAudit('alteracao_cliente', 'CustomerBranch', branchId, `Filial ${cust.branches[bIdx].name} atualizada`);
    this.notify();
    return true;
  }

  // Produtos
  public getProducts(): Product[] {
    return [...this.products];
  }

  public getProductById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  public saveProduct(prod: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Product {
    const now = new Date().toISOString();
    const user = authService.getCurrentUser();
    let result: Product;

    if (prod.id) {
      const idx = this.products.findIndex((p) => p.id === prod.id);
      if (idx !== -1) {
        const oldProd = this.products[idx];
        const costChanged = oldProd.currentCost !== prod.currentCost;

        const costHistory = [...(oldProd.costHistory || [])];
        if (costChanged) {
          costHistory.unshift({
            id: 'ch-' + Date.now(),
            productId: oldProd.id,
            cost: prod.currentCost,
            recordedAt: now,
            recordedByUsername: user ? user.username : 'sistema',
            reason: 'Atualização de custo cadastral',
          });
          this.logAudit('alteracao_custo', 'Product', oldProd.id, `Custo alterado de R$ ${oldProd.currentCost} para R$ ${prod.currentCost}`, {
            before: { cost: oldProd.currentCost },
            after: { cost: prod.currentCost },
          });
        }

        result = {
          ...oldProd,
          ...prod,
          costHistory,
          updatedAt: now,
        };
        this.products[idx] = result;
        this.logAudit('alteracao_preco', 'Product', result.id, `Produto ${result.name} atualizado`);
      } else {
        result = {
          ...prod,
          id: prod.id,
          createdAt: now,
          updatedAt: now,
        };
        this.products.push(result);
      }
    } else {
      const newId = 'prod-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      result = {
        ...prod,
        id: newId,
        costHistory: [
          {
            id: 'ch-' + Date.now(),
            productId: newId,
            cost: prod.currentCost,
            recordedAt: now,
            recordedByUsername: user ? user.username : 'sistema',
            reason: 'Custo inicial do produto',
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      this.products.push(result);
      this.logAudit('alteracao_preco', 'Product', result.id, `Novo produto criado: ${result.name}`);
    }

    this.notify();
    return result;
  }

  public toggleProductActive(id: string): boolean {
    const p = this.products.find((prod) => prod.id === id);
    if (!p) return false;
    p.active = !p.active;
    p.updatedAt = new Date().toISOString();
    this.notify();
    return p.active;
  }

  // Clonagem Inteligente de Produtos
  public cloneProduct(sourceProductId: string, override: { name: string; sku: string; code: string; modelPhone?: string }): Product | null {
    const source = this.products.find((p) => p.id === sourceProductId);
    if (!source) return null;

    const cloned: Product = {
      ...source,
      id: 'prod-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: override.name,
      sku: override.sku,
      code: override.code,
      modelPhone: override.modelPhone || source.modelPhone,
      currentInventory: 0, // Estoque não se copia
      costHistory: [
        {
          id: 'ch-' + Date.now(),
          productId: '',
          cost: source.currentCost,
          recordedAt: new Date().toISOString(),
          recordedByUsername: authService.getCurrentUser()?.username || 'sistema',
          reason: `Clonado a partir de ${source.name} (${source.code})`,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    cloned.costHistory![0].productId = cloned.id;

    this.products.push(cloned);
    this.logAudit('alteracao_preco', 'Product', cloned.id, `Produto clonado de ${source.name} -> ${cloned.name}`);
    this.notify();
    return cloned;
  }

  // Clonagem Inteligente de Kits
  public cloneKit(sourceKitId: string, override: { name: string; sku: string; code: string; modelPhone?: string }): Product | null {
    const source = this.products.find((p) => p.id === sourceKitId && p.type === 'kit');
    if (!source) return null;

    const clonedKit: Product = {
      ...source,
      id: 'prod-kit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: override.name,
      sku: override.sku,
      code: override.code,
      modelPhone: override.modelPhone || source.modelPhone,
      components: source.components ? JSON.parse(JSON.stringify(source.components)) : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.products.push(clonedKit);
    this.logAudit('alteracao_preco', 'Product', clonedKit.id, `Kit clonado de ${source.name} -> ${clonedKit.name}`);
    this.notify();
    return clonedKit;
  }

  // Super Clone: Duplicar Produto + Kit (ex: iPhone 15 -> iPhone 16)
  // Cria a capa física iPhone 16, e cria o Kit Capa Personalizada iPhone 16 substituindo automaticamente a capa física pelo novo produto e mantendo a estampa DTF UV!
  public superCloneProductAndKit(params: {
    sourcePhysicalProductId: string;
    sourceKitId: string;
    newModelName: string; // ex: 'iPhone 16'
    newPhysicalName?: string;
    newPhysicalSku?: string;
    newPhysicalCode?: string;
    newKitName?: string;
    newKitSku?: string;
    newKitCode?: string;
    newPhysicalCost?: number;
    newSalePrice?: number;
  }): { newPhysicalProduct: Product; newKit: Product } | null {
    const sourcePhysical = this.products.find((p) => p.id === params.sourcePhysicalProductId);
    const sourceKit = this.products.find((p) => p.id === params.sourceKitId);

    if (!sourcePhysical || !sourceKit) return null;

    const timestamp = Date.now().toString().slice(-4);
    const newPhysicalName = params.newPhysicalName || sourcePhysical.name.replace(sourcePhysical.modelPhone || '', params.newModelName).trim();
    const newPhysicalSku = params.newPhysicalSku || `CAP-TPU-${params.newModelName.replace(/\s+/g, '').toUpperCase()}`;
    const newPhysicalCode = params.newPhysicalCode || `CAP-${params.newModelName.replace(/\s+/g, '').toUpperCase()}`;

    // 1. Criar novo produto físico
    const newPhysical: Product = {
      ...sourcePhysical,
      id: 'prod-phy-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: newPhysicalName,
      sku: newPhysicalSku,
      code: newPhysicalCode,
      modelPhone: params.newModelName,
      currentCost: params.newPhysicalCost !== undefined ? params.newPhysicalCost : sourcePhysical.currentCost,
      currentInventory: 0,
      costHistory: [
        {
          id: 'ch-' + Date.now(),
          productId: '',
          cost: params.newPhysicalCost !== undefined ? params.newPhysicalCost : sourcePhysical.currentCost,
          recordedAt: new Date().toISOString(),
          recordedByUsername: authService.getCurrentUser()?.username || 'sistema',
          reason: `Super Clone de ${sourcePhysical.name}`,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    newPhysical.costHistory![0].productId = newPhysical.id;
    this.products.push(newPhysical);

    // 2. Criar novo Kit com substituição inteligente do componente físico
    const newKitName = params.newKitName || sourceKit.name.replace(sourceKit.modelPhone || '', params.newModelName).trim();
    const newKitSku = params.newKitSku || `KIT-TPU-DTF-${params.newModelName.replace(/\s+/g, '').toUpperCase()}`;
    const newKitCode = params.newKitCode || (Math.floor(10000 + Math.random() * 89999)).toString();

    // Montar nova lista de componentes
    const updatedComponents = (sourceKit.components || []).map((cmp) => {
      // Se este componente era a capa física antiga, substituir pelo novo produto físico criado
      if (cmp.componentProductId === sourcePhysical.id) {
        return {
          ...cmp,
          id: 'cmp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          componentProductId: newPhysical.id,
          componentName: newPhysical.name,
          currentUnitCost: newPhysical.currentCost,
        };
      }
      return { ...cmp };
    });

    // Recalcular custos do kit
    const directCost = updatedComponents.reduce((acc, c) => acc + c.currentUnitCost * c.quantity, 0);

    const newKit: Product = {
      ...sourceKit,
      id: 'prod-kit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: newKitName,
      sku: newKitSku,
      code: newKitCode,
      modelPhone: params.newModelName,
      currentCost: directCost,
      managerialCost: sourceKit.managerialCost ? sourceKit.managerialCost : directCost,
      salePrice: params.newSalePrice !== undefined ? params.newSalePrice : sourceKit.salePrice,
      components: updatedComponents,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.products.push(newKit);

    this.logAudit('alteracao_preco', 'Product', newKit.id, `Super Clone gerou ${newPhysical.name} e ${newKit.name}`);
    this.notify();

    return { newPhysicalProduct: newPhysical, newKit };
  }

  // Estoque
  public getInventoryMovements(productId?: string): InventoryMovement[] {
    if (productId) {
      return this.inventoryMovements.filter((m) => m.productId === productId);
    }
    return [...this.inventoryMovements];
  }

  public registerInventoryAdjustment(params: {
    productId: string;
    quantity: number; // Positivo para entrada, negativo para saída
    movementType: InventoryMovement['movementType'];
    notes?: string;
  }): boolean {
    const prod = this.products.find((p) => p.id === params.productId);
    if (!prod || !prod.controlsInventory) return false;

    const prev = prod.currentInventory;
    const res = prev + params.quantity;
    prod.currentInventory = res;
    prod.updatedAt = new Date().toISOString();

    const user = authService.getCurrentUser();
    const movement: InventoryMovement = {
      id: 'mov-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      productId: prod.id,
      productCode: prod.code,
      productName: prod.name,
      quantity: params.quantity,
      previousInventory: prev,
      resultingInventory: res,
      movementType: params.movementType,
      username: user ? user.username : 'sistema',
      recordedAt: new Date().toISOString(),
      notes: params.notes,
    };

    this.inventoryMovements.unshift(movement);
    this.logAudit('movimentacao_estoque', 'Inventory', prod.id, `Estoque ajustado: ${prod.name} (${params.quantity > 0 ? '+' : ''}${params.quantity}). Novo: ${res}`);
    this.notify();
    return true;
  }

  // Vendas
  public getSales(): Sale[] {
    return [...this.sales];
  }

  public getSaleById(id: string): Sale | undefined {
    return this.sales.find((s) => s.id === id);
  }

  public getSaleByReceiptNumber(receiptNumber: number): Sale | undefined {
    return this.sales.find((s) => s.receiptNumber === receiptNumber);
  }

  // CRIAÇÃO DE NOVA VENDA
  public createSale(saleData: {
    customerId: string;
    branchId?: string;
    salespersonName: string;
    origin: Sale['origin'];
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      unitDiscount?: number;
    }>;
    shippingFeeCharged?: number;
    discount?: number;
    notes?: string;
    dueDate?: string;
    financialStatus?: Sale['financialStatus'];
  }): Sale {
    const customer = this.customers.find((c) => c.id === saleData.customerId);
    if (!customer) throw new Error('Cliente não encontrado');

    const branch = saleData.branchId ? customer.branches.find((b) => b.id === saleData.branchId) : undefined;

    // Snapshot da condição comercial (regra de prioridade: filial > rede > padrão)
    const effectivePolicy = {
      ...customer.paymentPolicy,
      ...(branch?.overridePolicy || {}),
    };

    // Endereço imutável da filial ou do cliente
    let addressSnapshot = '';
    if (branch) {
      addressSnapshot = `${branch.address}${branch.number ? ', ' + branch.number : ''}, ${branch.neighborhood}, ${branch.city} - ${branch.state}, CEP: ${branch.zipCode}`;
    } else {
      addressSnapshot = 'Balcão / Retirada direta Pamda Cases';
    }

    // Gerar sequencial único a partir de 10000
    const receiptNumber = this.nextReceiptSeq;
    this.nextReceiptSeq += 1;

    // Processar itens com SNAPSHOT IMUTÁVEL DE CUSTO
    let productsTotal = 0;
    let totalItemsCount = 0;

    const processedItems: Sale['items'] = saleData.items.map((itemInput) => {
      const prod = this.products.find((p) => p.id === itemInput.productId);
      if (!prod) throw new Error(`Produto ${itemInput.productId} não encontrado`);

      const qty = itemInput.quantity;
      const unitPrice = itemInput.unitPrice;
      const unitDiscount = itemInput.unitDiscount || 0;
      const subtotal = (unitPrice - unitDiscount) * qty;

      productsTotal += subtotal;
      totalItemsCount += qty;

      // Se for Kit, montar snapshot dos componentes
      const componentsSnapshot = prod.components?.map((cmp) => ({
        componentProductId: cmp.componentProductId,
        componentName: cmp.componentName,
        quantity: cmp.quantity * qty,
        unitCostSnapshot: cmp.currentUnitCost,
      }));

      // BAIXA DE ESTOQUE AUTOMÁTICA
      // 1. Se for produto físico simples com controle de estoque
      if (prod.type === 'fisico' && prod.controlsInventory) {
        this.registerInventoryAdjustment({
          productId: prod.id,
          quantity: -qty,
          movementType: 'consumo_venda',
          notes: `Venda Recibo nº ${receiptNumber}`,
        });
      }
      // 2. Se for Kit, dar baixa nos componentes FÍSICOS do kit!
      if (prod.type === 'kit' && prod.components) {
        for (const cmp of prod.components) {
          if (cmp.controlsInventory && cmp.componentType === 'fisico') {
            const cmpProd = this.products.find((p) => p.id === cmp.componentProductId);
            if (cmpProd && cmpProd.controlsInventory) {
              const compQty = cmp.quantity * qty;
              this.registerInventoryAdjustment({
                productId: cmpProd.id,
                quantity: -compQty,
                movementType: 'consumo_venda',
                notes: `Consumo em Kit (${prod.name}) - Venda Recibo nº ${receiptNumber}`,
              });
            }
          }
        }
      }

      return {
        id: 'si-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        sku: prod.sku,
        productType: prod.type,
        unit: 'UN',
        quantity: qty,
        unitPrice,
        unitDiscount,
        subtotal,
        unitCostSnapshot: prod.currentCost, // IMUTÁVEL
        managerialUnitCostSnapshot: prod.managerialCost || prod.currentCost, // IMUTÁVEL
        componentsSnapshot,
      };
    });

    const shippingFeeCharged = saleData.shippingFeeCharged || 0;
    const discount = saleData.discount || 0;
    const totalAmount = productsTotal + shippingFeeCharged - discount;

    // Regra da produção:
    // Se cliente tiver "produzir somente após pagamento" = true, fica aguardando liberação.
    // Senão, fica aguardando produção direto!
    const isPaid = saleData.financialStatus === 'pago';
    let productionStatus: Sale['productionStatus'] = 'aguardando_producao';
    if (effectivePolicy.produceOnlyAfterPayment && !isPaid) {
      productionStatus = 'aguardando_liberacao';
    }

    const user = authService.getCurrentUser();
    const nowIso = new Date().toISOString();

    const sale: Sale = {
      id: 'sale-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      receiptNumber,
      createdAt: nowIso, // IMUTÁVEL
      updatedAt: nowIso,
      customerId: customer.id,
      customerName: customer.name,
      branchId: branch?.id,
      branchName: branch?.name,
      branchAddressSnapshot: addressSnapshot,
      salespersonName: saleData.salespersonName,
      origin: saleData.origin,
      saleStatus: 'confirmada',
      financialStatus: saleData.financialStatus || 'aguardando_pagamento',
      productionStatus,
      deliveryStatus: 'nao_definido',
      items: processedItems,
      itemsCount: totalItemsCount,
      productsTotal,
      shippingFeeCharged,
      realDeliveryCost: 0,
      discount,
      totalAmount,
      paymentPolicySnapshot: effectivePolicy,
      notes: saleData.notes,
      amountPaid: isPaid ? totalAmount : 0,
      pendingBalance: isPaid ? 0 : totalAmount,
      dueDate: saleData.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      createdByUser: user ? user.username : 'sistema',
    };

    this.sales.unshift(sale);

    // Se a venda já foi criada como paga, registrar o pagamento correspondente
    if (isPaid) {
      this.payments.push({
        id: 'pm-' + Date.now(),
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        customerId: customer.id,
        customerName: customer.name,
        branchId: branch?.id,
        amount: totalAmount,
        paymentMethod: 'pix_online',
        recordedAt: nowIso,
        origin: 'sistema',
        recordedByUsername: user ? user.username : 'sistema',
      });
    }

    this.logAudit('criacao_venda', 'Sale', sale.id, `Venda gerada: Recibo nº ${sale.receiptNumber} - Cliente: ${sale.customerName} - Total: R$ ${sale.totalAmount.toFixed(2)}`);
    this.notify();
    return sale;
  }

  // Cancelamento de Venda (com estorno rastreável de estoque)
  public cancelSale(saleId: string, reason: string): boolean {
    const sale = this.sales.find((s) => s.id === saleId);
    if (!sale || sale.saleStatus === 'cancelada') return false;

    sale.saleStatus = 'cancelada';
    sale.financialStatus = 'cancelado';
    sale.updatedAt = new Date().toISOString();

    // Estornar estoque dos itens
    for (const item of sale.items) {
      const prod = this.products.find((p) => p.id === item.productId);
      if (prod && prod.type === 'fisico' && prod.controlsInventory) {
        this.registerInventoryAdjustment({
          productId: prod.id,
          quantity: item.quantity,
          movementType: 'cancelamento',
          notes: `Estorno cancelamento Recibo nº ${sale.receiptNumber}`,
        });
      }
      if (prod && prod.type === 'kit' && prod.components) {
        for (const cmp of prod.components) {
          if (cmp.controlsInventory && cmp.componentType === 'fisico') {
            const cmpProd = this.products.find((p) => p.id === cmp.componentProductId);
            if (cmpProd && cmpProd.controlsInventory) {
              this.registerInventoryAdjustment({
                productId: cmpProd.id,
                quantity: cmp.quantity * item.quantity,
                movementType: 'cancelamento',
                notes: `Estorno cancelamento Kit Recibo nº ${sale.receiptNumber}`,
              });
            }
          }
        }
      }
    }

    this.logAudit('cancelamento_venda', 'Sale', sale.id, `Venda cancelada: Recibo nº ${sale.receiptNumber}. Motivo: ${reason}`);
    this.notify();
    return true;
  }

  // Produção: atualização de status
  public updateProductionStatus(saleId: string, status: Sale['productionStatus']): { success: boolean; message?: string } {
    const sale = this.sales.find((s) => s.id === saleId);
    if (!sale) return { success: false, message: 'Venda não encontrada' };

    // Regra: Não liberar para produção se o cliente tem política "produzir apenas após pagamento" e ainda tem saldo pendente
    if (
      status === 'em_producao' &&
      sale.paymentPolicySnapshot.produceOnlyAfterPayment &&
      sale.pendingBalance > 0
    ) {
      return {
        success: false,
        message: 'Atenção: O cliente possui a regra comercial "Produzir somente após pagamento" e esta venda ainda possui saldo pendente de R$ ' + sale.pendingBalance.toFixed(2),
      };
    }

    const prev = sale.productionStatus;
    sale.productionStatus = status;
    sale.updatedAt = new Date().toISOString();

    if (status === 'em_producao' && !sale.productionStartedAt) {
      sale.productionStartedAt = new Date().toISOString();
    }
    if (status === 'pronto') {
      sale.productionFinishedAt = new Date().toISOString();
    }

    this.logAudit('status_producao', 'Sale', sale.id, `Status de produção alterado de ${prev} para ${status} (Recibo nº ${sale.receiptNumber})`);
    this.notify();
    return { success: true };
  }

  // Baixa / Registro de Pagamento
  public registerPayment(params: {
    saleId: string;
    amount: number;
    paymentMethod: Payment['paymentMethod'];
    origin?: string;
    notes?: string;
  }): { success: boolean; message?: string; payment?: Payment } {
    const sale = this.sales.find((s) => s.id === params.saleId);
    if (!sale) return { success: false, message: 'Venda não encontrada' };

    if (params.amount <= 0) {
      return { success: false, message: 'O valor do pagamento deve ser maior que zero' };
    }

    const user = authService.getCurrentUser();
    const nowIso = new Date().toISOString();

    const payment: Payment = {
      id: 'pay-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      customerId: sale.customerId,
      customerName: sale.customerName,
      branchId: sale.branchId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      recordedAt: nowIso,
      origin: params.origin || 'sistema',
      notes: params.notes,
      recordedByUsername: user ? user.username : 'sistema',
    };

    this.payments.unshift(payment);

    // Atualizar totais da venda
    sale.amountPaid += params.amount;
    sale.pendingBalance = Math.max(0, sale.totalAmount - sale.amountPaid);

    if (sale.pendingBalance === 0) {
      sale.financialStatus = 'pago';
      // Se estava aguardando liberação por falta de pagamento, liberar agora para aguardando produção!
      if (sale.productionStatus === 'aguardando_liberacao') {
        sale.productionStatus = 'aguardando_producao';
      }
    } else {
      sale.financialStatus = 'parcialmente_pago';
    }

    sale.updatedAt = nowIso;

    this.logAudit('baixa_financeira', 'Payment', payment.id, `Baixa financeira de R$ ${params.amount.toFixed(2)} (${params.paymentMethod}) no Recibo nº ${sale.receiptNumber}`);
    this.notify();
    return { success: true, payment };
  }

  public getPayments(saleId?: string): Payment[] {
    if (saleId) {
      return this.payments.filter((p) => p.saleId === saleId);
    }
    return [...this.payments];
  }

  // Frete e Custo Real de Entrega
  public updateDeliveryCost(saleId: string, realDeliveryCost: number, deliveryStatus: Sale['deliveryStatus']): boolean {
    const sale = this.sales.find((s) => s.id === saleId);
    if (!sale) return false;

    sale.realDeliveryCost = realDeliveryCost;
    sale.deliveryStatus = deliveryStatus;
    sale.updatedAt = new Date().toISOString();
    this.logAudit('baixa_financeira', 'Sale', sale.id, `Custo real de entrega atualizado para R$ ${realDeliveryCost.toFixed(2)} (Recibo nº ${sale.receiptNumber})`);
    this.notify();
    return true;
  }

  // Fechamento Semanal / Mensal de Vendas
  public createBillingClosing(params: {
    customerId: string;
    branchId?: string;
    periodStart: string;
    periodEnd: string;
    salesIds: string[];
  }): BillingClosing | null {
    const customer = this.customers.find((c) => c.id === params.customerId);
    if (!customer) return null;

    const selectedSales = this.sales.filter((s) => params.salesIds.includes(s.id));
    if (selectedSales.length === 0) return null;

    const totalAmount = selectedSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const amountPaid = selectedSales.reduce((acc, s) => acc + s.amountPaid, 0);
    const pendingBalance = totalAmount - amountPaid;

    const code = 'FECH-' + new Date().getFullYear() + '-' + (this.closings.length + 1).toString().padStart(3, '0');
    const user = authService.getCurrentUser();

    const closing: BillingClosing = {
      id: 'clos-' + Date.now(),
      code,
      customerId: customer.id,
      customerName: customer.name,
      branchId: params.branchId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      salesIds: params.salesIds,
      receiptNumbers: selectedSales.map((s) => s.receiptNumber),
      totalAmount,
      amountPaid,
      pendingBalance,
      status: pendingBalance === 0 ? 'pago' : amountPaid > 0 ? 'parcial' : 'aberto',
      generatedAt: new Date().toISOString(),
      generatedBy: user ? user.username : 'sistema',
    };

    this.closings.unshift(closing);
    this.logAudit('baixa_financeira', 'BillingClosing', closing.id, `Fechamento ${closing.code} criado para ${customer.name}: R$ ${totalAmount.toFixed(2)}`);
    this.notify();
    return closing;
  }

  public getBillingClosings(): BillingClosing[] {
    return [...this.closings];
  }

  // Fornecedores & Compras
  public getSuppliers(): Supplier[] {
    return [...this.suppliers];
  }

  public saveSupplier(sup: Omit<Supplier, 'id' | 'createdAt'> & { id?: string }): Supplier {
    if (sup.id) {
      const idx = this.suppliers.findIndex((s) => s.id === sup.id);
      if (idx !== -1) {
        this.suppliers[idx] = { ...this.suppliers[idx], ...sup };
        this.notify();
        return this.suppliers[idx];
      }
    }
    const newSup: Supplier = {
      ...sup,
      id: 'sup-' + Date.now(),
      createdAt: new Date().toISOString(),
    };
    this.suppliers.push(newSup);
    this.notify();
    return newSup;
  }

  public getPurchases(): Purchase[] {
    return [...this.purchases];
  }

  public createPurchase(purchaseData: {
    supplierId: string;
    purchaseDate: string;
    items: Purchase['items'];
    notes?: string;
  }): Purchase {
    const sup = this.suppliers.find((s) => s.id === purchaseData.supplierId);
    const totalAmount = purchaseData.items.reduce((acc, i) => acc + i.subtotal, 0);
    const user = authService.getCurrentUser();

    const purchase: Purchase = {
      id: 'pur-' + Date.now(),
      supplierId: purchaseData.supplierId,
      supplierName: sup ? sup.name : 'Fornecedor',
      purchaseDate: purchaseData.purchaseDate,
      items: purchaseData.items,
      totalAmount,
      notes: purchaseData.notes,
      createdByUser: user ? user.username : 'sistema',
      createdAt: new Date().toISOString(),
    };

    // Atualizar estoque e custo atual dos produtos
    for (const item of purchaseData.items) {
      const prod = this.products.find((p) => p.id === item.productId);
      if (prod) {
        this.registerInventoryAdjustment({
          productId: prod.id,
          quantity: item.quantity,
          movementType: 'compra',
          notes: `Compra de ${purchase.supplierName}`,
        });

        if (item.updateProductCurrentCost) {
          this.saveProduct({
            ...prod,
            currentCost: item.unitCost,
          });
        }
      }
    }

    this.purchases.unshift(purchase);
    this.logAudit('movimentacao_estoque', 'Purchase', purchase.id, `Compra registrada de ${purchase.supplierName}: R$ ${totalAmount.toFixed(2)}`);
    this.notify();
    return purchase;
  }

  // Despesas
  public getExpenses(): Expense[] {
    return [...this.expenses];
  }

  public createExpense(data: Omit<Expense, 'id' | 'createdAt' | 'createdByUser'>): Expense {
    const user = authService.getCurrentUser();
    const exp: Expense = {
      ...data,
      id: 'exp-' + Date.now(),
      createdByUser: user ? user.username : 'sistema',
      createdAt: new Date().toISOString(),
    };
    this.expenses.unshift(exp);
    this.logAudit('baixa_financeira', 'Expense', exp.id, `Despesa lançada: ${exp.description} - R$ ${exp.amount.toFixed(2)}`);
    this.notify();
    return exp;
  }
}

export const dbService = new DatabaseService();
