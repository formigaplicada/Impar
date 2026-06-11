// ai.js — adicionar ao router principal do Worker
// Registar: app.route('/ai', aiRouter)  ou  app.post('/ai/chat', handleAiChat)

import { Hono } from 'hono';

const aiRouter = new Hono();

// ── RAG: secções do manual ────────────────────────────────────────────────────
const MANUAL_SECTIONS = [
  { "id": "inicio", "title": "Manual GO Condomínios", "text": "Guia completo para empresas de gestão de condomínios. Cobre todas as funcionalidades da plataforma, desde a configuração inicial até à gestão diária de condomínios, contabilidade e assembleias." },
  { "id": "acesso", "title": "Acesso à plataforma", "text": "1.1 Como aceder ao GO Condomínios e iniciar sessão como empresa de gestão. O acesso é feito através de gocondominios.pt com credenciais fornecidas pela GO Condomínios. Não é permitida mais de uma sessão simultânea do mesmo condomínio no mesmo browser." },
  { "id": "empresa", "title": "Interface da empresa", "text": "1.2 A vista de empresa é o ponto de entrada após o login. Permite gerir todos os condomínios da carteira. Menus disponíveis: Condomínios, Atalhos, Ocorrências, Vistorias, Pagamentos UP, Filiais, Tabelas. O menu Atalhos permite aceder a movimentos financeiros, quotas, condóminos e frações sem entrar em cada condomínio." },
  { "id": "dashboard", "title": "Dashboard do condomínio", "text": "1.3 O dashboard apresenta alertas críticos: condóminos com saldo negativo, seguros a expirar, ocorrências a expirar, contratos a renovar. Tem também uma caixa de Dados complementares para notas internas." },
  { "id": "movimentos", "title": "Movimentos do Condomínio", "text": "2.1 Registo e consulta de movimentos financeiros: receitas, despesas e recebimentos. Permite leitura de QR Code de faturas. Campos: tipo, descritivo, data, valor, estado (Recebido, Por pagar, Pago, etc.)." },
  { "id": "quotas", "title": "Gestão de Quotas", "text": "2.2 Registo de recebimentos, devoluções, notas de crédito e gestão completa das quotas. Operações: Registar Recebimento/Pagar quotas, Registar Devolução, Nota de Crédito, Quotas de penalidade, Avisos de cobrança. Listagens: pesquisa de quotas, recibos, mapa de dívida." },
  { "id": "planos", "title": "Planos de Quotas", "text": "2.3 Criação e gestão dos planos de quotas, associados ou não a orçamentos. Métodos de rateio: Manual, Por permilagem, Em partes iguais. Opção de dividir plano e copiar plano existente." },
  { "id": "orcamentos", "title": "Orçamentos do Condomínio", "text": "2.4 Criação e gestão dos orçamentos anuais. Campos: descritivo, período, taxa FCR. Listagens: Geral, Por Tipologia de Fração, Por Fração, Balancete." },
  { "id": "contas", "title": "Contas Bancárias e Fundo de Maneio", "text": "2.5 Gestão das contas bancárias do condomínio e do fundo de maneio. O Fundo de Maneio é uma reserva de tesouraria gerida separadamente das contas bancárias principais." },
  { "id": "zonamento", "title": "Tabelas de Contabilidade", "text": "2.6 Configuração das tabelas auxiliares: zonamento de frações, fornecedores, rubricas e centros de custo." },
  { "id": "fornecedores", "title": "Fornecedores / Clientes / Funcionários / Técnicos", "text": "Tabela central de entidades externas. Inclui fornecedores, clientes ocasionais, funcionários e técnicos. Cada registo inclui NIF, contactos e IBAN." },
  { "id": "rubricas", "title": "Tabela de Rubricas", "text": "As rubricas são categorias contabilísticas para classificar movimentos, quotas e orçamentos. Exemplos: Quota Ordinária, Quota Extraordinária, Limpeza, Seguro, Electricidade." },
  { "id": "centros", "title": "Tabela de Centros", "text": "Centros de custo para imputação granular de despesas. Úteis em condomínios com múltiplos blocos ou zonas com orçamentos separados." },
  { "id": "ocorrencias", "title": "Ocorrências", "text": "3.1 Registo e acompanhamento de ocorrências: avarias, reclamações, pedidos de intervenção. Estados: Aberto, Em resolução, Fechado, Pendente. Ocorrências próximas do prazo aparecem no dashboard como alerta." },
  { "id": "contratos", "title": "Contratos", "text": "3.2 Gestão de contratos de prestação de serviços: limpeza, segurança, elevadores, jardins. O sistema alerta quando um contrato está próximo do vencimento." },
  { "id": "obras", "title": "Obras", "text": "3.3 Acompanhamento de obras e intervenções. Cada obra tem estado (Aberto, Em curso, Concluído), datas e pode ter ocorrências e documentos associados." },
  { "id": "vistorias", "title": "Vistorias", "text": "3.4 Registo e arquivo de vistorias com geração automática de PDF. Opções: Arquivar PDF ou Enviar PDF condóminos por email." },
  { "id": "zonas", "title": "Tabela de Zonas", "text": "Zonas físicas do condomínio usadas em vistorias e ocorrências: Hall de entrada, Garagem, Cobertura, Jardim, Elevador." },
  { "id": "espacos", "title": "Tabela de Espaços / Equipamentos", "text": "Espaços comuns e equipamentos com planos de manutenção e histórico de intervenções." },
  { "id": "condominos", "title": "Condóminos", "text": "4.1 Gestão de condóminos: fichas, contas correntes, comunicações. Operações: Ficha, Conta Corrente, Conta Corrente Inquilino, Transferir Quotas. Documentos: Registo CTT, Declaração IRS, Lista presença assembleia, Declaração não dívida, Email, SMS." },
  { "id": "fracoes", "title": "Frações", "text": "4.2 Registo e gestão de frações com permilagem e tipologia. A permilagem total deve totalizar 1.000. Tipos: Apartamento, Garagem, Loja, Sótão, Arrecadação." },
  { "id": "agenda", "title": "Agenda", "text": "4.3 Calendário interactivo para eventos do condomínio: assembleias, vistorias, contratos, reuniões. Vistas: Mês, Semana, Dia, Todo dia." },
  { "id": "arquivo", "title": "Arquivo", "text": "5.1 Repositório central de documentos: atas, contratos, apólices, licenças, relatórios. Os documentos gerados automaticamente são arquivados automaticamente. Permite upload de documentos externos." },
  { "id": "minutas", "title": "Minutas e Documentos", "text": "5.2 Criação e gestão de minutas para assembleias e documentos oficiais. Fluxo: Criar > Alterar > Gerar documento PDF > Arquivar." },
  { "id": "assembleias-enc", "title": "Assembleias Encerradas", "text": "5.3 Histórico de assembleias concluídas. Apenas consulta — não editáveis. Para corrigir uma ata criar uma adenda." },
  { "id": "assembleias", "title": "Assembleias", "text": "5.4 Gestão completa de assembleias: Criar > Ordem de trabalhos > Convocatória > Presenças > Deliberações > Ata > Encerrar. A convocatória deve ser enviada com 10 dias de antecedência (Decreto-Lei 268/94)." },
  { "id": "pf-fracoes-condominos", "title": "Frações e Condóminos — Principais Funcionalidades", "text": "6. Guias passo a passo para operações frequentes relacionadas com frações e condóminos." },
  { "id": "pf-compra-venda", "title": "Registar compra e venda de uma fração", "text": "6.1 Quando uma fração muda de proprietário: editar fração do vendedor com data de venda; criar nova ficha do comprador com data de Aquisição igual à data de venda. Nunca eliminar o registo do vendedor." },
  { "id": "pf-condomino-multiplas", "title": "Condómino com mais de uma fração", "text": "6.2 O sistema agrega automaticamente fichas com o mesmo NIF numa única conta corrente. Para condómino sem NIF conhecido usar provisoriamente 111111111." },
  { "id": "video-eliminar-parcelas", "title": "Como eliminar parcelas de frações", "text": "6.3 Para eliminar parcelas, todas têm de ter data de venda preenchida. Operação irreversível. Passo 1: verificar datas de venda em Condóminos. Passo 2: Frações > Editar > assinalar Eliminar todas as parcelas > Gravar." },
  { "id": "pf-t-02-01", "title": "Registar movimento do condomínio", "text": "7.1 Ir a Contabilidade > Movimentos do Condomínio > Registar Movimento. Preencher campos e gravar." },
  { "id": "pf-t-02-02", "title": "Notas de crédito a fornecedores", "text": "7.2 Tipo 1 — Registar nota de crédito. Tipo 2 — Descontar em documentos por pagar: seleccionar fornecedor com saldo positivo e documentos por pagar." },
  { "id": "pf-t-02-03", "title": "Registo de despesas por pagar", "text": "7.3 Registar Movimento > Despesa > preencher só campos do Documento > apagar data de pagamento > Gravar. O movimento fica no estado Por pagar." },
  { "id": "pf-t-02-04", "title": "Registo de despesa relativo a documento por pagar", "text": "7.4 Para pagar uma despesa previamente registada como Por pagar: Registar Movimento > Despesa > seleccionar entidade > Gravar. Nunca editar o movimento original." },
  { "id": "pf-t-02-05", "title": "Condómino que efetuou pagamento a fornecedor em nome do condomínio", "text": "7.5 Usar conta Fundo de Maneio/Caixa em ambos os movimentos. Passo 1: Registar despesa. Passo 2: Registar recebimento do condómino. Verificar no extrato que os dois movimentos se anulam." },
  { "id": "pf-t-02-06", "title": "Registo de faturas por pagar e pagamentos associados", "text": "7.6 Registar fatura como Despesa sem pagamento imediato. Para pagar posteriormente: novo Registar Movimento > activar Pagar documentos anteriormente já registados. Nunca editar o movimento original." },
  { "id": "pf-t-02-07", "title": "Leitura de faturas com QR Code", "text": "7.7 Registar movimento com QR Code: via upload de ficheiro ou leitor/telemóvel. Após leitura automática confirmar rubrica, forma de pagamento e conta bancária antes de gravar." },
  { "id": "pf-transferencia-saldo", "title": "Transferir Saldo entre Condóminos", "text": "7.8 Usar conta Fundo de Maneio/Caixa. Passo 1: Gestão de Quotas > condómino origem > Registar Devolução. Passo 2: condómino destino > Registar Recebimento. Verificar que os movimentos se anulam." },
  { "id": "pf-t-03-01", "title": "Plano de quotas avulso", "text": "8.1 Contabilidade > Planos de Quotas > Criar plano não associado a orçamento. Seleccionar frações, definir rubrica, método de rateio, periodicidade, período. Clicar Ver plano e Gravar." },
  { "id": "pf-t-03-02", "title": "Plano de quotas com origem num orçamento", "text": "8.2 Contabilidade > Orçamentos > Criar Orçamento > seleccionar Orçamento associado a plano de quotas > adicionar rubricas > Gerar plano de quotas." },
  { "id": "pf-t-03-03", "title": "Registar recebimento e dar quotas como pagas", "text": "8.3 Gestão de Quotas > seleccionar condómino > Registar Recebimento/Pagar quota. Zona A: seleccionar quotas. Zona B: indicar valor recebido." },
  { "id": "pf-t-03-04", "title": "Dar quotas como pagas sem registar recebimento", "text": "8.4 Só possível se condómino tiver Saldo disponível suficiente. Gestão de Quotas > condómino > Registar Recebimento/Pagar quota > Zona B: Utilizar Saldo disponível > Gravar." },
  { "id": "pf-t-03-05", "title": "Registar apenas recebimento sem dar quotas como pagas", "text": "8.5 Gestão de Quotas > condómino > Registar Recebimento/Pagar quota > Zona B: indicar valor > não seleccionar quotas > Gravar. Valor fica como Saldo disponível." },
  { "id": "pf-t-03-06", "title": "Recibo de quotas — consultar, reenviar ou imprimir", "text": "8.6 Gestão de Quotas > Pesquisa de Quotas > filtrar por Estado: Pago e condómino > clicar Recibo para consultar ou Enviar PDF para reenviar." },
  { "id": "pf-t-03-07", "title": "Eliminar recibo ou alterar quotas pagas para Por pagar", "text": "8.7 Gestão de Quotas > Pesquisa de Quotas > Editar estado > alterar de Pago para Por pagar. Se associado a recebimento: opção de eliminar ou manter recebimento." },
  { "id": "pf-t-03-08", "title": "Isentar quotas", "text": "8.8 Gestão de Quotas > Pesquisa de Quotas > Editar estado > alterar para Isento > Gravar. Quotas isentadas não aparecem na conta corrente." },
  { "id": "pf-t-04-01", "title": "Orçamento associado a plano de quotas", "text": "9.1 Orçamentos > Criar Orçamento > seleccionar Orçamento associado a plano de quotas > adicionar rubricas > Gerar plano de quotas." },
  { "id": "pf-t-04-02", "title": "Orçamento sem plano de quotas associado", "text": "9.2 Criar Orçamento sem seleccionar opção de plano de quotas. Útil para controlo interno quando as quotas já existem." },
  { "id": "video-saldo-disponivel", "title": "Saldo Disponível de Condómino", "text": "O Saldo Disponível representa o valor disponível para pagar quotas. Difere do Saldo de Conta Corrente: considera apenas valores recebidos e ainda não alocados a quotas." },
  { "id": "video-quotas-vencidas", "title": "Quotas vencidas e por vencer", "text": "Quota vencida: data de vencimento passou e não foi paga. Quota por vencer: data ainda não chegou mas já emitida. A plataforma apresenta separadamente vencidas e por vencer." },
  { "id": "video-saldo-conta-corrente", "title": "Saldo de conta corrente de condómino", "text": "O Saldo de Conta Corrente é a posição financeira global do condómino: inclui todas as quotas emitidas e todos os recebimentos." },
  { "id": "video-conta-corrente", "title": "Conta corrente de condómino", "text": "Registo histórico completo da relação financeira: quotas emitidas, pagamentos, devoluções, isenções, saldo. Para condóminos com múltiplas frações apresenta saldo consolidado se tiverem o mesmo NIF." }
];

