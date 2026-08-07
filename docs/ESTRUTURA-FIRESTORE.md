# Estrutura do Firestore — Cofrito

> Documentação da estrutura de paths do Firestore.
> Garantia: dados 100% isolados por usuário. Sem mistura.

---

## Diagrama geral

```
firestore/
│
├── users/{uid}/                          ← DADOS DO PRÓPRIO USER
│   ├── (doc principal)                   ← perfil básico + consent
│   ├── profile/main                      ← perfil detalhado
│   ├── settings/                         ← configs pessoais
│   │   ├── llm                           ← LLM pessoal do user
│   │   ├── preferences                   ← tema, idioma, etc
│   │   └── (outros)                      ← extensível
│   ├── conversations/{cid}/
│   │   └── messages/{mid}                ← histórico de chat
│   └── feedback/{fid}                    ← feedback de mensagens
│
├── admins/{uid}/                         ← DADOS PESSOAIS DO ADMIN
│   └── settings/                         ← configs pessoais (separadas das globais)
│       ├── llm                           ← LLM pessoal do admin
│       └── preferences
│
├── admin-config/                         ← CONFIG GLOBAL (só master)
│   └── llm/                              ← LLM global (sobrescreve user)
│
├── corpus/                               ← ACERVO (público autenticado)
│   ├── documents/{docId}/
│   │   └── chunks/{chunkId}              ← chunks de documentos seed
│   ├── sources/{sourceId}                ← metadados de fontes (pastas, links, redes)
│   └── uploaded/{docId}/
│       └── chunks/{chunkId}              ← uploads manuais do admin
│
├── consultas-formais/{cid}               ← consultas abertas pelo user
│
├── audit/{aid}                           ← auditoria (somente leitura por admin)
│
├── feature-flags/{flag}                  ← flags de funcionalidade
│
└── system/{doc}                          ← agregações, métricas
```

---

## Princípios de isolamento

### 1. **User só acessa seus próprios dados**

```firestore-rules
match /users/{uid} {
  allow read, write: if isOwner(uid);  // uid == request.auth.uid
  ...
  match /conversations/{cid} {
    allow read, write: if isOwner(uid);
    match /messages/{mid} {
      allow read, write: if isOwner(uid);
    }
  }
  match /settings/{settingId} {
    allow read, write: if isOwner(uid);
  }
}
```

- `users/{uid}/conversations/{cid}/messages/{mid}` — 3 níveis de aninhamento
- `users/{uid}/settings/llm` — config pessoal, isolada
- **Nenhum outro user lê ou escreve**

### 2. **Admin master pode tudo; admin comum pode quase tudo; user não pode em paths admin**

```firestore-rules
function isAdmin() {
  return exists(/databases/$(database)/documents/admins/$(request.auth.uid));
}

function isAdminMaster() {
  return isAdmin() && get(...).data.role == 'master';
}

match /admin-config/{configId} {
  allow read: if isAdmin();
  allow write: if isAdminMaster();  // só master edita
}

match /admin-config/llm/{settingId} {
  allow read: if isAdmin();
  allow write: if isAdminMaster();
}
```

### 3. **Corpus é leitura pública (autenticado), escrita só admin**

```firestore-rules
match /corpus/{document=**} {
  allow read: if hasAcceptedConsent();
  allow write: if isAdmin();
}
```

- Qualquer user com consent pode **ler** o acervo (fonte do RAG)
- Apenas admin pode **escrever** (ingestão de documentos)

### 4. **Deny-by-default**

Qualquer path não especificada explicitamente = **DENY**. Não há vazamento.

---

## Campos validados

### `users/{uid}` (update)
- ✅ `displayName`, `preferences`, `lastSeen`, `unidade`, `areasAtuacao`
- ❌ Qualquer outro campo é rejeitado

### `users/{uid}/settings/llm`
- ✅ `provider`, `model`, `apiKey`, `enabled`, `updatedAt`
- ❌ Qualquer outro campo é rejeitado

### `admins/{uid}/settings/llm`
- ✅ Mesmos campos do user (separação entre pessoal e global)

### `admin-config/llm/{settingId}`
- ✅ Apenas admin master escreve
- Qualquer admin lê

### `consultas-formais/{cid}` (create)
- ✅ `protocol`, `userId`, `assunto`, `questaoObjetiva`, `createdAt`, `status`
- ✅ `userId == request.auth.uid` (não pode criar em nome de outro)
- ✅ `questaoObjetiva.size() >= 20`
- ✅ `assunto.size() >= 5`

---

## Configurações de LLM (preparado para Fase 5)

| Path | Quem escreve | Quem lê | Para quê |
|---|---|---|---|
| `users/{uid}/settings/llm` | próprio user | próprio user | LLM pessoal do user |
| `admins/{uid}/settings/llm` | próprio admin (pessoal) | próprio admin | LLM pessoal do admin (separado do global) |
| `admin-config/llm` | admin master | todos os admins | LLM global (sobrescreve user quando ativo) |

### Hierarquia de resolução (a implementar)

1. Se `admin-config/llm.enabled == true` → usar admin-config (todos)
2. Senão, se `users/{uid}/settings/llm.enabled == true` → usar user settings
3. Senão, fallback para env `GEMINI_API_KEY` (padrão)

---

## Como criar o primeiro admin master

```bash
# No Firebase Console → Firestore → Data → Start collection
# Collection: "admins"
# Document ID: <seu-uid-do-firebase-auth>
# Campos:
#   role: "master"
#   createdAt: <timestamp>
#   displayName: "Flavio Salamone"
#   email: "seu@email.com"
```

Após criar, o `request.auth.uid` precisa ser o mesmo do Firebase Auth. Para pegar seu UID:

1. Login em https://cofrito.web.app
2. Abra DevTools → Console
3. Rode: `firebase.auth().currentUser.uid` (se tiver SDK)
4. OU: Firebase Console → Authentication → Users → copie o User UID

---

## Como verificar que está tudo OK

```bash
# Como user comum (não admin), tente ler /admins/SEU_UID
# Resultado esperado: PERMISSION_DENIED (porque a regra diz só owner pode ler)

# Como user comum, tente ler /users/OUTRO_UID
# Resultado esperado: PERMISSION_DENIED

# Como user comum, leia /corpus/documents/algum-doc
# Resultado esperado: OK (se tem consent)

# Como user comum, escreva em /corpus
# Resultado esperado: PERMISSION_DENIED
```

---

## Próximas regras a adicionar (Fase 2)

- `admin-config/llm` com schema validado (provider, model, apiKey, enabled)
- `admin-config/features` para feature flags globais
- `users/{uid}/conversations/{cid}/messages/{mid}/feedback` para feedback por mensagem
