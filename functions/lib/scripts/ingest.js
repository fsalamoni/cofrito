#!/usr/bin/env node
"use strict";
/**
 * Script CLI de ingestão.
 * Uso:
 *   GEMINI_API_KEY=xxx GOOGLE_APPLICATION_CREDENTIALS=./sa.json npm run ingest
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
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
dotenv.config();
const app_1 = require("firebase-admin/app");
const ingestion_1 = require("../services/ingestion");
async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY não definida.');
        console.error('   Defina no .env.local ou passe como variável de ambiente.');
        process.exit(1);
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
        console.error('❌ GOOGLE_APPLICATION_CREDENTIALS não definida.');
        console.error('   Baixe o service account JSON do Firebase Console e aponte para ele.');
        process.exit(1);
    }
    if ((0, app_1.getApps)().length === 0) {
        (0, app_1.initializeApp)({
            credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
                ? (0, app_1.cert)(process.env.GOOGLE_APPLICATION_CREDENTIALS)
                : undefined,
        });
    }
    console.log('🚀 Iniciando ingestão...\n');
    const result = await (0, ingestion_1.runIngestion)({ apiKey, source: 'cli' });
    console.log('\n📊 Resumo:');
    console.log(`   - Documentos processados: ${result.documentsProcessed}`);
    console.log(`   - Chunks criados: ${result.chunksCreated}`);
    console.log(`   - Tempo total: ${(result.totalTimeMs / 1000).toFixed(1)}s`);
    console.log(`   - Custo estimado: $${result.estimatedCostUsd.toFixed(4)}`);
    if (result.errors.length > 0) {
        console.log(`\n⚠️  Erros (${result.errors.length}):`);
        for (const e of result.errors) {
            console.log(`   - ${e.file}: ${e.error}`);
        }
        process.exit(1);
    }
    console.log('\n✅ Ingestão concluída.');
    process.exit(0);
}
main().catch((err) => {
    console.error('💥 Erro fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=ingest.js.map