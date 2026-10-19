import type { PaymentMethod } from '../../types/payments';

export function PaymentSelect({ label, value, rows, onChange, disabled = false }: { label: string; value: string | null | undefined; rows: readonly PaymentMethod[]; onChange(id: string | null): void; disabled?: boolean }) {
  const unavailable = value && !rows.some(row => row.id === value && row.active);
  return <label className="block text-xs font-bold text-slate-600">{label}<select aria-label={label} disabled={disabled} value={value || ''} onChange={event => onChange(event.target.value || null)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-2 text-sm font-normal">
    <option value="">Não configurado</option>{unavailable && <option value={value} disabled>Condição salva indisponível</option>}
    {rows.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
  </select></label>;
}
