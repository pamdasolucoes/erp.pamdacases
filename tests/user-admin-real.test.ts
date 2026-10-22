import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUserAdminHandler} from '../supabase/functions/pamda-user-admin/handler';
function fixture(){
 const calls={creates:[] as any[],deletes:[] as string[],profiles:[] as any[]};let allowed=true,profileFails=false;
 const user={auth:{async getUser(){return {data:{user:{id:'admin-id'}},error:null};}},async rpc(name:string,args:any){if(name==='pamda_is_admin')return {data:allowed,error:null};calls.profiles.push(args);return {error:profileFails?new Error('profile'):null};}};
 const admin={auth:{admin:{async createUser(input:any){calls.creates.push(input);return {data:{user:{id:'new-id'}},error:null};},async deleteUser(id:string){calls.deletes.push(id);return {error:null};}}}};
 const handler=createUserAdminHandler({url:'https://synthetic.invalid',key:'public',secret:'private',createClient:(_url,key)=>key==='public'?user:admin});
 const request=(body:any,token=true)=>handler(new Request('https://synthetic.invalid',{method:'POST',headers:{...(token?{authorization:'Bearer synthetic'}:{}),'content-type':'application/json'},body:JSON.stringify(body)}));
 return {request,calls,deny:()=>{allowed=false;},failProfile:()=>{profileFails=true;}};
}
const input={action:'create',email:'employee@example.invalid',name:'Funcionário',role:'producao',password:'temporary-valid-password'};
test('cadastro real exige sessão e autorização atual do banco, sem aceitar metadata do pedido',async()=>{
 const f=fixture();assert.equal((await f.request(input,false)).status,401);f.deny();assert.equal((await f.request({...input,role:'admin_gerencial',app_metadata:{role:'admin'}})).status,403);assert.equal(f.calls.creates.length,0);
});
test('cadastro valida senha e cria Auth no servidor, sem devolver credencial',async()=>{
 const f=fixture();assert.equal((await f.request({...input,password:'short'})).status,400);const r=await f.request(input);assert.equal(r.status,201);assert.deepEqual(await r.json(),{user_id:'new-id'});assert.equal(f.calls.creates[0].email_confirm,true);assert.equal(f.calls.profiles[0].p_role,'producao');
});
test('falha de perfil desfaz somente a identidade recém criada',async()=>{
 const f=fixture();f.failProfile();assert.equal((await f.request(input)).status,409);assert.deepEqual(f.calls.deletes,['new-id']);
});
