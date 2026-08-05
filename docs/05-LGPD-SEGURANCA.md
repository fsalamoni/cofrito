# LGPD e Segurança

> Conformidade com a Lei Geral de Proteção de Dados e padrões de segurança.

---

## Inventário de dados

| Dado | Finalidade | Base legal | Retenção | Compartilhamento |
|---|---|---|---|---|
| **E-mail** | Login, identificação | Execução de contrato | Enquanto conta existir | Nenhum |
| **Nome (displayName)** | Personalização | Consentimento | Enquanto conta existir | Nenhum |
| **IP (hashed SHA-256)** | Segurança, auditoria | Legítimo interesse | 90 dias | Nenhum |
| **User agent** | Auditoria, debug | Legítimo interesse | 90 dias | Nenhum |
| **Texto das perguntas** | Funcionalidade, melhoria | Consentimento | 12 meses | Gemini API (anonimizado) |
| **Texto das respostas** | Funcionalidade, melhoria | Consentimento | 12 meses | Nenhum |
| **Áreas inferidas** | Personalização | Consentimento | Enquanto conta existir | Nenhum |
| **PGEA (opcional)** | Vincular a processo | Consentimento | 5 anos (compliance) | Nenhum |
| **Logs de auditoria** | Obrigação legal | Obrigação legal | 5 anos | Nenhum |
| **Feedback (👍/👎)** | Melhoria | Consentimento | 12 meses | Nenhum |

---

## Princípios LGPD aplicados

### 1. Necessidade
Coletamos apenas o estritamente necessário.

### 2. Finalidade
Informada na primeira tela (consent banner).

### 3. Transparência
- [Termo de Uso](../TERMOS.md) — em linguagem simples
- [Política de Privacidade](../PRIVACIDADE.md) — completa
- Cookies: usamos Firebase Auth (sessão, não tracking)

### 4. Segurança
Ver §"Segurança técnica" abaixo.

### 5. Direitos do titular
- ✅ Acesso (ver todos os meus dados)
- ✅ Correção (corrigir nome, e-mail)
- ✅ Exclusão (apagar conta)
- ✅ Portabilidade (exportar JSON)
- ✅ Revogação de consentimento
- ✅ Revisão de decisões automatizadas (sempre há revisão humana do feedback)

Todos esses direitos têm **botão na UI**.

---

## Coleta de consentimento

### Banner no primeiro acesso

```
┌──────────────────────────────────────────────────────────────┐
│  🤖 Olá! Antes de começar, precisamos do seu consentimento.  │
│                                                              │
│  Este assistente usa suas perguntas para buscar documentos     │
│  no acervo do CAOCIPP. Suas conversas são armazenadas de    │
│  forma segura por 12 meses e podem ser apagadas a qualquer  │
│  momento.                                                    │
│                                                              │
│  📄 Ler termo de uso completo                                │
│  🔒 Ler política de privacidade                             │
│                                                              │
│  [Não aceito]                  [Aceito e continuar]            │
└──────────────────────────────────────────────────────────────┘
```

### Versões

- Termo de uso é versionado (campo `consent.version`)
- Mudança material → re-aceite obrigatório
- Histórico de aceites em `users/{uid}/consent-history`

### Rejeição

Se o usuário rejeitar:
- Widget mostra mensagem de "consentimento necessário"
- Nenhuma chamada a Cloud Function é feita
- Dados coletados são apenas os de sessão (não persistidos)

---

## Direitos do titular — implementação

### Acesso (exportar dados)

UI: Perfil → "Exportar meus dados" → gera JSON com:
- Perfil
- Conversas (com mensagens)
- Feedback
- Consultas formais
- Áreas inferidas

Endpoint: Cloud Function `exportData` (gera URL temporária do Cloud Storage).

### Correção

UI: Perfil → editar nome → Cloud Function `updateProfile`.

### Exclusão

UI: Perfil → "Apagar minha conta" → confirmação dupla → Cloud Function `deleteAccount`:
1. Marca `status: 'deleted'` no Firestore
2. Anonimiza PII
3. Apaga autenticação
4. Log de auditoria
5. Cloud Function `cleanupRetention` apaga após 90 dias

### Portabilidade

JSON exportável (ver "Acesso").

### Revogação de consentimento

UI: Perfil → "Revogar consentimento" → equivalente a apagar conta.

---

## Segurança técnica

### Camadas

```
┌────────────────────────────────────────┐
│ 1. Transporte (TLS 1.3)                │
├────────────────────────────────────────┤
│ 2. Cabeçalhos HTTP (CSP, HSTS, etc)    │
├────────────────────────────────────────┤
│ 3. Firebase Auth (JWT)                 │
├────────────────────────────────────────┤
│ 4. Firestore Rules                     │
├────────────────────────────────────────┤
│ 5. Validação Zod em inputs             │
├────────────────────────────────────────┤
│ 6. Filtro de PII antes do LLM          │
├────────────────────────────────────────┤
│ 7. Rate limiting                       │
├────────────────────────────────────────┤
│ 8. Logs de auditoria                   │
├────────────────────────────────────────┤
│ 9. Retenção automática (LGPD)          │
├────────────────────────────────────────┤
│ 10. Dependency scanning                │
└────────────────────────────────────────┘
```

