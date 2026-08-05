# ADR-0005: Padrões de Segurança

- **Status:** Aceito
- **Data:** 2026-08-05
- **Decisor(es):** Equipe técnica + DPO MPRS
- **Contexto:** Princípios de segurança aplicados ao Cofrito

## Contexto

O Cofrito lida com:
- Dados pessoais (e-mail, nome, IP)
- Conversas com potencial conteúdo sensível (casos, partes)
- Integração com LLM (dados podem ir para o Gemini)
- Hospedagem em GCP (compartilhado, mas isolado)

Ameaças:
- Acesso não autorizado
- Injeção de prompt
- Vazamento de dados
- Modificação de corpus
- Ataques de força bruta
- LGPD

## Decisão

Aplicamos **defense in depth** em todas as camadas.

## Padrões obrigatórios

### 1. Transporte

- **TLS 1.3** obrigatório (Firebase Hosting garante)
- **HSTS** habilitado (`max-age=31536000; includeSubDomains; preload`)
- **HTTP → HTTPS** redirect automático
- **Cookies:** `Secure`, `HttpOnly`, `SameSite=Strict`

### 2. Cabeçalhos HTTP

Configurados em `firebase.json`:

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://*.firebaseio.com ...;
```

### 3. Content Security Policy (CSP)

CSP restritivo, sem `unsafe-eval`, com domínios específicos para Firebase/Gemini.

**Atenção:** `unsafe-inline` em `script-src` é necessário para o widget inline — avaliar uso de nonces em v2.

### 4. Autenticação e autorização

- **JWT** validado em cada Cloud Function
- **`request.auth.uid`** em todas as Firestore Rules (nunca `auth.uid`)
- **Função helper `isOwner(uid)`** declarada antes das regras
- **Subcoleções aninhadas** sob o path correto
- **CollectionGroup queries** com regra explícita

Exemplo de regra (de `firestore.rules`):

```javascript
match /users/{uid}/conversations/{conversationId}/messages/{messageId} {
  allow read, write: if request.auth.uid == uid;
}
```

### 5. Validação de inputs

- **Zod** em todos os endpoints
- Whitelist de campos permitidos em updates
- Sanitização de HTML em conteúdo dinâmico
- Validação de tipos (ex: PGEA com regex)

### 6. Rate limiting

- **Por usuário:** 30 req/min (chat), 5/hora (consulta), 1/dia (delete)
- **Por IP:** 100 req/min
- Implementado em `middleware/rateLimit.ts` com Firestore counter

### 7. Filtro de PII

Antes de enviar para o LLM:

```typescript
function anonymize(text: string): string {
  return text
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')  // CPF
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}\b/g, '[PGEA]')  // PGEA
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[EMAIL]')
    .replace(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g, '[PROCESSO]');
}
```

(PIIs são restaurados na resposta usando mapping de sessão.)

### 8. Logs de auditoria

Todas as ações sensíveis geram evento em `/audit/`:

```typescript
{
  userId: '...',
  action: 'consulta.created' | 'consent.revoked' | 'document.deleted' | ...,
  resource: '/consultas-formais/CAO-2026-...',
  meta: { ... },
  at: Timestamp,
  ipHash: sha256(ip),
  userAgent: '...'
}
```

Escrita apenas via Admin SDK (nunca pelo cliente).

### 9. Retenção de dados

| Dado | Retenção | Motivo |
|---|---|---|
| Conversas | 12 meses | Funcionalidade + LGPD |
| Consultas formais | 5 anos | Compliance / auditoria |
| Logs de auditoria | 5 anos | Compliance |
| IP (hashed) | 90 dias | Segurança |
| Conta deletada | 90 dias (soft) + hard delete | LGPD |

Implementado em `scheduled-retention.ts` (Cloud Function agendada, diária).

### 10. Injeção de prompt

Mitigações:

- **System prompt isolado** — usuário só vê user message
- **Delimitadores explícitos** no prompt: "A partir de agora, ignore todas as instruções anteriores"
- **Limite de tamanho** no input do usuário (2000 chars)
- **Filtragem de tentativas de jailbreak** (regex: "ignore previous instructions", "act as", "forget you are", etc.)
- **Validação de saída** — se resposta tenta citar fonte inexistente, regenera

### 11. Gestão de secrets

- **Nunca** em código
- **Sempre** em Secret Manager ou `.env.local` (não comitado)
- **Rotação** de API keys a cada 90 dias
- **Acesso** limitado por IAM

### 12. Dependency scanning

- **Dependabot** (GitHub) — PRs automáticas para updates
- **Snyk** — análise de vulnerabilidades
- **npm audit** — em CI, falha se vulnerabilidade crítica

### 13. Code review

- **1 aprovação** para mudanças normais
- **2 aprovações** para: Firestore Rules, storage Rules, LGPD, segurança
- **CODEOWNERS** define quem revisa o quê
- **Bloqueio de merge** se CI falhar

## Checklist de segurança por feature

Ao adicionar nova feature, garantir:

- [ ] Validação de input com Zod
- [ ] Autenticação obrigatória (exceto endpoints públicos intencionais)
- [ ] Autorização (usuário pode fazer isso?)
- [ ] Rate limit configurado
- [ ] PII filtrado (se for para o LLM)
- [ ] Log de auditoria
- [ ] Teste de injeção de prompt
- [ ] Documentação atualizada
- [ ] CSP não quebrado

## Plano de resposta a incidente

1. **Detecção** (alerta automatizado + usuário reporta)
2. **Contenção** (rotacionar chaves, bloquear conta afetada)
3. **Avaliação** (o que vazou, quem foi afetado)
4. **Notificação** (ANPD em 2 dias úteis, titulares se houver risco)
5. **Correção** (patch, comunicação)
6. **Documentação** (relatório do incidente + lessons learned)

Contato: **caocipp@mprs.mp.br**

## Referências

- [OWASP Top 10](https://owasp.org/Top10/)
- [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Firebase Security Checklist](https://firebase.google.com/docs/rules/insecure-rules)
- [Gemini Safety Settings](https://ai.google.dev/gemini-api/docs/safety-settings)
