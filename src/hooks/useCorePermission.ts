import { useEffect, useState } from 'react';
import { coreService } from '../services/coreService';
import { authService } from '../services/auth';
import {permissionVersion} from '../services/permissions';

export function useCorePermission(userId: string, permission: string) {
  const [state, setState] = useState({ userId: '', permission: '', allowed: false, error: '' });
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let signature = '';
    const load = () => {
      const current = ++generation;
      setState({ userId, permission, allowed: false, error: '' });
      void coreService.hasPermission(userId, permission).then(
        allowed => { if (alive && current === generation) setState({ userId, permission, allowed, error: '' }); },
        error => { if (alive && current === generation) setState({ userId, permission, allowed: false, error: error instanceof Error ? error.message : 'Não foi possível validar sua permissão.' }); },
      );
    };
    const unsubscribe = authService.subscribe((user, loading, error) => {
      if (!user || user.id !== userId || error) { signature=''; generation++; setState({ userId, permission, allowed: false, error: error || '' }); }
      else if (!loading) {
        const next=JSON.stringify([user.id,user.role,user.active,user.mustChangePassword,permissionVersion(user)]);
        if(next!==signature){signature=next;load();}
      }
    });
    return () => { alive = false; unsubscribe(); };
  }, [userId, permission]);
  return state.userId === userId && state.permission === permission ? state : { allowed: false, error: '' };
}
