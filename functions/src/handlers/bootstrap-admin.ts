/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Handlers de bootstrap admin.
 *
 *  - bootstrapAdminMaster: o PRIMEIRO user logado a chamar vira master
 *    (só funciona se NENHUM master existir ainda)
 *
 *  - grantAdminByEmail: cria um admin doc para um email específico.
 *    Protegido por MASTER_BOOTSTRAP_SECRET (env var).
 *    Use este endpoint em emergency setup (curl) para garantir o master.
 *    Exemplo:
 *      curl -X POST .../grantAdminByEmail \
 *        -H "Content-Type: application/json" \
 *        -d '{"email":"fsalamoni@gmail.com","secret":"..."}'
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from '../services/firestore'
import { getAuth } from 'firebase-admin/auth'

// ── bootstrapAdminMaster (autenticado) ───────────────────────────────────

export const bootstrapAdminMaster = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const db = getFirestore()
  const uid = request.auth.uid

  // Lista todos os admins (sem filter) — sem índice composto necessário
  const allAdminsSnap = await db.collection('admins').limit(100).get()
  const existingMaster = allAdminsSnap.docs.find((d) => {
    const data = d.data() as any
    return data.role === 'master' && data.active !== false
  })
  if (existingMaster) {
    throw new HttpsError(
      'failed-precondition',
      `Já existe um master admin (${existingMaster.data().email || existingMaster.id}). Peça para ele te conceder acesso via /admin.`,
    )
  }

  // Buscar info do user
  const userDoc = await db.doc(`users/${uid}`).get()
  const userData = userDoc.data() as any
  const email = userData?.email ?? request.auth.token?.email ?? ''
  const displayName = userData?.displayName ?? email

  // Criar doc admin (master)
  await db.doc(`admins/${uid}`).set(
    {
      uid,
      email,
      displayName,
      role: 'master',
      active: true,
      grantedAt: FieldValue.serverTimestamp(),
      grantedBy: 'bootstrap',
    },
  )

  return { ok: true, message: 'Você agora é master admin.' }
})

// ── grantAdminByEmail (HTTP, protegido por secret) ──────────────────────

/**
 * Concede master admin para um email específico.
 * Pode ser chamado sem autenticação do Firebase, mas exige o secret.
 *
 * IMPORTANTE: usar apenas no setup inicial ou em emergências.
 * O secret deve estar configurado em:
 *   firebase functions:secrets:set MASTER_BOOTSTRAP_SECRET
 */
export const grantAdminByEmail = onRequest(
  { cors: true },
  async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Bootstrap-Secret')
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Use POST' })
      return
    }

    const { email, secret, role } = req.body as { email?: string; secret?: string; role?: string }

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'email obrigatório' })
      return
    }

    const expectedSecret = process.env.MASTER_BOOTSTRAP_SECRET
    if (!expectedSecret) {
      res.status(500).json({ error: 'MASTER_BOOTSTRAP_SECRET não configurado no servidor' })
      return
    }
    if (secret !== expectedSecret) {
      res.status(401).json({ error: 'secret inválido' })
      return
    }

    const finalRole = role === 'admin' ? 'admin' : 'master'

    try {
      const auth = getAuth()
      const db = getFirestore()

      // 1. Achar o user pelo email no Firebase Auth
      let userRecord
      try {
        userRecord = await auth.getUserByEmail(email)
      } catch (err: any) {
        res.status(404).json({
          error: `Usuário com email ${email} não existe no Firebase Auth ainda. Faça login pelo menos uma vez antes.`,
        })
        return
      }
      const uid = userRecord.uid

      // 2. Garantir que o doc user existe (pode ter sido criado via ensureUserDoc)
      const userDocRef = db.doc(`users/${uid}`)
      const userDoc = await userDocRef.get()
      if (!userDoc.exists) {
        await userDocRef.set({
          uid,
          email: userRecord.email || email,
          displayName: userRecord.displayName || email,
          institutionalEmail: email.endsWith('@mp.rs.gov.br') || email.endsWith('@mprs.mp.br'),
          role: 'externo',
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
          lastSeen: FieldValue.serverTimestamp(),
          consent: {
            acceptedAt: FieldValue.serverTimestamp(),
            version: '1.0',
            ipHash: '',
            userAgent: 'bootstrap',
          },
        })
      }

      // 3. Criar/atualizar doc admin
      await db.doc(`admins/${uid}`).set(
        {
          uid,
          email,
          displayName: userRecord.displayName || email,
          role: finalRole,
          active: true,
          grantedAt: FieldValue.serverTimestamp(),
          grantedBy: 'secret-bootstrap',
        },
      )

      res.status(200).json({
        ok: true,
        message: `Admin (${finalRole}) concedido para ${email}`,
        uid,
      })
    } catch (err: any) {
      console.error('grantAdminByEmail erro:', err)
      res.status(500).json({ error: err.message || 'Erro interno' })
    }
  },
)
