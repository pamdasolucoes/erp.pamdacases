export function customizationSummary(value:Record<string,unknown>|null|undefined):string {
 if(!value)return '';
 if(Array.isArray(value.customerCases))return value.customerCases.filter(c=>c&&typeof c.model==='string'&&typeof c.color==='string').map(c=>[c.model,c.color].filter(Boolean).join(' · ')).filter(Boolean).join(' / ');
 return [value.model,value.color].filter(v=>typeof v==='string'&&v).join(' · ');
}
