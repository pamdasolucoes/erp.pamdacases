import {auditDetails} from '../services/auditPresentation';
export function AuditDetails({details,references}:{details:unknown;references?:Record<string,string>}){
 const lines=auditDetails(details,references);
 return <details><summary className="cursor-pointer font-semibold text-emerald-800">Ver o que foi alterado</summary>{lines.length?<dl className="mt-3 max-w-xl space-y-2 text-sm">{lines.map((line,i)=><div key={i} className="border-b pb-2"><dt className="font-semibold">{line.label}</dt><dd className="whitespace-pre-wrap break-words">{line.value}</dd></div>)}</dl>:<p className="mt-2">Este registro histórico não contém detalhes adicionais.</p>}</details>;
}
