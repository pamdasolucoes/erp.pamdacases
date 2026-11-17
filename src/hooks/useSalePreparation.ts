import {useEffect,useSyncExternalStore} from 'react';
import {saleWorkspace} from '../services/saleWorkspace';

export function useSalePreparation(userId:string){
  const workspace=saleWorkspace(userId);
  const draft=useSyncExternalStore(workspace.store.subscribe,workspace.store.getSnapshot);
  const sync=useSyncExternalStore(workspace.subscribe,workspace.getSyncState);
  useEffect(()=>{
    workspace.activate();
  },[workspace]);
  return {draft,setDraft:workspace.store.update,storageError:workspace.store.storageError,sync,workspace};
}
