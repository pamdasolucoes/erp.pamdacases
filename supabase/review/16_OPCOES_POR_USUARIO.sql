-- Visibilidade das opções, além das permissões de consultar/alterar dados.
insert into public.erp_permission_catalog(key,description)
select 'module.'||tab,'Menu: '||label from (values
 ('nova_venda','Nova venda'),('vendas','Vendas e pendências'),('clientes','Clientes'),('produtos','Produtos'),('kits','Kits'),
 ('estoque','Estoque e movimentos'),('producao','Fila de produção'),('contas_receber','Contas a receber'),('fechamentos','Fechamentos'),
 ('entregas','Fretes e entregas'),('despesas','Despesas'),('compras','Compras e entradas'),('fornecedores','Fornecedores'),
 ('relatorio_vendas','Relatório de vendas'),('relatorio_clientes','Vendas por cliente'),('lucratividade','Lucratividade'),
 ('custo_estoque','Custo do estoque'),('usuarios','Usuários e acessos'),('logs','Auditoria'),('configuracoes','Configurações')) v(tab,label)
on conflict(key) do nothing;
insert into public.erp_role_permissions(role,permission_key,allowed)
select role,'module.'||tab,true from (values
('venda_atendimento','nova_venda'),('venda_atendimento','vendas'),('venda_atendimento','produtos'),('venda_atendimento','kits'),
('venda_atendimento','estoque'),('venda_atendimento','relatorio_vendas'),('venda_atendimento','relatorio_clientes'),
('financeiro','contas_receber'),('financeiro','fechamentos'),('financeiro','entregas'),('financeiro','despesas'),
('producao','producao'),('estoque_expedicao','estoque'),('estoque_expedicao','produtos'),('estoque_expedicao','kits'),
('estoque_expedicao','compras'),('estoque_expedicao','fornecedores'),('estoque_expedicao','entregas')) v(role,tab)
on conflict(role,permission_key) do nothing;
-- Desativa as escritas de teste. Histórico de teste permanece preservado e fora dos relatórios reais.
revoke execute on function public.pamda_finalizar_venda_teste(uuid,jsonb,uuid) from authenticated;
revoke execute on function public.pamda_conceder_credito_teste(uuid,numeric,text,uuid,text) from authenticated;
revoke execute on function public.pamda_confirmar_pagamento_teste(uuid,text) from authenticated;
