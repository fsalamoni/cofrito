# ADR-0007: Estratégia de Integração com a Página Oficial do MPRS

- **Status:** Aceito
- **Data:** 2026-08-05
- **Decisor(es):** Equipe técnica + TI MPRS
- **Contexto:** Como o Cofrito será embarcado na página oficial do CAOCIPP

## Contexto

O Cofrito precisa rodar na página oficial do CAOCIPP (intra.mp.rs.gov.br ou mprs.mp.br), mas:
- Não podemos (no momento) alterar a página oficial
- TI MPRS tem governança própria
- A página tem identidade visual, CSP, cookies próprios
- A integração definitiva depende de aprovação de várias instâncias

## Decisão

Adotamos abordagem em **3 fases**, começando com baixo acoplamento e evoluindo para integração total.

### Fase 1 (v1.0) — Subdomínio dedicado (link)

**Como:** Página independente em `cofrito.caocipp.mp.rs.gov.br` (ou URL temporária).

**Acesso:** Botão "Conversar com o Cofrito" na página oficial leva ao subdomínio.

**Vantagens:**
- Zero impacto na página oficial
- Independente, fácil de remover
- Não precisa de aprovação da TI MPRS para o widget
- Pode ser hospedado em Firebase Hosting próprio

**Desvantagens:**
- UX "quebrada" (usuário sai da página oficial)
- Não é "embarcado"
- Menos discoverable

### Fase 2 (v1.1) — Widget embarcado via Web Component

**Como:** TI MPRS adiciona em `intra.mp.rs.gov.br/site/areas/caocivel/`:

```html
<cofrito-widget tenant="caocipp" position="bottom-right" locale="pt-BR"></cofrito-widget>
<script src="https://cofrito.caocipp.mp.rs.gov.br/v1/cofrito.js" async></script>
```

**Como funciona:**
- O bundle `cofrito.js` é um Web Component (Custom Element) com Shadow DOM
- Shadow DOM isola completamente estilos e IDs
- Não interfere com jQuery, Bootstrap, ou outros scripts da página
- Carrega de forma assíncrona (`async`)

**Vantagens:**
- UX nativa (widget aparece na página)
- Independente (pode ser removido)
- Compatível com qualquer framework
- Atualizações transparentes (basta atualizar o bundle)

**Desvantagens:**
- Requer aprovação da TI MPRS
- Requer domínio customizado (HTTPS válido)
- CSP da página oficial precisa permitir nosso domínio

### Fase 3 (v2.0) — Integração profunda (futuro)

**Possibilidades:**
- App nativo na intranet
- Integração com SSO do MPRS
- Identidade visual 100% MPRS (sem "Powered by Cofrito")
- API de eventos para analytics institucional

**Depende de:** evolução da governança de TI do MPRS.

## Compatibilidade técnica

### Shadow DOM

Usamos Shadow DOM para isolar o widget:

```typescript
class CofritoWidget extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>...</style><div id="root"></div>`;
    // render React dentro do shadow root
  }
}
customElements.define('cofrito-widget', CofritoWidget);
```

**Benefícios:**
- CSS do widget não vaza para a página
- CSS da página não vaza para o widget
- IDs do widget não conflitam com IDs da página
- Eventos ficam isolados (com `composed: false`)

### CSP (Content Security Policy)

A página oficial provavelmente tem CSP restritivo. O widget precisa funcionar com:

```
script-src 'self' https://cofrito.caocipp.mp.rs.gov.br
connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com
frame-src https://*.firebaseapp.com
img-src 'self' data: https: blob:
style-src 'self' 'unsafe-inline'
```

**Não** precisa de:
- `unsafe-eval`
- `unsafe-inline` em script-src (graças ao bundler)
- Cross-origin custom

### Bundle size

| Item | Tamanho (gzip) |
|---|---|
| cofrito.js (React + widget) | ~50KB |
| cofrito.css | ~5KB |
| cofrito assets (imagens) | ~30KB |
| **Total** | **~85KB** |

Muito abaixo do limite recomendado (200KB).

### Performance

- **First load:** < 1.5s para widget interativo
- **Subsequent loads:** < 500ms (cache HTTP imutável)
- **Lazy loading:** widget só inicializa quando visível
- **Code splitting:** features opcionais carregam sob demanda

## Compatibilidade com a página atual

A página oficial do CAOCIPP (`intra.mp.rs.gov.br/site/areas/caocivel/`) usa:
- jQuery
- Bootstrap 3
- Font Awesome
- Layout fixo (largura limitada)
- Menu lateral azul

**Cuidados:**
- Não duplicar widget no canto (espaço já ocupado pelo menu "Achei!")
- Posicionar onde não conflite visualmente
- Em mobile, usar bottom sheet (não flutuante)
- Cores devem harmonizar (azul institucional)

**Posições possíveis:**
- Canto inferior direito (padrão atual do protótipo)
- Botão "Achei!" substituído por "Cofrito"
- Aba lateral expansível
- Modal ao clicar em "Ajuda"

**Recomendação:** canto inferior direito, abaixo do "Achei!", com z-index superior.

## Aprovações necessárias

Antes da Fase 2:

1. **Coordenação CAOCIPP** — autorização
2. **Comunicação MPRS** — validação visual
3. **TI MPRS** — aprovação técnica + decisão de domínio
4. **DPO MPRS** — conformidade LGPD
5. **Procuradoria MPRS** — termo de uso

## Migração gradual

```
Fase 1: 100% dos usuários vão para subdomínio (opt-in)
  ↓ mede uso, feedback, bugs
Fase 2: Widget embarcado em 10% das páginas (A/B test)
  ↓ mede conversão, satisfação
Fase 3: Widget embarcado em 50% das páginas
  ↓ expande
Fase 4: 100% das páginas têm o widget
```

## Rollback

- **Fase 1:** tirar o link da página oficial (5 min)
- **Fase 2:** remover a tag `<script>` da página (5 min)
- **Bundle** hospedado em Firebase Hosting → pode desativar (instantâneo)

## Consequências

### Positivas
- Abordagem faseada reduz risco
- Web Component é o padrão da web (compatível com qualquer página)
- Shadow DOM elimina conflitos de estilo
- Rollback rápido em qualquer fase

### Negativas
- Fase 1 não é UX "embarcada" (link externo)
- Fase 2 depende de aprovação da TI MPRS
- CSP da página oficial pode bloquear (negociação necessária)
