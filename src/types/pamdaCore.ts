// Referencia: 03_PAMDA_CRIAR_CADASTRO_OFICIAL_384_CLIENTES.sql fornecida pelo administrador.
// Tipos separados dos clientes de demonstracao em erp.ts.
import type { CustomerFreightSetting } from './freight';
export interface CustomerRow {
  id: string; customer_code: string; name: string; company_name: string | null;
  cnpj: string | null; cpf: string | null; cpf_cnpj_original: string | null;
  state_registration: string | null; legacy_person_type: string | null;
  phone: string; mobile_phone: string | null; whatsapp_phone: string | null;
  email: string | null; contact_name: string; reference_name: string | null; reference_phone: string | null;
  legacy_registered_on: string | null; legacy_last_purchase_on: string | null;
  legacy_registered_raw: string | null; legacy_last_purchase_raw: string | null;
  notes: string | null; active: boolean; is_chain: boolean; customer_kind: string;
  billing_mode: string | null; created_at: string; updated_at: string;
  default_shipping_fee?: number | string | null;
}

export interface CustomerBranchRow {
  id: string; customer_id: string; name: string; trade_name: string | null;
  address: string; number: string | null; complement: string | null; neighborhood: string;
  city: string; state: string; zip_code: string; phone: string; contact_name: string;
  notes: string | null; active: boolean; address_needs_review: boolean;
  import_source_customer_code: string | null; created_at: string; updated_at: string;
  is_primary?: boolean; // Always requested from the official schema; optional for old fixtures.
  shipping_fee_override?: number | string | null;
}

export interface OfficialCustomerBranch {
  readonly id: string; readonly customerId: string; readonly name: string; readonly tradeName: string | null;
  readonly address: string; readonly number: string | null; readonly complement: string | null;
  readonly neighborhood: string; readonly city: string; readonly state: string; readonly zipCode: string;
  readonly phone: string; readonly contactName: string; readonly notes: string | null;
  readonly active: boolean; readonly addressNeedsReview: boolean; readonly importSourceCustomerCode: string | null;
  readonly createdAt: string; readonly updatedAt: string;
  readonly isPrimary?: boolean | null;
  readonly shippingFeeOverrideCents?: number | null;
}

export interface OfficialCustomer {
  readonly id: string; readonly customerCode: string; readonly name: string; readonly companyName: string | null;
  readonly cnpj: string | null; readonly cpf: string | null; readonly cpfCnpjOriginal: string | null;
  readonly stateRegistration: string | null; readonly legacyPersonType: string | null;
  readonly phone: string; readonly mobilePhone: string | null; readonly whatsappPhone: string | null;
  readonly email: string | null; readonly contactName: string; readonly referenceName: string | null; readonly referencePhone: string | null;
  readonly legacyRegisteredOn: string | null; readonly legacyLastPurchaseOn: string | null;
  readonly legacyRegisteredRaw: string | null; readonly legacyLastPurchaseRaw: string | null;
  readonly notes: string | null; readonly active: boolean; readonly isChain: boolean;
  readonly customerKind: string; readonly billingMode: string | null;
  readonly paymentPolicy: null; // Politicas ainda nao verificadas; nenhum limite ou prazo atribuido.
  readonly defaultFreight: CustomerFreightSetting;
  readonly branches: readonly OfficialCustomerBranch[];
  readonly createdAt: string; readonly updatedAt: string;
}

export interface CustomerContext {
  readonly id: string;
  readonly customerCode: string;
}

type Editable<T> = { -readonly [Key in keyof T]?: T[Key] };
export type CustomerChanges = Editable<Pick<OfficialCustomer,
  'name' | 'companyName' | 'cnpj' | 'cpf' | 'phone' | 'whatsappPhone' |
  'email' | 'contactName' | 'notes' | 'active'>>;
export type BranchChanges = Editable<Pick<OfficialCustomerBranch,
  'name' | 'tradeName' | 'address' | 'number' | 'complement' | 'neighborhood' |
  'city' | 'state' | 'zipCode' | 'phone' | 'contactName' | 'notes' | 'active' | 'addressNeedsReview'>>;
export interface CustomerUpdate {
  readonly id: string;
  readonly expectedCustomerCode?: string; // Local response check; never sent as an editable field.
  readonly expectedUpdatedAt: string;
  readonly changes: CustomerChanges;
  readonly branches: readonly {
    id: string;
    expectedUpdatedAt: string;
    changes: BranchChanges;
    confirmAddressReviewed: boolean;
  }[];
}
