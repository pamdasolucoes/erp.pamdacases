import type { KitComponentRow, ProductRow } from '../../src/types/productCatalog';
import { uuid } from './customerRows';
export const productId = (index: number) => uuid(100000 + index);
export const serviceId = (index: number) => uuid(101000 + index);
export const kitId = (index: number) => uuid(102000 + index);
export function officialProduct(id: string, overrides: Partial<ProductRow> = {}): ProductRow {
  return { id,code:'201',sku:`SKU-${id}`,name:'Produto oficial sintético',description:null,category:'Capas',brand:'Pamda',
    model_phone:null,type:'fisico',current_cost:2.5,managerial_cost:null,sale_price:10,controls_inventory:true,
    current_inventory:0,min_inventory:0,max_inventory:null,stock_verified:false,image_url:null,source_tab:'fixture',
    active:true,b2b_site_visible:false,notes:null,created_at:'2026-10-16T10:00:00Z',updated_at:'2026-10-16T10:00:00Z',...overrides };
}
// Somente dados sinteticos de teste. Nao e importacao nem copia da base comercial.
export function officialCatalogFixture() {
  const physical = Array.from({length:316},(_,index)=>officialProduct(productId(index+1),{ code:String(201+index),sku:`SKU-CAPA-${201+index}`,name:index===0 ? 'Capa TPU transparente' : `Capa física ${index+1}` }));
  physical[1].current_cost=null; physical[1].managerial_cost=0;
  physical[2].sale_price=null;
  physical[0].image_url='https://images.pamda-test.invalid/capa.png';
  const services = Array.from({length:4},(_,index)=>officialProduct(serviceId(index+1),{code:String(index+1),sku:`SKU-SERVICO-${index+1}`,name:`Serviço de impressão ${index+1}`,type:'servico',current_cost:1.8,sale_price:index===0 ? 20 : 35,controls_inventory:false}));
  const kits = Array.from({length:317},(_,index)=>officialProduct(kitId(index+1),{code:String(index<316 ? 20201+index : 40201),sku:`SKU-KIT-${index+1}`,name:index===0 ? 'Capa TPU personalizada' : `Kit personalizado ${index+1}`,type:'kit',current_cost:4.3,managerial_cost:5,sale_price:25,controls_inventory:false}));
  for (let index=0;index<3;index++) { const model=['iPhone 11','iPhone 11 Pro','iPhone 11 Pro Max'][index]; physical[index].model_phone=model; kits[index].model_phone=model; kits[index].sku+=`-IPH11${index}`; }
  kits[3].model_phone='Samsung A10'; kits[3].sku+='-SAMA10';
  kits[4].model_phone='Moto G35'; kits[4].sku+='-MOTG35';
  kits[5].model_phone='Redmi Note 13';
  const components: KitComponentRow[] = kits.flatMap((kit,index)=>[
    {id:uuid(103000+index*2),kit_product_id:kit.id,component_product_id:physical[index%316].id,quantity:1,sort_order:0,created_at:kit.created_at},
    {id:uuid(103001+index*2),kit_product_id:kit.id,component_product_id:services[index%4].id,quantity:1,sort_order:1,created_at:kit.created_at},
  ]);
  return {products:[...physical,...services,...kits],components};
}
