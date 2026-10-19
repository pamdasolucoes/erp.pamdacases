import type {ReceiptDocumentData} from '../types/receipt';
import type {SaleDetails} from '../types/pendingSales';
import type {TestReceiptRecord} from '../types/testSales';
import {dbCents} from './pendingSaleMapping';

const text=(source:Record<string,unknown>,...keys:string[])=>{
  for(const key of keys){const value=source[key];if(typeof value==='string'&&value.trim())return value.trim();}
  return '';
};

export function testReceiptDocument(details:SaleDetails,receipt:TestReceiptRecord):ReceiptDocumentData{
  const {sale,items}=details;
  if(sale.status!=='confirmed'||sale.is_test!==true||sale.order_number===null||
    receipt.saleId!==sale.id||receipt.receiptNumber!==sale.order_number)
    throw new Error('O recibo não corresponde a uma venda de teste confirmada.');
  const customer=sale.customer_snapshot,branch=sale.branch_snapshot;
  const address=[
    [text(branch,'address'),text(branch,'number'),text(branch,'complement')].filter(Boolean).join(', '),
    [text(branch,'neighborhood'),[text(branch,'city'),text(branch,'state')].filter(Boolean).join('/')].filter(Boolean).join(' - '),
  ].filter(Boolean).join('\n')||null;
  const phone=text(branch,'phone','mobile_phone')||text(customer,'phone','mobile_phone');
  const zip=text(branch,'zipCode','zip_code');
  const contact=[zip?`CEP ${zip}`:null,phone?`Contato: ${phone}`:null].filter(Boolean).join(' | ')||null;
  const freight=sale.shipping_charged===null?null:dbCents(sale.shipping_charged);
  if(!sale.shipping_confirmed||freight===null)throw new Error('O frete do recibo não está confirmado.');
  return {
    kind:'test_confirmed',receiptNumber:String(receipt.receiptNumber),generatedAt:receipt.issuedAt,
    company:{name:'PAMDA CASES',cnpj:null,phone:null},
    customerName:text(customer,'name')||'Cliente não informado',
    customerCode:text(customer,'code','customer_code')||null,customerContact:contact,
    branchName:null,address,addressNeedsReview:false,salespersonName:sale.seller_snapshot,
    condition:'Documento de homologação',items:items.map(item=>{
      const quantity=Number(item.quantity),unitPriceCents=dbCents(item.negotiated_unit_price);
      const subtotalCents=dbCents(item.line_subtotal);
      return {id:item.id,code:item.product_code_snapshot,sku:null,name:item.description_snapshot,description:null,
        quantity,unitPriceCents,subtotalCents,discountCents:0,netCents:subtotalCents,
        customization:{
          model:text(item.customization||{},'model'),color:text(item.customization||{},'color'),
          walletFaces:item.customization?.walletFaces==='1'||item.customization?.walletFaces==='2'?item.customization.walletFaces:'',
        }};
    }),
    subtotalCents:dbCents(sale.subtotal),discountCents:dbCents(sale.discount_amount),
    freightCents:freight,totalCents:dbCents(sale.total),notes:sale.notes||'',freightReason:'',
    payment:null,
  };
}
