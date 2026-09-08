# Operação autônoma do Carousel Desk

Esta atualização corrige a instalação reproduzível e conecta descoberta, geração, renderização e agendamento. A operação automática começa **desativada** no banco. Aplicar o código não ativa publicação automática nem habilita mensagens reais.

## Aplicação

1. Confira o resultado de **Validate Carousel Desk** na revisão. O CI usa PostgreSQL descartável e mocks para IA, Cloudinary e Instagram.
2. Na Vercel, habilite o acesso às variáveis de sistema do projeto. Durante a instalação de um deploy com VERCEL_ENV=production, o projeto executa **prisma migrate deploy** antes do build. Preview, CI e desenvolvimento não aplicam migrações de produção. Uma falha de migração interrompe o deploy, evitando disponibilizar código incompatível com o banco.
3. Em outra hospedagem, aplique **npm run prisma:deploy** no CI/CD antes de disponibilizar os novos endpoints. A migração adiciona campos e preserva os dados existentes. Implante com Node 24 e nunca execute prisma migrate dev em produção.
4. Confira APP_URL no GitHub e a igualdade de PUBLISH_API_TOKEN no GitHub e na aplicação. Todos os fluxos passam a usar esse token; o endpoint de descoberta também aceita o token legado.
5. Abra /admin/operation. Cadastre a estratégia da marca, resolva as configurações pendentes e escolha limite diário, horário UTC e nota mínima. A presença de uma chave não comprova sua validade ou permissões.
6. Ative a operação após revisar o primeiro carrossel e validar a conta profissional da Meta. Confira um ID de mídia real e o post no Instagram, além do resultado do workflow.

## Comportamento

- O controlador roda a cada 15 minutos, sujeito aos atrasos do GitHub Actions. Reserva no máximo 1–3 posts por dia UTC. Cada vaga diária é única, incluindo falhas; retentativas não abrem novas vagas.
- Seleciona temas com evidência extraída, data de publicação de até sete dias e pontuação mínima. A nota de IA não é uma verificação factual. Objetivos de oferta não são selecionados automaticamente.
- Descoberta e geração usam invocações separadas. Sem temas elegíveis, tenta uma descoberta no máximo a cada seis horas, além da descoberta diária.
- A geração grava todos os slides em uma transação. O worker entrega JPEG 1080×1350 e só libera aprovação após o conjunto completo. Resultados antigos de renderização são recusados.
- Regenerações e edições voltam à fila de renderização. Edições são bloqueadas em posts agendados, em publicação, publicados ou com envio incerto.
- Publicação espera a Meta terminar de processar o contêiner. Salva seu ID e um registro anterior ao envio. Uma resposta ambígua bloqueia republicação automática.
- Falhas recuperáveis dos posts automáticos do dia têm até três retentativas, com intervalo mínimo de 15 minutos. Operações paradas por mais de uma hora são identificadas. Filas automáticas de dias passados não são publicadas em lote.
- Pausar segura seleção, agendamento e publicação automática pendente. Publicações manuais aprovadas permanecem independentes. Um envio já iniciado pode terminar.
- As imagens ficam disponíveis após publicação para revisão. A remoção periódica de ativos antigos precisa de uma política de retenção antes de ser ativada.

## Comentários e entrega do material

Cadastre um material ativo, com link HTTPS e palavra-chave. Para posts com objetivo comment_dm, a opção de vinculação cria a automação somente após existir o ID da publicação.

São necessários: permissões e conta verificadas na Meta, INSTAGRAM_PRIVATE_REPLIES_ENABLED=true na aplicação e a variável INSTAGRAM_COMMENT_AUTOMATION_ENABLED=true no GitHub. Com a primeira chave desativada, entregas manuais são marcadas como SIMULATED; nunca como envio real.

A fila processa uma página de até 20 comentários por chamada e guarda o cursor. Faz rodízio entre posts com automações ativas. Comentários com mais de sete dias, sem data válida ou sem palavra-chave são ignorados. Entregas confirmadas são deduplicadas por comentário. Rejeições conhecidas podem ser tentadas novamente até três vezes; resultado incerto fica UNCERTAIN e exige conferência. Desativar a vinculação não pausa automações existentes; pause-as na tela Automações.

## Diagnóstico

O painel Operação mostra a última execução por etapa e posts com erros. HTTP 503 e falhas parciais de renderização tornam o workflow vermelho. Workflow verde indica execução técnica concluída; não comprova publicação, recebimento da mensagem ou geração de leads.

Nunca replique manualmente um post publish_uncertain ou uma entrega UNCERTAIN sem conferir o Instagram e reconciliar o ID do resultado existente. Falhas de token, permissão, cobrança de IA ou disponibilidade externa exigem a correção dessa dependência.

Referências da Meta consultadas em 08/09/2026: [publicação de conteúdo](https://developers.facebook.com/documentation/instagram-platform/content-publishing), [limites de carrossel](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/error-codes), [respostas privadas](https://developers.facebook.com/documentation/instagram-platform/private-replies).

Referências de implantação consultadas em 08/09/2026: [variáveis de sistema da Vercel](https://vercel.com/docs/environment-variables/system-environment-variables), [migrações de desenvolvimento e produção do Prisma](https://github.com/prisma/docs/blob/main/apps/docs/content/docs/orm/v7/prisma-migrate/workflows/development-and-production.mdx).

## Verificação local

Use um banco descartável chamado carousel_test em localhost. Nunca aponte testes para produção.

    npm ci
    DATABASE_URL=postgresql://carousel_test:local-test-only@localhost:5432/carousel_test npm run prisma:deploy
    npx playwright install --with-deps chromium
    npm run typecheck
    DATABASE_URL=postgresql://carousel_test:local-test-only@localhost:5432/carousel_test npm test
    DATABASE_URL=postgresql://carousel_test:local-test-only@localhost:5432/carousel_test npm run build
