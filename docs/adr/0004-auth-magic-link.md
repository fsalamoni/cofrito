# ADR-0004: Autenticação via Magic Link (Firebase Auth)

- **Status:** Aceito
- **Data:** 2026-08-05
- **Decisor(es):** Equipe técnica
- **Contexto:** Escolha do método de autenticação

## Contexto

O Cofrito precisa autenticar usuários para:
- Manter histórico por usuário
- Personalizar atendimento
- Abrir consulta formal
- Cumprir LGPD (rastreabilidade)

O sistema será usado principalmente por **Promotores de Justiça do MPRS**, com e-mail institucional `@mp.rs.gov.br`.

Requisitos:
- Baixa fricção (não atrapalhar o uso)
- Seguro (sem senhas fracas, sem vazamentos)
- Compatível com TI MPRS (que pode ter IdP próprio no futuro)
- Rastreável (quem fez o quê)
- LGPD-friendly

## Decisão

Adotamos **Firebase Auth com Magic Link** (link de login por e-mail) como método principal na v1.

Futuro (v2): considerar **OAuth com Google institucional** (restringir a `@mp.rs.gov.br`) se a TI MPRS configurar.

## Alternativas consideradas

### E-mail + senha
- **Prós:** Padrão conhecido
- **Contra:** Senhas fracas, fricção de cadastro, recuperação de senha
- **Decisão:** rejeitado — magic link elimina senhas

### OAuth Google (@mp.rs.gov.br)
- **Prós:** Identidade forte, UX excelente
- **Contra:** Exige configuração do Google Workspace MPRS
- **Decisão:** adiar para v2 — depende de TI MPRS

### OAuth com IdP do MPRS (SAML/OIDC)
- **Prós:** Padrão corporativo, integra com AD
- **Contra:** Não temos IdP documentado; complexo de configurar
- **Decisão:** adiar para v3+

### Anônimo (sem login)
- **Prós:** Zero fricção
- **Contra:** Sem personalização real, sem histórico por usuário
- **Decisão:** rejeitado — não atende requisito de personalização

### Telefone (SMS)
- **Prós:** Familiar
- **Contra:** Custo por SMS, friction em telefone corporativo
- **Decisão:** rejeitado — e-mail é mais natural para Promotores

## Fluxo de login

```
1. Usuário digita e-mail
2. Firebase envia e-mail com link único (15 min de validade)
3. Usuário clica no link → automaticamente autenticado
4. Token JWT armazenado (seguro, httpOnly se possível)
5. Redirect para a página original
```

## Segurança

- Link único (não reutilizável)
- Validade de 15 minutos
- Rate limit: 5 e-mails/hora por endereço
- Token JWT verificado em cada Cloud Function
- Refresh automático em background

## LGPD

- E-mail é o único dado coletado no login
- Consentimento explícito no primeiro acesso (banner)
- Usuário pode apagar conta a qualquer momento
- Logs de auditoria de logins

## Migração futura para Google institucional

Quando TI MPRS configurar Google Workspace institucional:

```typescript
// services/auth.ts
const provider = new GoogleAuthProvider();
provider.setHostedDomain('mp.rs.gov.br'); // restringe a @mp.rs.gov.br
```

Permitirá:
- Login com conta institucional
- Single Sign-On (SSO)
- Restrição a domínio (importante para segurança)

## Consequências

### Positivas
- Zero fricção (sem senha para lembrar)
- Seguro (link único, curta validade)
- Funciona em qualquer e-mail
- Migração para Google é trivial

### Negativas
- Depende de e-mail (se o usuário não tem acesso ao e-mail, não consegue entrar)
- Pode cair em spam
- Atrasa ~10-30s (envio do e-mail)

### Mitigações
- Mostrar mensagem clara: "verifique sua caixa de entrada"
- Adicionar link "reenviar e-mail"
- Configurar SPF/DKIM do domínio (Resend faz isso)
- Em v2, considerar login via certificado digital ICP-Brasil
