import type { SalePreparation } from '../types/salePreparation';
import {emptySalePreparation,parseSalePreparation,salePreparationKey,serializeSalePreparation} from './salePreparation';

export class PreparationStore {
  private value:SalePreparation;
  private listeners=new Set<()=>void>();
  public storageError='';
  private key:string;
  constructor(public readonly userId:string,project:string,private storage:Pick<Storage,'getItem'|'setItem'>|null){
    this.key=salePreparationKey(project,userId);
    let saved:SalePreparation|null=null;
    try{saved=parseSalePreparation(storage?.getItem(this.key)||null,userId);}catch{}
    this.value=saved||emptySalePreparation(userId);
  }
  getSnapshot=()=>this.value;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  update=(action:SalePreparation|((previous:SalePreparation)=>SalePreparation))=>{
    const next=typeof action==='function'?action(this.value):action;
    if(next===this.value)return;
    if(next.userId!==this.userId)throw new Error('O rascunho pertence a outro usuário.');
    this.value=next;
    try{if(!this.storage)throw new Error();this.storage.setItem(this.key,serializeSalePreparation(next));this.storageError='';}
    catch{this.storageError='A recuperação temporária nesta aba está indisponível. Confira se as alterações foram salvas no Supabase antes de sair.';}
    for(const listener of this.listeners)listener();
  };
}
