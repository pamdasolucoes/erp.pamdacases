import {authService} from './auth';
import {supabase} from './supabase';
import {PreparationStore} from './preparationStore';
import {PendingDraftSync,type DraftSyncState} from './pendingDraftSync';
import {PendingSalesService} from './pendingSales';
import {emptySalePreparation} from './salePreparation';
import {preparationFromSale} from './pendingSaleMapping';
import type {SaleDetails} from '../types/pendingSales';

export const pendingSalesService=new PendingSalesService(supabase);
const idle:DraftSyncState={status:'idle',message:''};
export class SaleWorkspace {
  readonly store:PreparationStore;
  private sync:PendingDraftSync|null=null;
  private key='';
  private enabled=false;
  private pendingNumberKey='';
  private numberRequest:Promise<void>|null=null;
  private listeners=new Set<()=>void>();
  private unsubscribeSync:(()=>void)|null=null;
  private unsubscribeStore:()=>void;
  constructor(readonly userId:string){
    let storage:Storage|null=null;try{storage=sessionStorage;}catch{}
    this.store=new PreparationStore(userId,import.meta.env.VITE_SUPABASE_URL||'unconfigured',storage);
    this.unsubscribeStore=this.store.subscribe(()=>{this.ensure();for(const listener of this.listeners)listener();});
    this.ensure();
  }
  allowed=()=>authService.getCurrentUser()?.id===this.userId&&!authService.getError();
  private ensure(){
    const key=this.store.getSnapshot().remote?.draftKey||'';
    if(key===this.key)return;
    this.sync?.dispose();this.unsubscribeSync?.();this.sync=null;this.key=key;
    if(key){
      this.sync=new PendingDraftSync(this.store,pendingSalesService,this.allowed);
      this.unsubscribeSync=this.sync.subscribe(()=>{for(const listener of this.listeners)listener();});
      if(this.enabled&&this.allowed())void this.sync.activate();
    }
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSyncState=()=>this.sync?.getSnapshot()||idle;
  activate=()=>{this.enabled=true;this.ensure();if(this.allowed())void this.sync?.activate();};
  begin=()=>{
    if(!this.allowed())return;
    const draft=this.store.getSnapshot();
    if(!draft.remote&&!draft.numberReservation){void this.ensureNumber().then(()=>this.begin()).catch(()=>{});return;}
    if(!draft.remote&&draft.customerId&&draft.branchId)this.store.update({...draft,remote:{draftKey:draft.numberReservation?.draftKey||crypto.randomUUID(),saleId:null,initialCustomerId:draft.customerId,initialBranchId:draft.branchId,savedFingerprint:null,status:'draft',orderNumber:draft.numberReservation?.orderNumber??null,firstProductAt:null}});
    this.activate();
  };
  async flush(){return this.sync?this.sync.flush():true;}
  private async discardIfNeverHadProducts(){
    const remote=this.store.getSnapshot().remote;
    if(!remote?.saleId)return false;
    const progress=await pendingSalesService.progress(this.userId,remote.saleId);
    this.store.update(current=>current.remote?.saleId===remote.saleId?
      {...current,remote:{...current.remote,...progress}}:current);
    // A legacy row without a number is reviewed manually by an administrator.
    if(progress.orderNumber===null||progress.firstProductAt!==null)return false;
    const discarded=await pendingSalesService.discardEmpty(this.userId,remote.saleId);
    if(!discarded)throw new Error('O servidor não descartou a venda vazia. A pendência foi preservada para nova consulta.');
    return true;
  }
  async leave(){
    if(!await this.flush())throw new Error('As alterações ainda não foram confirmadas. Tente salvar antes de sair.');
    await this.pause();
    try{
      if(await this.discardIfNeverHadProducts())this.store.update(emptySalePreparation(this.userId));
      else if(!this.store.getSnapshot().remote&&this.store.getSnapshot().numberReservation){
        await pendingSalesService.releaseNumber(this.userId,this.store.getSnapshot().numberReservation!.draftKey);
        this.store.update(emptySalePreparation(this.userId));
      }
    }
    catch(error){this.resume();throw error;}
  }
  async discardEmptyOnExit(){
    const draft=this.store.getSnapshot(),remote=draft.remote;
    if(!remote?.saleId||remote.orderNumber===null||remote.firstProductAt!==null||draft.pricing.items.length>0||this.getSyncState().status==='saving'||this.getSyncState().status==='error')return;
    try{
      const discarded=await pendingSalesService.discardEmpty(this.userId,remote.saleId);
      if(discarded)this.store.update(emptySalePreparation(this.userId));
    }catch(error){
      console.warn('Descarte de venda vazia durante o encerramento não confirmado; a pendência continua consultável no Supabase.',error);
    }
  }
  async retry(){await this.sync?.retry();}
  async revalidate(){await this.sync?.revalidate();}
  acceptClosed(details:SaleDetails){this.sync?.acceptClosed(details);}
  async pause(){await this.sync?.pause();}
  resume(){if(this.enabled&&this.allowed())this.sync?.resume();}
  async open(details:SaleDetails){
    if(!await this.flush())throw new Error('A preparação atual tem alterações não salvas. Volte à Nova Venda e salve antes de abrir outra pendência.');
    await this.pause();
    const reservation=this.store.getSnapshot().numberReservation;
    if(reservation&&reservation.draftKey!==details.sale.draft_key)await pendingSalesService.releaseNumber(this.userId,reservation.draftKey);
    this.store.update(preparationFromSale(this.userId,details));
    this.enabled=true;this.ensure();await this.sync?.activate();
  }
  async newDraft(){
    if(!await this.flush())throw new Error('Há alterações ainda não salvas. Tente salvar novamente antes de iniciar outra venda.');
    await this.pause();
    let discarded=false;
    try{discarded=await this.discardIfNeverHadProducts();}catch(error){this.resume();throw error;}
    const previousKey=this.store.getSnapshot().numberReservation?.draftKey??null;
    if(discarded)this.store.update(emptySalePreparation(this.userId));
    this.pendingNumberKey||=crypto.randomUUID();
    try{
      const orderNumber=await pendingSalesService.reserveNumber(this.userId,this.pendingNumberKey,previousKey);
      this.store.update({...emptySalePreparation(this.userId),numberReservation:{draftKey:this.pendingNumberKey,orderNumber}});
      this.pendingNumberKey='';
    }catch(error){this.resume();throw error;}
    return discarded;
  }
  async ensureNumber(){
    if(this.store.getSnapshot().remote||this.store.getSnapshot().numberReservation)return;
    if(this.numberRequest)return this.numberRequest;
    this.numberRequest=(async()=>{
      this.pendingNumberKey||=crypto.randomUUID();const key=this.pendingNumberKey;
      const orderNumber=await pendingSalesService.reserveNumber(this.userId,key);
      this.store.update(current=>current.remote||current.numberReservation?current:{...current,numberReservation:{draftKey:key,orderNumber}});
      this.pendingNumberKey='';
    })().finally(()=>{this.numberRequest=null;});
    return this.numberRequest;
  }
  acceptDiscarded(saleId:string){
    if(this.store.getSnapshot().remote?.saleId===saleId)this.store.update(emptySalePreparation(this.userId));
  }
  dispose(){this.unsubscribeStore();this.unsubscribeSync?.();this.sync?.dispose();this.listeners.clear();}
}
const workspaces=new Map<string,SaleWorkspace>();
export function saleWorkspace(userId:string){let workspace=workspaces.get(userId);if(!workspace){workspace=new SaleWorkspace(userId);workspaces.set(userId,workspace);}return workspace;}
export async function pauseSaleSync(userId:string,saleId:string){
  const workspace=workspaces.get(userId);if(workspace?.store.getSnapshot().remote?.saleId===saleId)await workspace.pause();
}
export function resumeSaleSync(userId:string,saleId:string){
  const workspace=workspaces.get(userId);if(workspace?.store.getSnapshot().remote?.saleId===saleId)workspace.resume();
}
const unsubscribeAuth=authService.subscribe((user,_loading,error)=>{
  for(const workspace of workspaces.values()){
    if(user?.id===workspace.userId&&!error)workspace.resume();else void workspace.pause();
  }
});
const beforeUnload=(event:BeforeUnloadEvent)=>{
  const userId=authService.getCurrentUser()?.id;const state=userId?workspaces.get(userId)?.getSyncState():null;
  if(state?.status==='saving'||state?.status==='error'){event.preventDefault();event.returnValue='';}
};
if(typeof window!=='undefined')window.addEventListener('beforeunload',beforeUnload);
if(import.meta.hot)import.meta.hot.dispose(()=>{unsubscribeAuth();window.removeEventListener('beforeunload',beforeUnload);for(const workspace of workspaces.values())workspace.dispose();});
