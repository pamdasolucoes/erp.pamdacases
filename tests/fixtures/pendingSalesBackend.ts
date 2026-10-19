import type {SupabaseClient} from '@supabase/supabase-js';
import {MockSales} from '../browser/support/mockSales';
import {customerRow,branchRow,uuid} from './customerRows';
import {officialCatalogFixture} from './officialProducts';
import {PendingSalesService} from '../../src/services/pendingSales';

export function pendingBackend(role='admin_gerencial'){
  const user={id:uuid(9000),active:true,role};const fixture=officialCatalogFixture();
  const backend=new MockSales(()=>user,[customerRow(1),customerRow(2)],[branchRow(1),branchRow(2)],fixture.products);
  let invalidSaveReturn=false;
  const client={
    auth:{getUser:async()=>({data:{user:user.active?{id:user.id}:null},error:null})},
    async getOpenApiSpec(){throw new Error('OpenAPI não faz parte do contrato de permissões');},
    async rpc(name:string,args:unknown){const result=await backend.handle('/rest/v1/rpc/'+name,new URL('https://synthetic.invalid/'),args);if(result?.abort)return {data:null,error:{code:'',message:'Failed to fetch'}};if((result?.status||200)>=400)return {data:null,error:result!.body};return {data:invalidSaveReturn&&name==='pamda_salvar_rascunho_venda'?uuid(999999):result!.body,error:null};},
    from(table:string){
      const url=new URL('https://synthetic.invalid/rest/v1/'+table);
      const query={
        select(){return query;},eq(key:string,value:string){url.searchParams.set(key,'eq.'+value);return query;},
        in(key:string,values:string[]){url.searchParams.set(key,'in.('+values.join(',')+')');return query;},
        order(){return query;},range(from:number,to:number){url.searchParams.set('offset',String(from));url.searchParams.set('limit',String(to-from+1));return query;},
        returns(){return query;},
        async maybeSingle(){const result=await backend.handle(url.pathname,url,null);return {data:(result?.body as unknown[])?.[0]||null,error:null};},
        then(resolve:(value:unknown)=>void){
          if(table==='erp_user_profiles')return Promise.resolve(resolve({data:[{user_id:user.id,username:'Funcionário sintético'}],error:null}));
          return backend.handle(url.pathname,url,null).then(result=>resolve({data:result?.body,error:null,count:Number(result?.headers?.['content-range'].split('/')[1])}));
        },
      };return query;
    },
  } as unknown as SupabaseClient;
  return {user,backend,client,service:new PendingSalesService(client),fixture,setInvalidSaveReturn:(value:boolean)=>{invalidSaveReturn=value;}};
}
