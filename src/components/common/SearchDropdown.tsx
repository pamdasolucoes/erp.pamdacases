import React, { useId, useState } from 'react';
import { Search } from 'lucide-react';

interface Option { id: string; disabled?: boolean; }
interface Props<T extends Option> {
  label: string; placeholder: string; selectedLabel?: string;
  query: string; onQueryChange(value: string): void;
  options: readonly T[]; onSelect(option: T): void; renderOption(option: T): React.ReactNode;
  loading?: boolean; error?: string; onRetry?: () => void;
}
export function SearchDropdown<T extends Option>({ label, placeholder, selectedLabel, query, onQueryChange, options, onSelect, renderOption, loading, error, onRetry }: Props<T>) {
  const uid = useId(); const [open, setOpen] = useState(false); const [active, setActive] = useState(-1);
  const choose = (option: T) => { if (option.disabled) return; onSelect(option); onQueryChange(''); setOpen(false); setActive(-1); };
  return <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
    <label htmlFor={uid} className="block text-sm font-bold text-slate-700">{label}</label>
    <div className="relative mt-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
      <input id={uid} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${uid}-list`} aria-activedescendant={open && active >= 0 ? `${uid}-${active}` : undefined}
        autoComplete="off" placeholder={selectedLabel || placeholder} value={open ? query : selectedLabel || query}
        onFocus={() => setOpen(true)} onChange={event => { onQueryChange(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); return; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            const next = options.length ? event.key === 'ArrowDown' ? (active + 1) % options.length : active <= 0 ? options.length - 1 : active - 1 : -1;
            setActive(next); if (next >= 0) document.getElementById(`${uid}-${next}`)?.scrollIntoView({ block: 'nearest' });
          }
          if (event.key === 'Enter') {
            event.preventDefault(); event.stopPropagation();
            if (loading || error) return;
            const option = active >= 0 ? options[active] : options.length === 1 ? options[0] : undefined;
            if (option) choose(option); else setOpen(true);
          }
        }} className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm font-normal" />
    </div>
    {open && <div className="absolute left-0 right-0 z-30 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      {loading ? <p role="status" className="p-4 text-sm text-slate-500">Carregando resultados oficiais...</p> : error ? <div role="alert" className="p-4 text-sm text-rose-800"><p>{error}</p>{onRetry && <button type="button" className="mt-2 underline" onClick={onRetry}>Tentar novamente</button>}</div> : <>
        <p className="px-3 py-2 text-xs text-slate-500 border-b">{options.length} resultado(s) · Use as setas, Enter ou clique</p>
        <ul id={`${uid}-list`} role="listbox" aria-label={`${label} — resultados`} className="max-h-80 overflow-y-auto divide-y divide-slate-100">
          {!options.length && <li role="presentation" className="p-4 text-sm text-slate-500">Nenhum resultado encontrado.</li>}
          {options.map((option, index) => <li key={option.id} id={`${uid}-${index}`} role="option" aria-selected={index === active} aria-disabled={option.disabled || undefined}
            onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(option)}
            className={`p-3 text-sm ${option.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'} ${active === index ? 'bg-blue-50' : ''}`}>{renderOption(option)}</li>)}
        </ul>
      </>}
    </div>}
  </div>;
}
