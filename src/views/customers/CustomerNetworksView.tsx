import React,{useState} from 'react';
import {useCustomers} from '../../hooks/useCustomers';
import type {OfficialCustomer,CustomerContext} from '../../types/pamdaCore';
import {CustomerNetworksPanel} from './CustomerNetworksPanel';
import {CustomerEditModal} from './CustomerEditModal';

export function CustomerNetworksView({onOpen}:{onOpen(customer:CustomerContext):void}){
 const {customers,loading,error,reload}=useCustomers();
 const [editing,setEditing]=useState<OfficialCustomer|null>(null);
 return <div className="space-y-5"><h1 className="text-2xl font-black">Rede de Lojas</h1>{loading?<p role="status">Carregando clientes e redes…</p>:error?<p role="alert">{error} <button type="button" onClick={reload}>Tentar novamente</button></p>:<CustomerNetworksPanel customers={customers} onOpen={c=>onOpen({id:c.id,customerCode:c.customerCode})} onEdit={setEditing}/>} {editing&&<CustomerEditModal customer={editing} onClose={()=>setEditing(null)} onSaved={()=>setEditing(null)}/>}</div>;
}
