import {useEffect,useSyncExternalStore} from 'react';
import {saleWorkspace} from '../services/saleWorkspace';

export function useSalePreparation(userId:string){
  const workspace=saleWorkspace(userId);
  const draft=useSyncExternalStore(workspace.store.subscribe,workspace.store.getSnapshot);
  const sync=useSyncExternalStore(workspace.subscribe,workspace.getSyncState);
  useEffect(()=>{
    workspace.activate();
    const focus=()=>{void workspace.revalidate();};
    const visible=()=>{if(document.visibilityState==='visible')focus();};
    window.addEventListener('focus',focus);window.addEventListener('online',focus);document.addEventListener('visibilitychange',visible);
    return()=>{window.removeEventListener('focus',focus);window.removeEventListener('online',focus);document.removeEventListener('visibilitychange',visible);};
  },[workspace]);
  return {draft,setDraft:workspace.store.update,storageError:workspace.store.storageError,sync,workspace};
}
