# Integração com a Página Oficial do MPRS

> Como o Cofrito é embarcado na página do CAOCIPP.

---

## Visão geral

A integração com a página oficial do MPRS segue **3 fases evolutivas**, com a TI MPRS.

### Fase 1 — Subdomínio dedicado (v1.0)
### Fase 2 — Web Component embarcado (v1.1)
### Fase 3 — Integração profunda (v2.0)

---

## Fase 1 — Subdomínio dedicado

**Como funciona:**

- Página independente em `cofrito.caocipp.mp.rs.gov.br`
- Botão "Conversar com o Cofrito" na página oficial do CAOCIPP leva ao subdomínio
- Hospedagem no Firebase Hosting do MPRS
- Zero impacto na página oficial

**Para implementar:**

1. Configurar DNS: `cofrito.caocipp.mp.rs.gov.br` → Firebase Hosting
2. Deploy da aplicação no domínio
3. (TI MPRS) Adicionar botão na página oficial do CAOCIPP:

```html
<a href="https://cofrito.caocipp.mp.rs.gov.br/" target="_blank" rel="noopener">
  Conversar com o Cofrito
</a>
```

**Vantagens:**
- Zero impacto na página oficial
- Independente, fácil de remover
- Não precisa de aprovação técnica da TI MPRS

**Desvantagens:**
- UX "quebrada" (usuário sai da página oficial)
- Não é "embarcado"

---

## Fase 2 — Web Component embarcado (v1.1)

**Como funciona:**

O Cofrito é distribuído como **Web Component** (Custom Element) que pode ser embedado em qualquer página via tag `<script>`.

```html
<cofrito-widget tenant="caocipp" position="bottom-right" locale="pt-BR"></cofrito-widget>
<script src="https://cofrito.caocipp.mp.rs.gov.br/v1/cofrito.js" async></script>
```

**Características técnicas:**

- **Shadow DOM:** isola completamente estilos e IDs
- **Bundle único:** ~50KB gzipped
- **Auto-instanciação:** detecta `<cofrito-root>` ou cria um
- **API programática:** `window.Cofrito.open()`, `window.Cofrito.close()`

**Vantagens:**
- UX nativa (widget aparece na página)
- Independente (pode ser removido)
- Compatível com qualquer framework
- Atualizações transparentes

**Desvantagens:**
- Requer aprovação da TI MPRS
- Requer domínio customizado (HTTPS válido)
- CSP da página oficial precisa permitir nosso domínio

**Para implementar:**

1. Build do widget standalone: `npm run build:widget` (gera `cofrito.js`)
2. Host do widget em `https://cofrito.caocipp.mp.rs.gov.br/v1/cofrito.js`
3. TI MPRS adiciona na página oficial:

```html
<!-- Antes do </body> -->
<cofrito-widget tenant="caocipp" position="bottom-right"></cofrito-widget>
<script src="https://cofrito.caocipp.mp.rs.gov.br/v1/cofrito.js" async></script>
```

4. CSP da página oficial é atualizado para liberar:
   - `script-src` para o domínio do widget
   - `connect-src` para Firebase/Gemini
   - `frame-src` se usar iframe

---

## Fase 3 — Integração profunda (v2.0, futuro)

Possibilidades:

- App nativo na intranet do MPRS
- Integração com SSO institucional
- Identidade visual 100% MPRS (sem "Powered by Cofrito")
- API de eventos para analytics institucional
- Integração com PGEA (criar consulta direto no sistema oficial)

Depende de evolução da governança de TI do MPRS.

---

## Compatibilidade técnica

### A página oficial (`intra.mp.rs.gov.br/site/areas/caocivel/`)

- jQuery, Bootstrap 3, Font Awesome
- Layout fixo
- Menu lateral azul
- Sem CSP custom (provavelmente)

### O que verificar antes de embarcar

- [ ] CSP atual (se houver)
- [ ] Quaisquer scripts que possam conflitar
- [ ] Posicionamento (canto inferior direito? sobrepõe "Achei!"?)
- [ ] Responsividade em mobile
- [ ] Cores harmonizam com a identidade visual
- [ ] Performance (tempo de carregamento do widget)

### Shadow DOM

Usamos Shadow DOM para isolar:

```typescript
class CofritoElement extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' })
    shadow.innerHTML = `<style>...</style><div id="root"></div>`
  }
}
```

Benefícios:
- CSS do widget não vaza para a página
- CSS da página não vaza para o widget
- IDs do widget não conflitam com a página
- Eventos ficam isolados

---

## Aprovações necessárias

Antes de embarcar (Fase 2), obter:

- [ ] **Coordenação CAOCIPP** — autorização
- [ ] **Comunicação MPRS** — validação visual
- [ ] **TI MPRS** — aprovação técnica + decisão de domínio
- [ ] **DPO MPRS** — conformidade LGPD
- [ ] **Procuradoria MPRS** — termo de uso
- [ ] **Administração Superior** — autorização final

---

## Plano de rollout

```
Fase 1: 100% dos usuários vão para subdomínio (opt-in)
  ↓ mede uso, feedback, bugs
Fase 2: Widget embarcado em 10% das páginas (A/B test)
  ↓ mede conversão, satisfação
Fase 3: Widget embarcado em 50% das páginas
  ↓ expande
Fase 4: 100% das páginas têm o widget
```

Cada fase:
- Duração: 2-4 semanas
- Monitoramento intensivo
- Comunicação aos usuários
- Plano de rollback pronto

---

## Compatibilidade com a página atual (verificações)

| Item | Status | Observação |
|---|---|---|
| jQuery | ✅ compatível | Widget não usa, mas página sim |
| Bootstrap 3 | ✅ compatível | Estilos isolados via Shadow DOM |
| Font Awesome | ✅ compatível | Widget não conflita |
| Layout fixo | ✅ compatível | Widget fica posicionado independentemente |
| "Achei!" (botão) | ⚠️ verificar | Widget abaixo ou acima? |
| Mobile | ⚠️ verificar | Bottom sheet? |
| Cookies | ✅ compatível | Magic Link não usa cookies |
| CSP | ⚠️ verificar | Liberar domínios Firebase |

---

## Migração de dados

Quando migrar da Fase 1 para Fase 2:
- Conversas dos usuários são preservadas (Firestore)
- Não precisa de ação do usuário
- Magic Link continua funcionando
- Apenas a UX muda (de subdomínio para widget embarcado)

---

## Rollback

Em qualquer fase:

### Fase 1
```bash
# Desativar o subdomínio (no DNS ou no Firebase Hosting)
firebase hosting:disable --project prod
```

### Fase 2
```bash
# Pedir para TI MPRS remover as tags da página oficial
# (não é possível fazer pelo Cofrito)
```

### Bundle isolado
```bash
# O bundle cofrito.js é hospedado em Firebase Hosting
# Remover do hosting desativa o widget em todos os sites
```

---

## Suporte pós-integração

- Equipe de operação continua a mesma
- Logs continuam os mesmos
- Adicionar: métrica de "uso por origem" (subdomínio vs embarcado)
- Suporte aos usuários finais: canal único

---

Próximo: [`00-PLANEJAMENTO-COMPLETO.md`](00-PLANEJAMENTO-COMPLETO.md) (volta ao início).
