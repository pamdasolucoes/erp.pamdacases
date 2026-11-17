import {lazy, type ComponentType} from 'react';

/** Hover and render share one module request. Failed preloads remain retryable. */
export function lazyView<T extends ComponentType<any>>(loader:()=>Promise<{default:T}>) {
  let pending:Promise<{default:T}>|undefined;
  const load=()=>pending??=loader().catch(error=>{pending=undefined;throw error;});
  return Object.assign(lazy(load),{preload:()=>{void load().catch(()=>{});}});
}
