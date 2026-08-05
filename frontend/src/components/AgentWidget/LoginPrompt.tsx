/**
 * LoginPrompt — tela de login (Magic Link) dentro do widget.
 */
import { useState } from 'react'
import { Mail, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useUIStore } from '@/stores/uiStore'

export function LoginPrompt() {
  const { signIn, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const pushToast = useUIStore((s) => s.pushToast)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    try {
      await signIn(email)
      setSent(true)
      pushToast('Link de acesso enviado para o seu e-mail', 'success')
    } catch (err: any) {
      pushToast(err.message || 'Erro ao enviar link', 'error')
    }
  }

  if (sent) {
    return (
      <div className="cofrito-login-sent">
        <h3>📬 Verifique sua caixa de entrada</h3>
        <p>
          Enviamos um link de acesso para <strong>{email}</strong>.
          <br />
          Clique no link para entrar.
        </p>
        <button onClick={() => setSent(false)} className="cofrito-link-btn">
          Usar outro e-mail
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="cofrito-login">
      <h3 className="cofrito-login-title">Entre para conversar</h3>
      <p className="cofrito-login-text">
        Informe seu e-mail. Enviaremos um link de acesso (sem senha).
      </p>
      <div className="cofrito-login-field">
        <Mail size={16} className="cofrito-login-icon" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu.email@mp.rs.gov.br"
          required
          autoComplete="email"
          aria-label="E-mail"
        />
      </div>
      <button type="submit" disabled={loading} className="cofrito-login-btn">
        {loading ? (
          <>
            <Loader2 size={16} className="cofrito-spin" /> Enviando...
          </>
        ) : (
          'Enviar link de acesso'
        )}
      </button>
      <p className="cofrito-login-terms">
        Ao entrar, você concorda com o{' '}
        <a href="/termos" target="_blank" rel="noopener">
          Termo de Uso
        </a>{' '}
        e a{' '}
        <a href="/privacidade" target="_blank" rel="noopener">
          Política de Privacidade
        </a>
        .
      </p>
    </form>
  )
}
