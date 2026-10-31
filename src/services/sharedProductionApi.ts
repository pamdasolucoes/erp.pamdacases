import type {ProductionApi} from '../components/SharedProductionQueue';
import {supabase} from './supabase';
import {coreService} from './coreService';
import {authService} from './auth';
import {productCatalog} from './catalogResources';
const userId=()=>{const user=authService.getCurrentUser();if(!user)throw new Error('Entre novamente.');return user.id;};
export const sharedProductionApi:ProductionApi={
 subscribe(refresh){const channel=supabase!.channel('shared-production-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'erp_production_tasks'},refresh).subscribe();return()=>{void supabase!.removeChannel(channel);};},
 async read(){return await coreService.rpc(userId(),'pamda_shared_production_read') as any;},
 async act(task,action,reason,key){const result=await coreService.rpc(userId(),'pamda_shared_production_action',{p_task:task.id,p_action:action,p_reason:reason,p_request_key:key,p_expected_updated_at:task.updated_at},true);if(['separated','cancel'].includes(action))productCatalog.invalidate();return result;},
 async image(path){const {data,error}=await supabase!.storage.from('erp-messenger').createSignedUrl(path,3600);if(error)throw error;return data.signedUrl;}
};
