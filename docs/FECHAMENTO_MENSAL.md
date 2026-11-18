# Fechamento mensal da administração

Menu: **Administração → Fechamento mensal**. Somente perfil `admin_gerencial`, ativo e validado, pode abrir as RPCs. Cada administrador consulta apenas seus próprios registros. Ter permissões financeiras ou administrativas isoladas não concede esta área a outros perfis.

## Fluxo

Selecione mês e período. Consulte explicitamente o lucro das lojas ou informe um valor manual com origem identificada. Registre contas, recebimentos/custos Shopee, entregas e pagamentos do acerto. Salve o rascunho; ao concluir, feche o mês. Fechamentos preservam os valores capturados e ficam somente para consulta, até uma reabertura com motivo.

O lucro das lojas combina **lucro dos produtos + frete cobrado**, usando o contrato do relatório de lucratividade existente. Custos de produtos ainda não conferidos deixam o resultado pendente e impedem fechar. A atualização do lucro é manual. O snapshot é criado no servidor, pertence ao administrador e ao período, e seus valores não podem ser substituídos pelo navegador.

## Regras confirmadas

- PAM: maior valor entre 20% do lucro líquido e R$ 1.700.
- Thales: custo fixo mensal de R$ 2.073 desde setembro de 2026, sem divisão societária do resultado. O último mês fica em branco até a confirmação do término. O custo é deduzido antes do cálculo da PAM.
- Reserva: 10% do saldo positivo após PAM. Um saldo negativo não cria uma reserva negativa.
- Retirada Danilo: lucro líquido menos PAM, reserva e descontos/adiantamentos da retirada, sem divisão com Thales.

As regras podem ser ajustadas por mês. Novos meses recebem as regras do mês salvo mais recente; meses existentes não são recalculados quando outro mês muda.

## Seções e reconciliação

**Contas:** valor, reduções, referência, vencimento, total pago, data e saldo. Pagamento não vira uma segunda despesa. Um pagamento a maior permanece como saldo negativo. Há cópia explícita das contas do mês anterior, com novos identificadores e vencimentos ajustados; pagamentos e reduções não são copiados.

**Shopee:** saques/recebimentos identificados na descrição, inclusive Pamda/Dama, e custos. Lucro Shopee = recebimentos − custos. Esses custos não entram novamente nas contas gerais.

**Entregas:** quantidade × valor por entrega + combustível = custo. Dinheiro recebido pelo motoboy e adiantamentos reduzem o acerto, sem reduzir o custo econômico. Saldo = custo − dinheiro recebido − adiantamento − valor pago. Pago positivo representa pagamento ao motoboy; negativo representa dinheiro recebido dele. O custo das entregas entra uma única vez em Saídas.

**Saídas:** contas após reduções + custo Thales vigente + custo das entregas. Não repetir os dois últimos custos em contas manuais.

**Folha ponto:** entrada, saída, intervalo, minutos previstos, valor hora e valor hora extra configuráveis. Calcula horas trabalhadas, extras, saldo negativo e valor por hora configurada, inclusive turnos que passam da meia-noite. Não presume regras trabalhistas nem lança salários nas contas automaticamente. Os pagamentos de salários e benefícios continuam sendo registrados em Contas.

## Persistência e segurança

Três tabelas em `pamda_private`, com RLS, sem acesso direto de `anon` ou `authenticated`: meses, revisões e snapshots de lucratividade. As únicas portas são RPCs com `search_path=''`, validação administrativa no banco e filtro pelo `auth.uid()` atual.

O servidor calcula os totais em centavos, valida datas, limites, linhas repetidas e valores. O navegador compara os totais retornados com seu próprio cálculo. A gravação usa versão esperada, chave idempotente e trava por administrador para impedir concorrência e fechamento de períodos ERP sobrepostos. Cada versão preserva dados, totais e eventual motivo de reabertura.

Este controle não movimenta estoque, contas a receber, despesas operacionais nem pagamentos reais. Os campos de pagamento registram acertos já realizados. Não há atualização automática ao focar a aba. Há proteção de alterações não salvas ao trocar de mês, sair da área ou fechar a página.

## Referência e histórico

A planilha enviada foi analisada como referência, sem edição nem inclusão do arquivo ou de seus dados pessoais no repositório. O bloco de ACERTO iniciado em A14 repete o título JUNHO, mas seu período indicado em G15 é de julho/agosto. As datas históricas e essa identificação precisam ser conciliadas antes de qualquer importação. Nenhum registro histórico foi importado ou alterado. A nova página usa o modelo atual confirmado: sem divisão com Thales desde setembro.

## Verificação

Testes unitários cobrem mínimo/percentual PAM, custo Thales e vigência, reserva, pagamentos, saldo negativo de motoboy, reduções, datas, centavos e ponto. Os testes SQL com PGlite comparam 24 conjuntos de cálculos com o navegador e exercitam isolamento entre administradores, negação a outros perfis/anon, snapshots imutáveis, versões concorrentes, idempotência, fechamento e reabertura. Testes de navegador exercitam todas as seções, cópia mensal, bloqueio de custos pendentes, resposta perdida, recarga e telas de computador/celular. A homologação no banco usa dados sintéticos numa subtransação que reverte todas as gravações ao terminar.
