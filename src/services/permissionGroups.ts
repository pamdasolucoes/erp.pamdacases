export interface PermissionOption {key:string;description:string}
const areas=[
 {title:'01 · Vendas e atendimento',prefixes:['sales.','customers.','reports.'],modules:['nova_venda','vendas','clientes','redes','relatorio_vendas','relatorio_clientes']},
 {title:'02 · Financeiro',prefixes:['finance.','expenses.','profitability.'],modules:['contas_receber','fechamentos','despesas','lucratividade']},
 {title:'03 · Estoque e produtos',prefixes:['stock.','products.'],modules:['estoque','produtos','kits','custo_estoque']},
 {title:'04 · Suprimentos',prefixes:['purchases.','suppliers.'],modules:['compras','fornecedores']},
 {title:'05 · Produção e entregas',prefixes:['production.','deliveries.'],modules:['producao','entregas']},
 {title:'06 · Administrativo',prefixes:['users.','audit.','settings.'],modules:['dashboard','usuarios','logs','configuracoes']},
 {title:'07 · Outras permissões',prefixes:[],modules:[]},
];
export function groupPermissions(catalog:readonly PermissionOption[]){
 const groups=areas.map(area=>({...area,menus:[] as PermissionOption[],actions:[] as PermissionOption[]}));
 for(const permission of catalog){
  const menu=permission.key.startsWith('module.');
  const group=groups.find(g=>menu?g.modules.includes(permission.key.slice(7)):g.prefixes.some(prefix=>permission.key.startsWith(prefix)))||groups[groups.length-1];
  (menu?group.menus:group.actions).push(permission);
 }
 for(const group of groups)for(const list of [group.menus,group.actions])list.sort((a,b)=>a.description.localeCompare(b.description,'pt-BR')||a.key.localeCompare(b.key));
 return groups.filter(g=>g.menus.length||g.actions.length);
}
