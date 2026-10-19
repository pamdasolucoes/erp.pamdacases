import { useState } from 'react';
export function useProgressiveRows<T>(rows: readonly T[], key: string, pageSize = 80) {
  const [window, setWindow] = useState({ key, limit: pageSize });
  const limit = window.key === key ? window.limit : pageSize;
  return { visible: rows.slice(0, limit), hasMore: rows.length > limit,
    showMore: () => setWindow({ key, limit: limit + pageSize }) };
}
