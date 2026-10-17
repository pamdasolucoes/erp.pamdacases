export type OfficialSaleStatus = 'draft' | 'confirmed' | 'cancelled';
export type DbNumeric = number | string;
export interface PendingSaleRow {
  id:string; customer_id:string; branch_id:string; created_by:string;
  created_at:string; updated_at:string; customer_snapshot:Record<string,unknown>;
  branch_snapshot:Record<string,unknown>; seller_snapshot:string;
  subtotal:DbNumeric; discount_amount:DbNumeric; shipping_charged:DbNumeric|null;
  shipping_confirmed:boolean; total:DbNumeric; notes:string|null;
}
export interface OfficialSaleRow extends PendingSaleRow {
  status:OfficialSaleStatus; confirmed_at:string|null; payment_method_id:string|null;
  payment_term_id:string|null; discount_reason:string|null; shipping_actual_cost:DbNumeric|null;
  draft_key:string|null; cancelled_at:string|null; cancelled_by:string|null; cancellation_reason:string|null;
}
export interface OfficialSaleItemRow {
  id:string; sale_id:string; product_id:string; product_code_snapshot:string;
  product_sku_snapshot:string; description_snapshot:string; quantity:DbNumeric;
  negotiated_unit_price:DbNumeric; line_subtotal:DbNumeric;
  customization:Record<string,unknown>|null; created_at:string;
}
export interface OfficialSaleEventRow {
  id:string; sale_id:string; actor_user_id:string; event_type:string;
  details:Record<string,unknown>; occurred_at:string;
}
export interface SaleDetails {sale:OfficialSaleRow;items:OfficialSaleItemRow[];events:OfficialSaleEventRow[];actors:Record<string,string>;}
export interface SavePendingSaleArgs {
  p_cliente_id:string; p_filial_id:string;
  p_itens:{product_id:string;quantity:number;unit_price:number;customization:Record<string,unknown>}[];
  p_frete:number|null; p_desconto:number; p_motivo:string|null; p_observacoes:string|null;
  p_venda_id:string; p_forma_id:string|null; p_prazo_id:string|null;
}
