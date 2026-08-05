# Operação

> Como manter o Cofrito rodando em produção.

---

## Equipe de operação

Definir antes do lançamento:

| Papel | Responsabilidade | Quem |
|---|---|---|
| **Owner institucional** | Responsável final pelo produto | Coordenador do CAOCIPP |
| **Owner técnico** | Mantém o código e a infra | definir (você?) |
| **SRE / Plantão** | Disponível 24/7 para incidente crítico | TI MPRS (a definir) |
| **DPO** | Conformidade LGPD | DPO MPRS |
| **Curador do corpus** | Mantém documentos atualizados | Assessoria técnica |

---

## Monitoramento

### Métricas (Cloud Monitoring + Grafana)

- **Latência p50/p95/p99** do `chat` (< 3,5s p95)
- **Taxa de erro** (< 0,5%)
- **Tokens consumidos/dia** (custo)
- **Conversas iniciadas/dia**
- **Recusas** (off-topic, fático-probatório, no-results)
- **Consultas formais abertas/dia**
- **Feedback 👍/👎** ratio

### Alertas

| Alerta | Condição | Canal |
|---|---|---|
| Erro spike | > 5% de erros em 5 min | e-mail + Slack |
| Custo diário > $5 | gasto > $5 | e-mail |
| Latência p95 > 6s | sustentado por 10 min | e-mail |
| Gemini offline | > 3 falhas consecutivas | e-mail + on-call |
| Taxa de recusa < 70% | scope creep suspeito | e-mail |
| Taxa de recusa > 60% | over-blocking | e-mail |
| Feedback 👎 > 👎×3 | 3x mais downvotes que upvotes | e-mail |

### Logs estruturados

Todas as Cloud Functions logam em JSON:

```json
{
  "severity": "INFO",
  "message": "chat.success",
  "userId": "...",
  "conversationId": "...",
  "latencyMs": 1840,
  "tokensUsed": 650
}
```

Pesquisáveis no Cloud Logging por:
- `severity=ERROR`
- `jsonPayload.userId=abc`
- `jsonPayload.action=consulta.created`

### Sentry (opcional, mas recomendado)

- Frontend e backend enviam erros
- Alertas em issues novas
- Release tracking (saber qual versão introduziu o bug)

---

## Rotinas

### Diária (5 min)

- [ ] Verificar alertas (e-mail/Slack)
- [ ] Verificar Sentry (issues novas)
- [ ] Verificar taxa de uso (anômala?)

### Semanal (30 min)

- [ ] Revisar 20 respostas aleatórias (avaliação humana)
- [ ] Revisar feedback 👎
- [ ] Revisar latência
- [ ] Atualizar áreas inferidas
- [ ] Verificar uso de free tier / custo

### Mensal (2h)

- [ ] Rodar golden set completo (50 perguntas)
- [ ] Revisar consultas formais abertas
- [ ] Revisar logs de auditoria
- [ ] Verificar retenção (LGPD)
- [ ] Revisar e ajustar system prompt
- [ ] Atualizar documentação
- [ ] Reportar métricas para a Coordenação

### Trimestral (1 dia)

- [ ] Revisar corpus (documentos vencidos?)
- [ ] Revisar ADRs (decisões ainda válidas?)
- [ ] Teste de DR (backup funciona?)
- [ ] Revisar custos e orçamento
- [ ] Atualizar equipe (novos membros?)

---

## Incidentes

### Severidade 1 (Crítico)

**Definição:** sistema indisponível, perda de dados, ou violação de segurança.

**Ações:**
1. Notificar equipe (e-mail + Slack + telefone)
2. Avaliar impacto
3. Acionar plano de mitigação (rollback, desativar feature, etc.)
4. Comunicar stakeholders
5. Pós-mortem em 5 dias úteis

### Severidade 2 (Alto)

**Definição:** funcionalidade principal quebrada, mas tem workaround.

**Ações:**
1. Notificar equipe
2. Investigar e corrigir
3. Deploy de fix (pode ser hotfix)

### Severidade 3 (Médio)

**Definição:** funcionalidade secundária quebrada.

**Ações:**
1. Abrir issue
2. Incluir no próximo sprint

### Playbooks de incidente comuns

#### Latência alta

1. Verificar `firebase functions:log --severity ERROR`
2. Verificar status do Gemini (https://status.cloud.google.com)
3. Se Gemini: aguardar 5 min, ver se normaliza
4. Se Firestore: verificar quotas (https://console.firebase.google.com)
5. Se persistir: rollback para última versão estável

#### Erro spike de chat

1. Verificar logs por `message: chat.error`
2. Identificar padrão (todos os usuários? só um? só algumas queries?)
3. Se Gemini: re-rotear para Pro temporariamente (mais lento, mas mais robusto)
4. Se guardrail: ajustar threshold
5. Se bug no código: rollback

#### Vazamento de dados

1. **IMEDIATO:** rotacionar chaves (Gemini, Resend, Firebase)
2. **IMEDIATO:** bloquear conta afetada
3. Avaliar o que vazou (logs, Sentry, audit)
4. Notificar DPO
5. Notificar ANPD em até 2 dias úteis (LGPD)
6. Notificar titulares afetados
7. Documentar incidente + lessons learned

---

## Custos

### Estimativa mensal

Ver [`00-PLANEJAMENTO-COMPLETO.md` §18](00-PLANEJAMENTO-COMPLETO.md#18-custos-faturamento-e-governança).

### Como pagar

Definir antes do lançamento:
- Conta Firebase pessoal (atual): não é ideal
- Conta Firebase institucional MPRS: precisa ser criada
- Quem paga a conta quando passar do free tier: definir

### Alertas de custo

- Alerta em $1/dia → e-mail
- Alerta em $5/dia → e-mail + on-call
- Bloqueio em $20/dia (circuit breaker) → serviço pausa, equipe notificada

### Otimizações

- Cache de embeddings (reutilizar)
- Cache de respostas idênticas (LRU)
- Compressão de contexto
- Gemini Flash por padrão; Pro só quando necessário
- Batch de embeddings em ingestão

---

## Suporte a usuários

### Canais

- **Email:** caocipp@mprs.mp.rs.gov.br
- **Slack/Teams:** (definir)
- **FAQ institucional:** `docs/10-FAQ-INSTITUCIONAL.md`

### SLA

| Tipo | Resposta inicial | Resolução |
|---|---|---|
| **Bloqueante** (sistema não funciona) | 1 hora | 4 horas |
| **Importante** (funcionalidade quebrada) | 4 horas | 1 dia útil |
| **Menor** (dúvida, melhoria) | 1 dia útil | 5 dias úteis |

---

## Manutenção programada

### Janela de manutenção

- **Preferência:** terça ou quarta, 18h-22h (horário de menor uso)
- **Anúncio:** 7 dias antes, via e-mail + banner no widget
- **Duração:** máx 2h

### Checklist de manutenção

- [ ] Backup pré-manutenção
- [ ] Comunicar usuários
- [ ] Janela de manutenção (manter widget visível com mensagem)
- [ ] Aplicar mudanças
- [ ] Testar
- [ ] Voltar widget ao normal
- [ ] Comunicar fim
- [ ] Post-mortem se houve incidente

---

## Handover de operação

Quando o owner técnico mudar:

1. Documentar tudo (este doc)
2. Shadowing (1-2 semanas)
3. Atualizar CODEOWNERS
4. Atualizar runbook
5. Apresentar stakeholders

---

Próximo: [`05-LGPD-SEGURANCA.md`](05-LGPD-SEGURANCA.md).