const SECTION_INDEX = MANUAL_SECTIONS.map(s => `${s.id}: ${s.title}`).join('\n');

const SYSTEM_PROMPT = `És o assistente de suporte oficial do Gocondominios.pt, uma plataforma portuguesa de gestão de condomínios.

O teu papel é ajudar os utilizadores com:
- Funcionalidades da plataforma (gestão de quotas, convocatórias, atas, obras, contabilidade, etc.)
- Como-fazer e tutoriais passo a passo
- Resolução de problemas técnicos comuns
- Boas práticas de gestão de condomínios em Portugal
- Legislação relevante (Regime de Propriedade Horizontal, Decreto-Lei 268/94, etc.)

Regras de comportamento:
- Responde SEMPRE em português europeu (não brasileiro)
- Sê conciso, claro e amigável — usa parágrafos curtos
- Para processos, fornece passos numerados
- Se não souberes algo específico, sugere que o utilizador contacte suporte@gocondominios.pt
- Nunca inventes funcionalidades que não conheces com certeza
- Quando relevante, menciona que podem agendar uma demonstração em gocondominios.pt

Funcionalidades principais do Gocondominios:
- Gestão de quotas e pagamentos dos condóminos
- Emissão de avisos e recibos automáticos
- Convocatórias e atas de assembleias de condóminos
- Gestão de obras, orçamentos e fornecedores
- Comunicação interna com condóminos
- Relatórios financeiros e mapas de contas
- Portal do condómino (acesso online e app móvel)
- Integração com contabilidade e bancos

Tom: profissional mas acessível. Usa "você" para tratar o utilizador.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findRelevantSections(question, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Tens um índice de secções de um manual de software de gestão de condomínios.\n\nÍndice:\n${SECTION_INDEX}\n\nPergunta do utilizador: "${question}"\n\nResponde APENAS com um JSON válido: lista de objectos com "id" e "score" (0-100) de relevância. Até 5 secções. Exemplo: [{"id":"acesso","score":95}]. Se nenhuma for relevante, responde com [].`
      }]
    })
  });

  if (!response.ok) return [];

  const data = await response.json();
  const text = data.content?.[0]?.text || '[]';

  try {
    const parsed = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
    return parsed.map(item => {
      const section = MANUAL_SECTIONS.find(s => s.id === item.id);
      return section ? { ...section, score: item.score } : null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function buildSystemPromptWithContext(relevantSections) {
  if (relevantSections.length === 0) return SYSTEM_PROMPT;

  let context = '\n\n## Informação relevante do Manual GO Condomínios\n\n';
  relevantSections.forEach(s => {
    context += `### ${s.title} [id:${s.id}]\n${s.text}\n\n`;
  });
  context += '\nUsa esta informação do manual como fonte primária para responder.';

  const highMatch = relevantSections.filter(s => s.score >= 80);
  let linksInstruction = '';
  if (highMatch.length > 0) {
    const linksList = highMatch.map(s => `- [${s.title}](MANUAL_LINK:${s.id})`).join('\n');
    linksInstruction = `\n\n## Links do manual\nQuando a tua resposta se basear nas secções abaixo, DEVES incluir no final uma linha "📖 Consulte o manual:" seguida dos links relevantes, usando EXACTAMENTE este formato: [TITULO](MANUAL_LINK:ID)\nSecções disponíveis:\n${linksList}`;
  }

  return `${SYSTEM_PROMPT}${context}${linksInstruction}

## Regras de fonte de informação
- USA SEMPRE primeiro a informação do manual fornecida acima, se existir
- Se o manual não tiver a informação, podes usar conhecimento geral fidedigno sobre gestão de condomínios em Portugal
- Se não tiveres confiança na resposta, NÃO inventes — diz ao utilizador para contactar o suporte:
  📧 suporte@gocondominios.pt
  📞 915 922 203 (suporte técnico)
  📞 935 789 103 (questões comerciais)`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

aiRouter.post('/chat', async (c) => {
  const apiKey = c.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'ANTHROPIC_API_KEY não configurada' }, 500);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Body inválido' }, 400);
  }

  const { messages, question } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'Campo messages obrigatório' }, 400);
  }

  try {
    // Passo 1: RAG — encontrar secções relevantes
    const relevantSections = question
      ? await findRelevantSections(question, apiKey)
      : [];

    // Passo 2: construir system prompt com contexto
    const systemPrompt = buildSystemPromptWithContext(relevantSections);

    // Passo 3: chamada principal ao Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return c.json({ error: err.error?.message || `Erro Anthropic ${response.status}` }, 502);
    }

    const data = await response.json();
    return c.json({
      reply: data.content?.[0]?.text || '',
      usage: data.usage,
    });

  } catch (err) {
    console.error('[ai/chat]', err);
    return c.json({ error: 'Erro interno' }, 500);
  }
});

export default aiRouter;
