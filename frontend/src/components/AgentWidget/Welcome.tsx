/**
 * Welcome — mensagem de boas-vindas com sugestões.
 */
import { useProfile } from '@/hooks/useProfile'
import { AgentAvatar } from './AgentAvatar'

const SUGGESTIONS = [
  'O que é o CAOCIPP?',
  'Como faço uma consulta formal?',
  'Qual a tese sobre nepotismo?',
  'O que mudou na Lei de Improbidade?',
  'Quais os prazos para consulta?',
]

interface WelcomeProps {
  onSuggestion: (q: string) => void
}

export function Welcome({ onSuggestion }: WelcomeProps) {
  const { data: profile } = useProfile()

  const areas = profile?.areasInferidas || []
  const personalized =
    areas.length > 0
      ? `Vejo que você costuma pesquisar sobre **${areas.slice(0, 2).join(' e ')}**.`
      : ''

  return (
    <div className="cofrito-welcome">
      <AgentAvatar size="lg" state="happy" />
      <h3 className="cofrito-welcome-title">
        Olá{profile?.displayName ? `, ${profile.displayName}` : ''}! 👋
      </h3>
      {personalized && <p className="cofrito-welcome-personalized">{personalized}</p>}
      <p className="cofrito-welcome-text">
        Sou o <strong>Cofrito</strong>, assistente do Centro de Apoio Operacional Cível e do
        Patrimônio Público (CAOCIPP) do MP/RS. Posso ajudá-lo(a) a localizar material
        institucional — atos normativos, teses, modelos de parecer, legislação e FAQ.
      </p>
      <p className="cofrito-welcome-question">Como posso ajudar hoje?</p>
      <div className="cofrito-suggestions">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSuggestion(q)}
            className="cofrito-suggestion"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