### 1. Transporte

- **TLS 1.3** obrigatório
- **HSTS** habilitado: `max-age=31536000; includeSubDomains; preload`
- HTTP → HTTPS redirect automático
- Cookies: `Secure`, `HttpOnly`, `SameSite=Strict`

### 2. CSP

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://*.firebaseio.com https://*.googleapis.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https:;
connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com;
frame-ancestors 'self';
base-uri 'self';
form-action 'self';
```

Configurado em `firebase.json` (hosting headers).

### 3. Firestore Rules

- **NUNCA** usar `auth.uid` — sempre `request.auth.uid`
- Função helper `isOwner(uid)` declarada
- Subcoleções com regras explícitas
- Audit só escrita via Admin SDK
- Default: negar

Ver `firestore.rules` para detalhes.

### 4. Validação Zod

Todos os endpoints validam input:

```typescript
const Schema = z.object({ ... })
const parsed = Schema.safeParse(request.data)
if (!parsed.success) throw new HttpsError('invalid-argument', ...)
```

### 5. Filtro de PII

Antes de enviar para Gemini:

```typescript
const { text, mapping } = filterPII(userMessage)
// PIIs substituídos por [cpf_0], [pgea_1], etc.
// mapping é usado para restaurar PII na resposta
```

Padrões filtrados:
- CPF (XXX.XXX.XXX-XX)
- PGEA (XXXXX.XXX.XXX/XXXX)
- E-mail
- Número de processo CNJ
- OAB
- Telefone

### 6. Rate limiting

| Endpoint | Limite | Janela |
|---|---|---|
| `chat` | 30 req | 1 min/usuário |
| `openConsultaFormal` | 5 req | 1 hora/usuário |
| `deleteAccount` | 1 req | 24h/usuário |
| `adminReingest` | 5 req | 1 dia |

Implementado em `middleware/rateLimit.ts` (Firestore counter).

### 7. Logs de auditoria

Toda ação sensível registra em `/audit/{eventId}`:

```typescript
{
  userId: '...',
  action: 'consulta.created',
  resource: '/consultas-formais/CAO-2026-...',
  meta: { ... },
  at: Timestamp,
  ipHash: sha256(ip),
  userAgent: '...'
}
```

Escrita apenas via Admin SDK (Firestore Rules bloqueiam escrita do cliente).

### 8. Retenção (Cloud Function agendada)

`cleanupRetention` (diariamente, 2h):

- Contas com `status: 'deleted'` há > 90 dias → hard delete
- Logs de auditoria com > 5 anos → hard delete
- (Futuro) Conversas com > 12 meses → anonimizar

---

## Plano de resposta a incidente

### Detecção
- Alerta automatizado (latência, erro, custo)
- Usuário reporta (canal de suporte)
- Monitoramento proativo (logs, métricas)

### Contenção (em até 1h)
1. Avaliar severidade
2. Bloquear conta afetada (se aplicável)
3. Rotacionar chaves (se aplicável)
4. Desativar feature (se necessário)
5. Rollback (se aplicável)

### Avaliação
- O que vazou
- Quem foi afetado
- Como foi possível

### Notificação
- **ANPD:** em até 2 dias úteis (se houver risco aos titulares)
- **Titulares afetados:** em até 72h
- **Stakeholders internos:** imediato

### Correção
- Patch
- Teste
- Deploy
- Comunicação de "resolvido"

### Documentação
- Relatório do incidente
- Lessons learned
- Atualização de processos

---

## Compliance

### Antes de produção

- [ ] DPO MPRS revisa este documento
- [ ] Termo de uso revisado pelo jurídico
- [ ] Política de privacidade revisada
- [ ] Verificar política interna de IA/chatbots do MPRS
- [ ] Contratos com Google/Firebase (operador vs controlador)
- [ ] DPIA (Relatório de Impacto à Proteção de Dados)
- [ ] SLA com TI MPRS
- [ ] Plano de comunicação em caso de incidente

### Operador vs Controlador

- **Controlador:** MPRS (define finalidades, meios)
- **Operador:** Google LLC (Firebase/GCP) — processa dados conforme instruções
- **Sub-operador:** Gemini API (Google) — processa embeddings + completions

Contratos:
- Google Cloud: termos padrão
- Gemini API: termos padrão
- Pode precisar de DPA (Data Processing Addendum) específico

---

## Contatos

- **DPO MPRS:** (a definir — fundamental antes de produção)
- **Coordenação CAOCIPP:** caocivel@mprs.mp.br
- **TI MPRS:** (a definir)
- **ANPD (emergência):** https://www.gov.br/anpd

---

Próximo: [`06-API-REFERENCE.md`](06-API-REFERENCE.md).
