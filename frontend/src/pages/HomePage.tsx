/**
 * HomePage — ambiente principal do site.
 *
 * Simula a página institucional do CAOCIPP/MP-RS que o widget
 * será futuramente embarcado. Serve de "fundo" sobre o qual
 * o chat flutua, demonstrando como será a integração visual
 * sem atrapalhar a navegação ao fundo.
 */
import { useState } from 'react'
import { AgentWidget } from '@/components/AgentWidget'
import { useProfile } from '@/hooks/useProfile'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useIsAdminMaster } from '@/hooks/useAdminStatus'
import { FileText, Scale, BookOpen, MessageCircle, LogOut, Search, ChevronRight, Mail, Phone, MapPin, ExternalLink, Settings as SettingsIcon, Shield } from 'lucide-react'

export function HomePage() {
  const { data: profile, isError } = useProfile()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const openChat = useChatStore((s) => s.open)
  const isAdminMaster = useIsAdminMaster()
  const [searchQuery, setSearchQuery] = useState('')

  if (isError) {
    console.warn('Falha ao carregar perfil (esperado se Cloud Function offline)')
  }

  return (
    <div style={pageStyle}>
      {/* Header institucional */}
      <header style={headerStyle}>
        <div style={headerInnerStyle}>
          <div style={brandStyle}>
            <div style={brandMarkStyle}>MPRS</div>
            <div>
              <div style={brandTitleStyle}>Ministério Público do Estado</div>
              <div style={brandSubtitleStyle}>do Rio Grande do Sul</div>
            </div>
          </div>
          <nav style={navStyle}>
            <a href="#inicio" style={navLinkStyle}>Início</a>
            <a href="#institucional" style={navLinkStyle}>Institucional</a>
            <a href="#atos" style={navLinkStyle}>Atos Normativos</a>
            <a href="#teses" style={navLinkStyle}>Teses</a>
            <a href="#modelos" style={navLinkStyle}>Modelos</a>
            <a href="#consulta" style={navLinkStyle}>Consulta</a>
            <a href="#contato" style={navLinkStyle}>Contato</a>
          </nav>
          <div style={headerRightStyle}>
            {user ? (
              <>
                {isAdminMaster && (
                  <a href="#/admin" style={adminLinkStyle} title="Painel de Administração">
                    <Shield size={14} />
                    <span>Admin</span>
                  </a>
                )}
                <a href="#/settings" style={userLinkStyle} title="Configurações">
                  <SettingsIcon size={14} />
                  <span>Configurações</span>
                </a>
                <span style={userBadgeStyle}>
                  {profile?.displayName || user.email}
                </span>
                <button onClick={signOut} style={signOutBtnStyle} title="Sair">
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <span style={guestBadgeStyle}>Visitante</span>
            )}
          </div>
        </div>
      </header>

      {/* Sub-header com busca + atalho pro chat */}
      <div style={subheaderStyle}>
        <div style={subheaderInnerStyle}>
          <div style={breadcrumbStyle}>
            <span>Início</span>
            <ChevronRight size={14} />
            <span style={{ color: '#1a4d8f', fontWeight: 600 }}>Centro de Apoio Cível e do Patrimônio Público</span>
          </div>
          <div style={subheaderRightStyle}>
            <div style={searchBoxStyle}>
              <Search size={16} color="#6b7280" />
              <input
                type="search"
                placeholder="Buscar no site…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={searchInputStyle}
              />
            </div>
            <button onClick={openChat} style={openChatBtnStyle}>
              <MessageCircle size={16} />
              Perguntar ao Cofrito
            </button>
          </div>
        </div>
      </div>

      <main style={mainStyle}>
        {/* Hero */}
        <section id="inicio" style={heroStyle}>
          <div style={heroContentStyle}>
            <div style={heroEyebrowStyle}>Centro de Apoio Operacional</div>
            <h1 style={heroTitleStyle}>
              Cível e do <span style={{ color: '#5B7CFA' }}>Patrimônio Público</span>
            </h1>
            <p style={heroSubtitleStyle}>
              Apoio técnico-jurídico aos Promotores de Justiça do MP-RS nas áreas cível
              e do patrimônio público. Localize rapidamente teses, atos normativos,
              modelos de peças e jurisprudência consolidada.
            </p>
            <div style={heroActionsStyle}>
              <button onClick={openChat} style={heroPrimaryBtnStyle}>
                <MessageCircle size={18} />
                Conversar com o Cofrito
              </button>
              <a href="#consulta" style={heroSecondaryBtnStyle}>
                Abrir consulta formal
                <ChevronRight size={18} />
              </a>
            </div>
          </div>
          <div style={heroAsideStyle}>
            <div style={asideStatStyle}>
              <div style={asideStatNumberStyle}>12</div>
              <div style={asideStatLabelStyle}>atos e teses</div>
            </div>
            <div style={asideStatStyle}>
              <div style={asideStatNumberStyle}>7</div>
              <div style={asideStatLabelStyle}>áreas de atuação</div>
            </div>
            <div style={asideStatStyle}>
              <div style={asideStatNumberStyle}>24/7</div>
              <div style={asideStatLabelStyle}>disponível</div>
            </div>
          </div>
        </section>

        {/* Cards de atalhos */}
        <section id="institucional" style={sectionStyle}>
          <SectionHeader
            title="Acesso rápido"
            subtitle="Tópicos mais procurados no acervo do CAOCIPP"
          />
          <div style={cardsGridStyle}>
            <ShortcutCard
              icon={<FileText size={24} />}
              title="Atos normativos"
              description="Provimentos, ordens de serviço e resoluções do MP-RS"
              onClick={openChat}
            />
            <ShortcutCard
              icon={<Scale size={24} />}
              title="Teses compiladas"
              description="Teses jurídicas em improbidade, patrimônio, licitações"
              onClick={openChat}
            />
            <ShortcutCard
              icon={<BookOpen size={24} />}
              title="Modelos de peças"
              description="Pareceres, notas técnicas, devoluções procedimentais"
              onClick={openChat}
            />
          </div>
        </section>

        {/* Seções âncora */}
        <section id="atos" style={sectionStyle}>
          <SectionHeader
            title="Atos normativos"
            subtitle="Documentos institucionais que regem a atividade do CAOCIPP"
          />
          <ul style={linkListStyle}>
            <li><a href="#ato-1" style={docLinkStyle}>Provimento PGJ nº 33/2017 <ExternalLink size={12} /></a> — Estrutura e finalidades do CAOCIPP</li>
            <li><a href="#ato-2" style={docLinkStyle}>Ordem de Serviço nº 002/2015 <ExternalLink size={12} /></a> — Procedimento para consulta ao Centro de Apoio</li>
            <li><a href="#ato-3" style={docLinkStyle}>Resolução 45/2023-PGJ <ExternalLink size={12} /></a> — LGPD aplicada ao MP-RS</li>
          </ul>
        </section>

        <section id="teses" style={sectionStyle}>
          <SectionHeader
            title="Teses jurídicas"
            subtitle="Compilação das teses mais consultadas pelos Promotores"
          />
          <ul style={linkListStyle}>
            <li><a href="#tese-1" style={docLinkStyle}>Nepotismo <ExternalLink size={12} /></a> — Limites e exceções</li>
            <li><a href="#tese-2" style={docLinkStyle}>Acumulação de cargos públicos <ExternalLink size={12} /></a> — Requisitos constitucionais</li>
            <li><a href="#tese-3" style={docLinkStyle}>Improbidade administrativa (Lei 14.230/2021) <ExternalLink size={12} /></a> — Elemento subjetivo</li>
            <li><a href="#tese-4" style={docLinkStyle}>Poder requisitório do MP <ExternalLink size={12} /></a> — Fundamentos e limites</li>
          </ul>
        </section>

        <section id="modelos" style={sectionStyle}>
          <SectionHeader
            title="Modelos de peças"
            subtitle="Templates para uso pelos Promotores em suas manifestações"
          />
          <ul style={linkListStyle}>
            <li><a href="#modelo-1" style={docLinkStyle}>Parecer técnico-jurídico <ExternalLink size={12} /></a> — Estrutura completa</li>
            <li><a href="#modelo-2" style={docLinkStyle}>Devolução procedimental <ExternalLink size={12} /></a> — Modelo padrão</li>
            <li><a href="#modelo-3" style={docLinkStyle}>Nota técnica <ExternalLink size={12} /></a> — Formato recomendado</li>
          </ul>
        </section>

        <section id="consulta" style={sectionStyle}>
          <SectionHeader
            title="Consulta formal ao CAOCIPP"
            subtitle="Quando o material do acervo não for suficiente"
          />
          <p style={paragraphStyle}>
            A consulta formal é o instrumento pelo qual o Promotor de Justiça submete
            caso específico à análise do Centro de Apoio. Prazo estimado de resposta:
            <strong> 5 a 15 dias úteis</strong>. O parecer é sugestivo, não vinculante
            (OS 002/2015, art. 5º).
          </p>
          <button onClick={openChat} style={primaryBtnStyle}>
            Iniciar consulta formal via chat
          </button>
        </section>

        <section id="contato" style={sectionStyle}>
          <SectionHeader title="Contato" subtitle="Como falar com o CAOCIPP" />
          <div style={contactGridStyle}>
            <ContactItem icon={<Mail size={20} />} label="E-mail" value="caocivel@mprs.mp.br" />
            <ContactItem icon={<Phone size={20} />} label="Telefone" value="(51) 3295-1024" />
            <ContactItem icon={<MapPin size={20} />} label="Endereço" value="Av. Aureliano de Figueiredo Pinto, 80 — Praia de Belas, Porto Alegre/RS" />
          </div>
        </section>
      </main>

      <footer style={footerStyle}>
        <div style={footerInnerStyle}>
          <div>
            <strong>Ministério Público do Estado do Rio Grande do Sul</strong>
            <br />
            Centro de Apoio Operacional Cível e do Patrimônio Público
          </div>
          <div style={footerNoteStyle}>
            <em>Demonstração: este ambiente simula a página institucional do MP-RS
            sobre a qual o Cofrito será futuramente embarcado.</em>
          </div>
        </div>
      </footer>

      {/* Chat widget flutuante, arrastável */}
      <AgentWidget defaultOpen={false} />
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={sectionHeaderStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {subtitle && <p style={sectionSubtitleStyle}>{subtitle}</p>}
    </div>
  )
}

function ShortcutCard({
  icon, title, description, onClick,
}: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={shortcutCardStyle}>
      <div style={shortcutIconStyle}>{icon}</div>
      <h3 style={shortcutTitleStyle}>{title}</h3>
      <p style={shortcutDescStyle}>{description}</p>
      <div style={shortcutArrowStyle}>
        <ChevronRight size={16} />
      </div>
    </button>
  )
}

function ContactItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={contactItemStyle}>
      <div style={contactIconStyle}>{icon}</div>
      <div>
        <div style={contactLabelStyle}>{label}</div>
        <div style={contactValueStyle}>{value}</div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f8fafc',
  color: '#1a1a1a',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  fontSize: 15,
  lineHeight: 1.6,
}

const headerStyle: React.CSSProperties = {
  background: '#ffffff',
  borderBottom: '1px solid #e5e7eb',
  position: 'sticky',
  top: 0,
  zIndex: 50,
}

const headerInnerStyle: React.CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  padding: '12px 32px',
  display: 'flex',
  alignItems: 'center',
  gap: 32,
}

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const brandMarkStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  background: '#1a4d8f',
  color: '#ffffff',
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: 0.5,
}

const brandTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1a1a1a',
  lineHeight: 1.2,
}

const brandSubtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  lineHeight: 1.2,
}

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: 24,
  flex: 1,
  justifyContent: 'center',
}

const navLinkStyle: React.CSSProperties = {
  color: '#374151',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 500,
}

const headerRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const userBadgeStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#374151',
  fontWeight: 500,
}

const guestBadgeStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  background: '#f3f4f6',
  padding: '4px 10px',
  borderRadius: 12,
}

const signOutBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: 6,
  cursor: 'pointer',
  color: '#6b7280',
  display: 'flex',
  alignItems: 'center',
}

const userLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '5px 10px',
  color: '#1a4d8f',
  fontSize: 12,
  fontWeight: 500,
  textDecoration: 'none',
  cursor: 'pointer',
}

const adminLinkStyle: React.CSSProperties = {
  ...userLinkStyle,
  background: '#1a4d8f',
  color: '#ffffff',
  border: '1px solid #1a4d8f',
}

const subheaderStyle: React.CSSProperties = {
  background: '#ffffff',
  borderBottom: '1px solid #e5e7eb',
}

const subheaderInnerStyle: React.CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  padding: '12px 32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
}

const breadcrumbStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  color: '#6b7280',
}

const subheaderRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const searchBoxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '6px 10px',
  width: 280,
}

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

const openChatBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const mainStyle: React.CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  padding: '48px 32px 80px',
}

const heroStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 48,
  alignItems: 'center',
  padding: '40px 0',
  marginBottom: 64,
  borderBottom: '1px solid #e5e7eb',
}

const heroContentStyle: React.CSSProperties = { minWidth: 0 }

const heroEyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: '#5B7CFA',
  marginBottom: 12,
}

const heroTitleStyle: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 16px',
  lineHeight: 1.15,
  letterSpacing: '-0.02em',
}

const heroSubtitleStyle: React.CSSProperties = {
  fontSize: 17,
  color: '#475569',
  maxWidth: 640,
  margin: '0 0 32px',
  lineHeight: 1.6,
}

const heroActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
}

const heroPrimaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 20px',
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: '0 4px 12px rgba(26, 77, 143, 0.25)',
}

const heroSecondaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '12px 16px',
  background: 'transparent',
  color: '#1a4d8f',
  textDecoration: 'none',
  fontSize: 15,
  fontWeight: 500,
}

const heroAsideStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  minWidth: 160,
}

const asideStatStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '8px 0',
}

const asideStatNumberStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: '#1a4d8f',
  lineHeight: 1,
}

const asideStatLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginTop: 4,
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 56,
  scrollMarginTop: 120,
}

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: 20,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: '#0f172a',
  margin: '0 0 4px',
}

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#64748b',
  margin: 0,
}

const cardsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16,
}

const shortcutCardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 24,
  textAlign: 'left',
  cursor: 'pointer',
  position: 'relative',
  fontFamily: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  transition: 'all 0.15s',
}

const shortcutIconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  background: '#eef2ff',
  color: '#1a4d8f',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 8,
}

const shortcutTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: '#0f172a',
  margin: 0,
}

const shortcutDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#64748b',
  margin: 0,
  lineHeight: 1.5,
}

const shortcutArrowStyle: React.CSSProperties = {
  position: 'absolute',
  top: 20,
  right: 20,
  color: '#9ca3af',
}

const linkListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gap: 8,
}

const docLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: '#1a4d8f',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 500,
  padding: '8px 0',
}

const paragraphStyle: React.CSSProperties = {
  fontSize: 15,
  color: '#374151',
  lineHeight: 1.6,
  margin: '0 0 16px',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 16px',
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const contactGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16,
}

const contactItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 16,
}

const contactIconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  background: '#eef2ff',
  color: '#1a4d8f',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const contactLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  fontWeight: 600,
  marginBottom: 2,
}

const contactValueStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#1a1a1a',
}

const footerStyle: React.CSSProperties = {
  background: '#0f172a',
  color: '#cbd5e1',
  padding: '32px',
  fontSize: 13,
  lineHeight: 1.7,
}

const footerInnerStyle: React.CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 24,
  flexWrap: 'wrap',
}

const footerNoteStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  maxWidth: 480,
  textAlign: 'right',
}
