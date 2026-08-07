/**
 * Welcome — tela inicial do chat, com sugestões.
 */
import { FileText, Scale, BookOpen, MessageCircle, Sparkles } from 'lucide-react'

interface WelcomeProps {
  onSuggestion: (text: string) => void
  userName?: string
}

const SUGGESTIONS = [
  {
    icon: <FileText size={16} />,
    title: 'O que é o CAOCIPP?',
    text: 'O que é o CAOCIPP e quais suas atribuições?',
  },
  {
    icon: <Scale size={16} />,
    title: 'Tese sobre improbidade',
    text: 'Qual a tese do CAOCIPP sobre improbidade administrativa?',
  },
  {
    icon: <BookOpen size={16} />,
    title: 'Como abrir consulta',
    text: 'Como faço para abrir uma consulta formal ao CAOCIPP?',
  },
  {
    icon: <MessageCircle size={16} />,
    title: 'Modelo de parecer',
    text: 'Como é o modelo de parecer técnico-jurídico do CAOCIPP?',
  },
]

export function Welcome({ onSuggestion, userName }: WelcomeProps) {
  const greeting = userName
    ? `Olá, ${userName.split(' ')[0]}!`
    : 'Olá!'

  return (
    <div style={containerStyle}>
      <div style={heroStyle}>
        <div style={badgeStyle}>
          <Sparkles size={12} />
          <span>Assistente institucional</span>
        </div>
        <h1 style={titleStyle}>{greeting}</h1>
        <p style={subtitleStyle}>
          Sou o <strong>Cofrito</strong>, assistente do Centro de Apoio Operacional
          Cível e do Patrimônio Público. Posso ajudar você a localizar teses, atos,
          modelos e procedimentos do CAOCIPP.
        </p>
      </div>

      <div style={suggestionsLabelStyle}>Sugestões para começar</div>
      <div style={suggestionsStyle}>
        {SUGGESTIONS.map((s, i) => (
          <button key={i} onClick={() => onSuggestion(s.text)} style={suggestionBtnStyle}>
            <div style={suggestionIconStyle}>{s.icon}</div>
            <div>
              <div style={suggestionTitleStyle}>{s.title}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={tipStyle}>
        <strong>💡 Dica:</strong> respostas são fundamentadas em material do acervo
        do CAOCIPP, com citação da fonte. Se precisar de análise específica, abra
        uma consulta formal.
      </div>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  padding: '32px 20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const heroStyle: React.CSSProperties = {
  textAlign: 'left',
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#eef2ff',
  color: '#1a4d8f',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 500,
  marginBottom: 12,
}

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 6px',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#475569',
  margin: 0,
  lineHeight: 1.6,
}

const suggestionsLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: '#6b7280',
  marginTop: 8,
}

const suggestionsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 8,
}

const suggestionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 10,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  transition: 'all 0.15s',
}

const suggestionIconStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: '#eef2ff',
  color: '#1a4d8f',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const suggestionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#0f172a',
  lineHeight: 1.3,
}

const tipStyle: React.CSSProperties = {
  background: '#f0f9ff',
  border: '1px solid #bae6fd',
  borderRadius: 8,
  padding: 10,
  fontSize: 11,
  color: '#0c4a6e',
  lineHeight: 1.5,
  marginTop: 4,
}
