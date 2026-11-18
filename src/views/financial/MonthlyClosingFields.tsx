import React,{useEffect,useRef,useState} from 'react';
import {centsInput,parsePriceInput} from '../../services/salePricing';
export const input='w-full min-w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50';
export const button='inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50';
export function MoneyInput({label,value,onChange,signed=false,disabled=false}:{label:string;value:number;onChange:(n:number)=>void;signed?:boolean;disabled?:boolean}){
  const ref=useRef<HTMLInputElement>(null),[raw,setRaw]=useState(Number.isFinite(value)?centsInput(value):'');
  useEffect(()=>{if(document.activeElement!==ref.current)setRaw(Number.isFinite(value)?centsInput(value):'');},[value]);
  return <input disabled={disabled} ref={ref} aria-label={label} aria-invalid={!Number.isFinite(value)||undefined} className={input} inputMode="decimal" value={raw} onChange={event=>{
    const raw=event.target.value;setRaw(raw);const negative=signed&&raw.trim().startsWith('-');
    const parsed=raw.trim()===''?0:parsePriceInput(negative?raw.trim().slice(1):raw);onChange(parsed===null?NaN:negative?-parsed:parsed);
  }} onBlur={()=>{if(Number.isFinite(value))setRaw(centsInput(value));}}/>;
}
export function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="grid gap-1 text-sm font-medium">{label}{children}</label>;}
