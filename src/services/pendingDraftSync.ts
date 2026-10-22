import type {SalePreparation} from '../types/salePreparation';
import {SerialSaveQueue} from './serialSaveQueue';
import type {PreparationStore} from './preparationStore';
import type {PendingSalesService} from './pendingSales';
import type {SaleDetails} from '../types/pendingSales';
import {pendingSaleArgs,pendingFingerprint,preparationFromSale} from './pendingSaleMapping';

export interface DraftSyncState {status:'idle'|'saving'|'saved'|'error'|'closed';message:string;}
export class PendingDraftSync {
  private state:DraftSyncState={status:'idle',message:''};
  private listeners=new Set<()=>void>();
  private initialized=false;
  private initializing:Promise<void>|null=null;
  private validation:Promise<void>|null=null;
  private suppress=false;
  private active=true;
  private disposed=false;
  private fingerprint='';
  private timer:ReturnType<typeof setTimeout>|null=null;
  private scheduled:SalePreparation|null=null;
  private queue:SerialSaveQueue<SalePreparation>;
  private unsubscribe:()=>void;
  constructor(private store:PreparationStore,private service:PendingSalesService,private allowed:()=>boolean){
    this.queue=new SerialSaveQueue(async draft=>{
      if(!this.allowed())throw new Error('Valide sua sessão para salvar as alterações.');
      const id=draft.remote?.saleId;if(!id)throw new Error('A venda ainda não foi iniciada.');
      const progress=await service.save(store.userId,pendingSaleArgs(draft,id));
      if(this.disposed)return;
      const savedFingerprint=pendingFingerprint(draft);
      store.update(current=>current.remote&&current.remote.draftKey===draft.remote?.draftKey?
        {...current,remote:{...current.remote,...progress,savedFingerprint}}:current);
    });
    this.queue.subscribe(value=>{
      if(this.disposed||this.state.status==='closed'||this.suppress)return;
      if(value.status==='error'){this.publish({status:'error',message:value.error instanceof Error?value.error.message:'Erro ao salvar.'});void this.revalidate();}
      else if(value.status==='saved'){
        try{if(pendingFingerprint(store.getSnapshot())===store.getSnapshot().remote?.savedFingerprint)this.publish({status:'saved',message:''});}catch{}
      }
    });
    this.unsubscribe=store.subscribe(()=>{if(!this.suppress)void this.changed();});
  }
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(state:DraftSyncState){this.state=state;for(const listener of this.listeners)listener();}
  begin(){
    const draft=this.store.getSnapshot();
    if(!draft.remote&&draft.customerId&&draft.branchId){
      this.store.update({...draft,remote:{draftKey:draft.numberReservation?.draftKey||crypto.randomUUID(),saleId:null,initialCustomerId:draft.customerId,initialBranchId:draft.branchId,savedFingerprint:null,status:'draft',orderNumber:draft.numberReservation?.orderNumber??null,firstProductAt:null}});
    }
    void this.changed();
  }
  async activate(){if(this.state.status==='closed')return;this.active=true;this.queue.resume();await this.changed();}
  private async initialize(){
    const initial=this.store.getSnapshot();if(!initial.remote)return;
    if(!this.allowed())throw new Error('Valide sua sessão para iniciar ou recuperar a venda.');
    const remote=initial.remote;
    const id=remote.saleId||await this.service.start(this.store.userId,remote.initialCustomerId,remote.initialBranchId,remote.draftKey);
    if(this.disposed)return;
    // Persist the returned UUID before issuing any save, including while the view is unmounted.
    this.store.update(current=>current.remote?.draftKey===remote.draftKey&&current.remote.saleId!==id?{...current,remote:{...current.remote,saleId:id}}:current);
    const details=await this.service.details(this.store.userId,id);
    if(this.disposed)return;
    const current=this.store.getSnapshot();if(current.remote?.draftKey!==remote.draftKey)return;
    const progress={orderNumber:details.sale.order_number,firstProductAt:details.sale.first_product_at};
    this.suppress=true;
    this.store.update(value=>value.remote?.draftKey===remote.draftKey?{...value,remote:{...value.remote,...progress}}:value);
    this.suppress=false;
    let clean=false;try{clean=!!remote.savedFingerprint&&pendingFingerprint(current)===remote.savedFingerprint;}catch{}
    this.suppress=true;
    if(remote.saleId&&clean||details.sale.status!=='draft')this.store.update(preparationFromSale(this.store.userId,details));
    else this.store.update(value=>{
      const sameCustomer=value.customerId===details.sale.customer_id;
      return {...value,paymentMethodId:value.paymentMethodId??details.sale.payment_method_id,paymentTermId:value.paymentTermId??details.sale.payment_term_id,
        pricing:sameCustomer&&value.branchId===details.sale.branch_id&&!value.commercialDefaultsPending&&!value.pricing.manualFreight&&!value.pricing.freight&&details.sale.shipping_confirmed&&details.sale.shipping_charged!==null?
          {...value.pricing,freight:String(details.sale.shipping_charged).replace('.',','),manualFreight:false}:value.pricing,
        remote:{...value.remote!,status:details.sale.status,sellerName:details.sale.seller_snapshot,...progress}};
    });
    this.suppress=false;this.initialized=true;
    if(details.sale.status!=='draft')this.publish({status:'closed',message:details.sale.status==='cancelled'?'Esta venda foi cancelada. A edição está bloqueada.':'Esta venda está confirmada. A edição está bloqueada.'});
  }
  private async changed(){
    const draft=this.store.getSnapshot();if(this.disposed||!this.active||!draft.remote||this.suppress)return;
    if(this.state.status==='closed')return;
    if(draft.commercialDefaultsPending){this.clearScheduled();this.fingerprint='';this.publish({status:'saving',message:'Consultando condições comerciais…'});return;}
    if(!this.initialized){
      if(!this.initializing){
        this.publish({status:'saving',message:''});
        this.initializing=this.initialize().catch(error=>{this.publish({status:'error',message:error instanceof Error?error.message:'Erro ao iniciar a venda.'});}).finally(()=>{this.initializing=null;});
      }
      await this.initializing;if(!this.initialized||this.getSnapshot().status==='closed')return;
    }
    if(this.disposed||!this.active||!this.allowed())return;
    try{
      const current=this.store.getSnapshot();const fingerprint=pendingFingerprint(current);
      const queueStatus=this.queue.getState().status;
      if(fingerprint===current.remote?.savedFingerprint&&(queueStatus==='idle'||queueStatus==='saved')){
        this.clearScheduled();this.fingerprint=fingerprint;this.publish({status:'saved',message:''});return;
      }
      if(fingerprint===this.fingerprint)return;
      this.fingerprint=fingerprint;this.publish({status:'saving',message:''});
      this.scheduled=structuredClone(current);if(this.timer)clearTimeout(this.timer);
      this.timer=setTimeout(()=>{this.timer=null;this.sendScheduled();},250);
    }catch(error){this.clearScheduled();this.fingerprint='';this.publish({status:'error',message:error instanceof Error?error.message:'Corrija os dados para salvar.'});}
  }
  private clearScheduled(){if(this.timer)clearTimeout(this.timer);this.timer=null;this.scheduled=null;}
  private sendScheduled(){
    const draft=this.scheduled;this.clearScheduled();
    if(draft&&this.active&&this.allowed()&&this.state.status!=='closed')this.queue.enqueue(draft);else if(draft)this.fingerprint='';
  }
  async retry(){this.fingerprint='';await this.changed();try{pendingFingerprint(this.store.getSnapshot());}catch{return;}this.sendScheduled();if(this.initialized&&this.state.status!=='closed')await this.queue.retry();}
  async flush(){await this.changed();if(this.store.getSnapshot().commercialDefaultsPending)return false;if(this.getSnapshot().status==='closed')return true;if(this.getSnapshot().status==='error')return false;this.sendScheduled();return this.initialized&&await this.queue.flush();}
  async pause(){this.active=false;this.clearScheduled();this.fingerprint='';await this.initializing;await this.queue.pause();}
  resume(){if(this.state.status==='closed')return;this.active=true;this.queue.resume();void this.changed();}
  acceptClosed(details:SaleDetails){
    if(this.disposed||details.sale.id!==this.store.getSnapshot().remote?.saleId||details.sale.status==='draft')return;
    this.publish({status:'closed',message:details.sale.status==='cancelled'?'Esta venda foi cancelada. A edição está bloqueada.':'Esta venda está confirmada. A edição está bloqueada.'});
    this.clearScheduled();void this.queue.pause();this.suppress=true;this.store.update(preparationFromSale(this.store.userId,details));this.suppress=false;
  }
  async revalidate(){
    if(this.validation)return this.validation;
    const id=this.store.getSnapshot().remote?.saleId;if(!id||!this.allowed()||!this.initialized)return;
    this.validation=this.service.details(this.store.userId,id).then(details=>{
      if(this.disposed)return;
      this.acceptClosed(details);
    }).catch(()=>{/* A read failure does not invent a closed status. Writes still require server authorization. */}).finally(()=>{this.validation=null;});
    return this.validation;
  }
  dispose(){this.disposed=true;this.unsubscribe();void this.pause();this.listeners.clear();}
}
