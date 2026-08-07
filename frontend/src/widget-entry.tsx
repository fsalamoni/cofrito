/**
 * Entry point do widget embarcável.
 *
 * Gera um Web Component (<cofrito-widget>) que pode ser embedado
 * em qualquer página via tag <script>.
 *
 * Uso:
 *   <cofrito-widget tenant="caocipp" position="bottom-right" locale="pt-BR"></cofrito-widget>
 *   <script src="https://cofrito.caocipp.mp.rs.gov.br/v1/cofrito.js" async></script>
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AgentWidget } from './components/AgentWidget'
import './styles/widget.css'

class CofritoElement extends HTMLElement {
  private root: Root | null = null
  private tenant = 'caocipp'
  private position: 'bottom-right' | 'bottom-left' | 'bottom-center' = 'bottom-right'
  private locale = 'pt-BR'

  static get observedAttributes() {
    return ['tenant', 'position', 'locale']
  }

  connectedCallback() {
    this.tenant = this.getAttribute('tenant') || 'caocipp'
    this.position = (this.getAttribute('position') as any) || 'bottom-right'
    this.locale = this.getAttribute('locale') || 'pt-BR'

    // Usa Shadow DOM para isolar estilos
    const shadow = this.attachShadow({ mode: 'open' })
    const container = document.createElement('div')
    container.id = 'cofrito-shadow-root'
    shadow.appendChild(container)

    this.root = createRoot(container)
    this.root.render(
      <React.StrictMode>
        <AgentWidget tenant={this.tenant} position={this.position} locale={this.locale} />
      </React.StrictMode>,
    )
  }

  disconnectedCallback() {
    this.root?.unmount()
    this.root = null
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (!this.root) return
    if (name === 'position' && newValue) {
      this.position = newValue as any
    }
  }
}

if (!customElements.get('cofrito-widget')) {
  customElements.define('cofrito-widget', CofritoElement)
}

// Auto-instancia se houver <div id="cofrito-root"></div>
function autoInit() {
  if (document.getElementById('cofrito-root') && !document.querySelector('cofrito-widget')) {
    const widget = document.createElement('cofrito-widget')
    widget.setAttribute('tenant', 'caocipp')
    widget.setAttribute('position', 'bottom-right')
    widget.setAttribute('locale', 'pt-BR')
    document.body.appendChild(widget)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit)
} else {
  autoInit()
}

// Expõe API programática
(window as any).Cofrito = {
  open: () => {
    document.querySelector('cofrito-widget')?.dispatchEvent(new CustomEvent('cofrito:open'))
  },
  close: () => {
    document.querySelector('cofrito-widget')?.dispatchEvent(new CustomEvent('cofrito:close'))
  },
}
