/**
 * Conteúdo explicativo das configurações de LLM, mostrado nos InfoModals.
 * Centralizado para reuso em `/admin` e `/settings`.
 */

import type React from 'react'

export function TemperatureInfo() {
  return (
    <div>
      <p style={{ margin: '0 0 10px' }}>
        <strong>Temperatura</strong> controla o quanto o modelo arrisca na escolha de cada palavra.
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Valor</th>
            <th style={thStyle}>Comportamento</th>
            <th style={thStyle}>Quando usar</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}><code>0.0</code></td><td style={tdStyle}>Modo robô — escolhe sempre a palavra mais provável</td><td style={tdStyle}>Respostas consistentes, repetitivas, seguras</td></tr>
          <tr><td style={tdStyle}><code>0.1–0.3</code></td><td style={tdStyle}>Conservador</td><td style={tdStyle}><strong>Documentos jurídicos (recomendado)</strong></td></tr>
          <tr><td style={tdStyle}><code>0.7</code></td><td style={tdStyle}>Padrão</td><td style={tdStyle}>Equilíbrio entre coerência e variação</td></tr>
          <tr><td style={tdStyle}><code>1.0+</code></td><td style={tdStyle}>Criativo</td><td style={tdStyle}>Mais diversidade, arrisca mais</td></tr>
          <tr><td style={tdStyle}><code>2.0</code></td><td style={tdStyle}>Caos</td><td style={tdStyle}>Quase aleatório, geralmente inútil</td></tr>
        </tbody>
      </table>
      <p style={{ marginTop: 10, color: '#6b7280', fontSize: 11 }}>
        💡 <strong>Dica para o Cofrito:</strong> mantenha entre <strong>0.1 e 0.3</strong> para análises e peças
        jurídicas. Quanto mais baixa a temperatura, mais o modelo vai &ldquo;puxar&rdquo; o que tem no corpus em vez
        de alucinar uma redação bonita mas furada.
      </p>
    </div>
  )
}

export function MaxTokensInfo() {
  return (
    <div>
      <p style={{ margin: '0 0 10px' }}>
        <strong>Max tokens</strong> é o tamanho máximo da resposta, em tokens.
        1 token ≈ 0,75 palavras em PT-BR (ou ~4 caracteres).
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Tokens</th>
            <th style={thStyle}>Palavras</th>
            <th style={thStyle}>O que cabe</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}><code>200</code></td><td style={tdStyle}>~150</td><td style={tdStyle}>1 parágrafo curto</td></tr>
          <tr><td style={tdStyle}><code>500</code></td><td style={tdStyle}>~375</td><td style={tdStyle}>1 página A4</td></tr>
          <tr><td style={tdStyle}><code>1.000</code></td><td style={tdStyle}>~750</td><td style={tdStyle}>2–3 páginas</td></tr>
          <tr><td style={tdStyle}><code>2.000</code></td><td style={tdStyle}>~1.500</td><td style={tdStyle}>5–6 páginas (parecer médio)</td></tr>
          <tr><td style={tdStyle}><code>4.000</code></td><td style={tdStyle}>~3.000</td><td style={tdStyle}>10+ páginas (minuta longa)</td></tr>
        </tbody>
      </table>
      <p style={{ marginTop: 10, color: '#6b7280', fontSize: 11 }}>
        ⚠️ <strong>Atenção:</strong> max_tokens é o <em>teto</em> do que será gerado, não o quanto será
        gerado. Se a resposta vier cortada no meio, é só aumentar.
      </p>
      <p style={{ marginTop: 6, color: '#6b7280', fontSize: 11 }}>
        💡 <strong>Padrão recomendado:</strong> 2.000 (cabe a maioria das respostas). Para minutas
        completas, suba para 4.000.
      </p>
    </div>
  )
}

export function ContextInfo() {
  return (
    <div>
      <p style={{ margin: '0 0 10px' }}>
        <strong>Contexto</strong> é o tamanho máximo da soma de tudo que entra no modelo
        (system prompt + pergunta + histórico + documentos anexados + resposta gerada).
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Modelo</th>
            <th style={thStyle}>Contexto típico</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}>Gemini 2.5 Pro / Flash</td><td style={tdStyle}><strong>1–2M</strong> tokens (≈ 2.000 páginas)</td></tr>
          <tr><td style={tdStyle}>Claude Sonnet 4 / Opus 4</td><td style={tdStyle}><strong>200k</strong> (≈ 400 páginas)</td></tr>
          <tr><td style={tdStyle}>GPT-4.1 / GPT-4o</td><td style={tdStyle}><strong>128k–1M</strong></td></tr>
          <tr><td style={tdStyle}>DeepSeek V3 / R1</td><td style={tdStyle}><strong>64k–128k</strong></td></tr>
          <tr><td style={tdStyle}>Llama 3.1 (geral)</td><td style={tdStyle}><strong>128k</strong></td></tr>
        </tbody>
      </table>
      <p style={{ marginTop: 10, color: '#6b7280', fontSize: 11 }}>
        💡 <strong>Regra prática:</strong> 100k tokens ≈ 75 mil palavras ≈ 150 páginas A4. Para
        documentos jurídicos longos (inquéritos, processos), prefira modelos com <strong>≥ 200k</strong>.
      </p>
    </div>
  )
}

export function PricingInfo() {
  return (
    <div>
      <p style={{ margin: '0 0 10px' }}>
        <strong>Preços</strong> são exibidos em <strong>R$</strong> por <strong>1 milhão de tokens</strong>,
        convertidos do valor oficial em USD (taxa de referência: R$ 5,70 por US$ 1,00).
      </p>
      <p style={{ margin: '0 0 10px' }}>
        <strong>In</strong> = tokens de entrada (input): o que você envia (pergunta, contexto, histórico).<br />
        <strong>Out</strong> = tokens de saída (output): o que o modelo gera como resposta.
      </p>
      <p style={{ margin: '0 0 10px', color: '#374151' }}>
        <strong>Como estimar o custo de uma conversa:</strong>
      </p>
      <pre style={preStyle}>
{`custo ≈ (tokens_entrada × preço_in + tokens_saída × preço_out) / 1.000.000

Exemplo (Gemini 2.5 Flash):
  5.000 tokens in × R$ 0,0017/1k + 1.500 tokens out × R$ 0,014/1k
  = R$ 0,0085 + R$ 0,021
  ≈ R$ 0,03 por conversa
`}
      </pre>
      <p style={{ marginTop: 10, color: '#6b7280', fontSize: 11 }}>
        💡 <strong>Dica:</strong> modelos com ✦ GRÁTIS custam literalmente R$ 0,00 por conversa.
        Ótimos para triagem e testes.
      </p>
    </div>
  )
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
  fontFamily: 'inherit',
  marginTop: 6,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: 10,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 11,
  color: '#374151',
  verticalAlign: 'top',
}

const preStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: 10,
  fontSize: 11,
  fontFamily: 'ui-monospace, monospace',
  color: '#0f172a',
  whiteSpace: 'pre-wrap',
  margin: 0,
}
