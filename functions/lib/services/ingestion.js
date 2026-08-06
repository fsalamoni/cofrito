"use strict";
/**
 * Ingestion service — pipeline completo de ingestão de documentos.
 *
 * Pipeline:
 *  1. Parse (markdown, docx, pdf, html)
 *  2. Limpeza
 *  3. Chunking
 *  4. Embedding
 *  5. Persistência no Firestore
 *  6. Validação
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIngestion = runIngestion;
const firestore_1 = require("firebase-admin/firestore");
const gray_matter_1 = __importDefault(require("gray-matter"));
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const chunking_1 = require("../utils/chunking");
const embeddings_1 = require("./embeddings");
const VALID_TYPES = [
    'ato',
    'tese',
    'parecer',
    'legislacao',
    'template',
    'doutrina',
    'faq',
    'manual',
    'manual-institucional',
    'jurisprudencia',
];
const EMBEDDING_COST_PER_1M_TOKENS = 0.025; // Gemini text-embedding-004
async function runIngestion(opts) {
    const start = Date.now();
    const errors = [];
    let documentsProcessed = 0;
    let chunksCreated = 0;
    let totalTokens = 0;
    const dataDir = opts.dataDir || path.join(process.cwd(), 'data', 'raw');
    const files = await listMarkdownFiles(dataDir);
    const db = (0, firestore_1.getFirestore)();
    for (const file of files) {
        try {
            const fileContent = await fs.readFile(file, 'utf-8');
            const { data: meta, content: body } = (0, gray_matter_1.default)(fileContent);
            // Validação
            const validated = validateFrontMatter(meta);
            if (!validated.valid) {
                errors.push({ file, error: `Frontmatter inválido: ${validated.error}` });
                continue;
            }
            const fm = validated.data;
            // 1. Divide em seções (por H2) e chunking
            const sections = splitBySection(body);
            const allChunks = [];
            for (const sec of sections) {
                const chunks = (0, chunking_1.chunkText)(sec.content, {
                    maxTokens: 1000,
                    overlapTokens: 200,
                    section: sec.title,
                });
                allChunks.push(...chunks);
            }
            // 2. Upsert documento
            const docId = sanitizeDocId(path.basename(file, '.md'));
            const docRef = db.doc(`corpus/documents/${docId}`);
            await docRef.set({
                id: docId,
                title: fm.title,
                type: fm.type,
                date: fm.date ? new Date(fm.date) : null,
                source: fm.source ?? null,
                url: fm.url ?? null,
                area: fm.area,
                tags: fm.tags,
                version: fm.version ?? 1,
                status: fm.status ?? 'ativo',
                fullText: body,
                summary: extractSummary(body),
                createdAt: firestore_1.Timestamp.now(),
                updatedAt: firestore_1.Timestamp.now(),
                createdBy: 'ingestion',
            }, { merge: true });
            // 3. Remove chunks antigos
            const oldChunks = await docRef.collection('chunks').listDocuments();
            await Promise.all(oldChunks.map((r) => r.delete()));
            // 4. Gera embeddings e cria chunks
            const texts = allChunks.map((c) => c.text);
            const embeddings = await (0, embeddings_1.embedBatch)(texts, opts.apiKey);
            for (let i = 0; i < allChunks.length; i++) {
                const chunk = allChunks[i];
                const vector = embeddings[i].vector;
                const chunkId = `chunk-${i}`;
                await docRef.collection('chunks').doc(chunkId).set({
                    text: chunk.text,
                    section: chunk.section,
                    position: i,
                    tokens: chunk.tokens,
                    embedding: firestore_1.FieldValue.vector(vector),
                    type: fm.type,
                    area: fm.area,
                    tags: fm.tags,
                    date: fm.date ? new Date(fm.date) : null,
                    status: fm.status ?? 'ativo',
                    createdAt: firestore_1.Timestamp.now(),
                });
                totalTokens += chunk.tokens;
            }
            documentsProcessed++;
            chunksCreated += allChunks.length;
            console.log(`✅ ${docId}: ${allChunks.length} chunks, ~${totalTokens} tokens`);
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            errors.push({ file, error });
            console.error(`❌ ${file}: ${error}`);
        }
    }
    const totalTimeMs = Date.now() - start;
    const estimatedCostUsd = (totalTokens / 1_000_000) * EMBEDDING_COST_PER_1M_TOKENS;
    return {
        documentsProcessed,
        chunksCreated,
        errors,
        totalTimeMs,
        estimatedCostUsd,
    };
}
function validateFrontMatter(meta) {
    if (!meta || typeof meta !== 'object') {
        return { valid: false, error: 'Frontmatter ausente' };
    }
    const fm = meta;
    if (!fm.title || typeof fm.title !== 'string') {
        return { valid: false, error: 'title ausente ou inválido' };
    }
    if (!fm.type || !VALID_TYPES.includes(fm.type)) {
        return { valid: false, error: `type inválido (esperado: ${VALID_TYPES.join(', ')})` };
    }
    const area = Array.isArray(fm.area) ? fm.area : fm.area ? [fm.area] : [];
    const tags = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [];
    return {
        valid: true,
        data: {
            title: fm.title,
            type: fm.type,
            date: fm.date,
            source: fm.source,
            url: fm.url,
            area: area,
            tags: tags,
            version: typeof fm.version === 'number' ? fm.version : undefined,
            status: fm.status,
            review: fm.review,
        },
    };
}
function splitBySection(text) {
    const lines = text.split('\n');
    const sections = [
        { title: '', content: '', lines: [] },
    ];
    for (const line of lines) {
        if (line.startsWith('## ') || line.startsWith('# ')) {
            sections.push({
                title: line.replace(/^#+\s*/, '').trim(),
                content: '',
                lines: [],
            });
        }
        else {
            sections[sections.length - 1].lines.push(line);
        }
    }
    return sections
        .filter((s) => s.lines.length > 0)
        .map((s) => ({ title: s.title, content: s.lines.join('\n').trim() }));
}
function extractSummary(text, maxLength = 200) {
    const clean = text.replace(/^#.*$/gm, '').replace(/\n+/g, ' ').trim();
    return clean.length > maxLength ? clean.slice(0, maxLength) + '...' : clean;
}
function sanitizeDocId(name) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
async function listMarkdownFiles(dir) {
    const result = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const sub = await listMarkdownFiles(fullPath);
            result.push(...sub);
        }
        else if (entry.name.endsWith('.md')) {
            result.push(fullPath);
        }
    }
    return result;
}
//# sourceMappingURL=ingestion.js.map