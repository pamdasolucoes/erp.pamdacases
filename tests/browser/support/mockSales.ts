import type {CustomerRow,CustomerBranchRow} from '../../../src/types/pamdaCore';
import type {ProductRow} from '../../../src/types/productCatalog';
import type {OfficialSaleRow,OfficialSaleItemRow,OfficialSaleEventRow} from '../../../src/types/pendingSales';
import {uuid} from '../../fixtures/customerRows';

export class MockSales {
  sales:OfficialSaleRow[]=[];items:OfficialSaleItemRow[]=[];events:OfficialSaleEventRow[]=[];
  writes:{name:string;body:any}[]=[];
  permissions:Record<string,boolean>={};startDelay=0;saveDelay=0;failStartAfterCommit=false;failSave=false;
  concurrent=0;maxConcurrent=0;inventoryWrites=0;financialWrites=0;
  private sequence=300000;
  private nextOrderNumber=10000;
  private availableOrderNumbers:number[]=[];
  constructor(private identity:()=>{id:string;active:boolean;role:string},private customers:CustomerRow[],private branches:CustomerBranchRow[],private products:ProductRow[]){}
  private allowed(code:string){const user=this.identity();return user.active&&(code in this.permissions?this.permissions[code]:user.role==='admin_gerencial'||user.role==='venda_atendimento'&&['sales.read','sales.draft'].includes(code));}
  private readAllowed(row:OfficialSaleRow){const user=this.identity();return this.allowed('sales.read')&&(row.created_by===user.id||user.role==='admin_gerencial');}
  private id(){return uuid(++this.sequence);}
  private event(saleId:string,type:string,details:Record<string,unknown>={}){this.events.push({id:this.id(),sale_id:saleId,actor_user_id:this.identity().id,event_type:type,details,occurred_at:new Date().toISOString()});}
  private error(message:string,code='P0001',status=400){return {body:{code,message},status};}
  async handle(path:string,url:URL,body:any):Promise<{body?:unknown;status?:number;headers?:Record<string,string>;abort?:boolean}|null>{
    if(path==='/rest/v1/')return {body:{paths:{'/rpc/pamda_has_permission':{post:{parameters:[{in:'body',schema:{type:'object',properties:{permission_code:{type:'string'}}}}]}}}}};
    const name=path.split('/').pop()!;
    if(name==='pamda_has_permission'){
      if(Object.keys(body).join(',')!=='p_permission')return this.error('Wrong permission argument');
      return {body:this.allowed(body.p_permission)};
    }
    if(['erp_pending_sales','erp_sales','erp_sale_items','erp_sale_events'].includes(name)){
      let rows:any[]=name==='erp_pending_sales'?this.sales.filter(row=>row.status==='draft'&&this.readAllowed(row)):name==='erp_sales'?this.sales.filter(row=>this.readAllowed(row)):name==='erp_sale_items'?this.items.filter(item=>this.sales.some(s=>s.id===item.sale_id&&this.readAllowed(s))):this.events.filter(event=>this.sales.some(s=>s.id===event.sale_id&&this.readAllowed(s)));
      for(const key of ['id','customer_id','sale_id']){const filter=url.searchParams.get(key);if(filter?.startsWith('eq.'))rows=rows.filter(row=>row[key]===filter.slice(3));}
      const status=url.searchParams.get('status');if(status?.startsWith('in.'))rows=rows.filter(row=>status.includes(row.status));
      rows=[...rows].sort((a,b)=>a.id.localeCompare(b.id));const count=rows.length;
      const from=Number(url.searchParams.get('offset')||0);const limit=Math.min(37,Number(url.searchParams.get('limit')||100));
      return {body:rows.slice(from,from+limit),headers:{'content-range':`${from}-${Math.min(count,from+limit)-1}/${count}`}};
    }
    if(!['pamda_iniciar_venda','pamda_salvar_rascunho_venda','pamda_cancelar_venda','pamda_descartar_venda_vazia'].includes(name))return null;
    this.writes.push({name,body:structuredClone(body)});
    if(name==='pamda_iniciar_venda'){
      if(!this.allowed('sales.draft'))return this.error('Sem permissão','42501',403);
      if(this.startDelay)await new Promise(resolve=>setTimeout(resolve,this.startDelay));
      const user=this.identity();const customer=this.customers.find(c=>c.id===body.p_cliente_id&&c.active),branch=this.branches.find(b=>b.id===body.p_filial_id&&b.customer_id===customer?.id&&b.active);
      if(!customer||!branch)return this.error('Cliente e unidade inválidos');
      const existing=this.sales.find(s=>s.created_by===user.id&&s.draft_key===body.p_draft_key);
      if(existing){if(existing.customer_id!==customer.id||existing.branch_id!==branch.id||existing.status!=='draft')return this.error('Chave de início incompatível');return {body:existing.id};}
      const row:OfficialSaleRow={id:this.id(),order_number:this.availableOrderNumbers.shift()??this.nextOrderNumber++,first_product_at:null,customer_id:customer.id,branch_id:branch.id,created_by:user.id,status:'draft',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),confirmed_at:null,payment_method_id:null,payment_term_id:null,customer_snapshot:{...structuredClone(customer),code:customer.customer_code} as any,branch_snapshot:structuredClone(branch) as any,seller_snapshot:'Teste isolado',notes:null,discount_reason:null,subtotal:0,discount_amount:0,shipping_charged:0,shipping_actual_cost:null,total:0,draft_key:body.p_draft_key,shipping_confirmed:false,cancelled_at:null,cancelled_by:null,cancellation_reason:null};
      this.sales.push(row);this.event(row.id,'sale_started');
      if(this.failStartAfterCommit){this.failStartAfterCommit=false;return {abort:true};}return {body:row.id};
    }
    if(name==='pamda_descartar_venda_vazia'){
      if(!this.allowed('sales.draft'))return this.error('Sem permissão','42501',403);
      const row=this.sales.find(s=>s.id===body.p_venda_id);
      if(!row||row.status!=='draft'||row.first_product_at!==null||row.created_by!==this.identity().id&&this.identity().role!=='admin_gerencial')return {body:false};
      this.sales=this.sales.filter(sale=>sale.id!==row.id);
      if(row.order_number!==null)this.availableOrderNumbers.push(row.order_number);this.availableOrderNumbers.sort((a,b)=>a-b);
      this.items=this.items.filter(item=>item.sale_id!==row.id);this.events=this.events.filter(event=>event.sale_id!==row.id);
      return {body:true};
    }
    if(name==='pamda_salvar_rascunho_venda'){
      this.concurrent++;this.maxConcurrent=Math.max(this.maxConcurrent,this.concurrent);
      try{
        if(this.saveDelay)await new Promise(resolve=>setTimeout(resolve,this.saveDelay));
        if(this.failSave)return {abort:true};
        if(!this.allowed('sales.draft'))return this.error('Sem permissão','42501',403);
        const row=this.sales.find(s=>s.id===body.p_venda_id);
        if(!row)return this.error('Venda existente obrigatória');
        if(row.status!=='draft')return this.error('Somente vendas pendentes podem ser editadas');
        if(row.created_by!==this.identity().id&&this.identity().role!=='admin_gerencial')return this.error('Outro responsável','42501',403);
        const customer=this.customers.find(c=>c.id===body.p_cliente_id&&c.active),branch=this.branches.find(b=>b.id===body.p_filial_id&&b.customer_id===customer?.id&&b.active);
        if(!customer||!branch)return this.error('Cliente e unidade inválidos');
        if(!Array.isArray(body.p_itens)||body.p_itens.length>200)return this.error('Itens inválidos');
        let subtotal=0;
        for(const item of body.p_itens){
          const product=this.products.find(p=>p.id===item.product_id&&p.active);
          if(!product||!Number.isFinite(item.quantity)||item.quantity<=0||!Number.isFinite(item.unit_price)||item.unit_price<0)return this.error('Item inválido');
          if(item.unit_price!==Number(product.sale_price)&&!this.allowed('sales.discount'))return this.error('Negociação sem permissão','42501',403);
          subtotal+=Math.round(item.unit_price*100)*item.quantity;
        }
        const discount=Math.round(body.p_desconto*100);
        if(discount>0&&(!this.allowed('sales.discount')||!body.p_motivo?.trim()))return this.error('Desconto exige permissão e motivo','42501',403);
        if(discount<0||discount>subtotal)return this.error('Desconto inválido');
        if(body.p_frete!==null&&body.p_frete!==0&&!this.allowed('sales.shipping.override'))return this.error('Frete sem permissão','42501',403);
        Object.assign(row,{customer_id:customer.id,branch_id:branch.id,customer_snapshot:{...structuredClone(customer),code:customer.customer_code},branch_snapshot:structuredClone(branch),subtotal:subtotal/100,discount_amount:discount/100,discount_reason:body.p_motivo,shipping_charged:body.p_frete??0,shipping_confirmed:body.p_frete!==null,total:(subtotal-discount)/100+(body.p_frete??0),notes:body.p_observacoes,payment_method_id:body.p_forma_id,payment_term_id:body.p_prazo_id,updated_at:new Date().toISOString()});
        if(body.p_itens.length>0&&row.first_product_at===null)row.first_product_at=new Date().toISOString();
        this.items=this.items.filter(item=>item.sale_id!==row.id);
        for(const item of body.p_itens){const product=this.products.find(p=>p.id===item.product_id)!;this.items.push({id:this.id(),sale_id:row.id,product_id:product.id,product_code_snapshot:product.code,product_sku_snapshot:product.sku,description_snapshot:product.name,quantity:item.quantity,negotiated_unit_price:item.unit_price,line_subtotal:Math.round(item.quantity*item.unit_price*100)/100,customization:structuredClone(item.customization),created_at:new Date().toISOString()});}
        this.event(row.id,'draft_saved');return {body:row.id};
      }finally{this.concurrent--;}
    }
    if(!this.allowed('sales.cancel'))return this.error('Cancelamento sem permissão','42501',403);
    const row=this.sales.find(s=>s.id===body.p_venda_id);
    if(!row||row.status!=='draft')return this.error('Somente pendências podem ser canceladas');
    if(row.first_product_at===null)return this.error('Somente pendências que já tiveram produtos podem ser canceladas');
    if(!body.p_motivo?.trim())return this.error('Motivo obrigatório');
    Object.assign(row,{status:'cancelled',cancelled_at:new Date().toISOString(),cancelled_by:this.identity().id,cancellation_reason:body.p_motivo.trim(),updated_at:new Date().toISOString()});
    this.event(row.id,'sale_cancelled',{reason:row.cancellation_reason});return {body:null};
  }
}
