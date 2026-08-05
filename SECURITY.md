# Política de Segurança

## Reportando uma vulnerabilidade

**NÃO abra issue pública** para reportar vulnerabilidades de segurança.

Em vez disso, envie um e-mail para:

📧 **caocipp@mprs.mp.br**

Inclua:
- Descrição da vulnerabilidade
- Passos para reproduzir
- Impacto potencial
- Qualquer POC (Proof of Concept)

### O que esperar

- **Confirmação de recebimento:** em até 3 dias úteis
- **Avaliação inicial:** em até 7 dias úteis
- **Updates periódicos:** a cada 14 dias até resolução
- **Disclosure coordenado:** após correção em produção

## Versões suportadas

| Versão | Suporte |
|---|---|
| Última major (v1.x) | ✅ Suporte completo |
| Penúltima major (v0.x) | ⚠️ Apenas correções de segurança |
| Mais antigas | ❌ Sem suporte |

## Medidas de segurança implementadas

- TLS 1.3 em todas as conexões
- Firebase Auth com tokens JWT
- Firestore Rules com `request.auth.uid`
- Validação Zod em todos os inputs
- Filtro de PII antes de enviar para o LLM
- Rate limiting em todas as Cloud Functions
- Logs de auditoria de todas as ações sensíveis
- CSP/HSTS/X-Frame-Options configurados
- Retenção automática de dados (LGPD)
- Backups criptografados
- Dependency scanning (Dependabot + Snyk)

## Boas práticas para contribuidores

- Nunca commitar secrets (use `.env.local` e `.gitignore`)
- Sempre validar inputs do usuário
- Sempre usar `request.auth.uid` em Firestore Rules (nunca `auth.uid`)
- Sempre escapar HTML em conteúdo dinâmico
- Sempre verificar ownership antes de operações destrutivas
- Reportar dependências com vulnerabilidades conhecidas

## Reconhecimentos

Mantemos uma lista de contribuidores que reportaram vulnerabilidades (com permissão) em [SECURITY_ACKNOWLEDGMENTS.md](SECURITY_ACKNOWLEDGMENTS.md).
