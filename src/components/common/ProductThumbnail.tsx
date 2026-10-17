import React, { useState } from 'react';
import { safeProductImage } from '../../services/productMapping';

export function ProductThumbnail({ url }: { url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const safe = safeProductImage(url);
  return safe && failedUrl !== safe ? <img src={safe} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(safe)} className="h-9 w-9 shrink-0 rounded-md border border-slate-100 object-contain" /> : null;
}
