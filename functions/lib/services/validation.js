"use strict";
/**
 * Validação do corpus (frontmatter, completude).
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
exports.validateCorpus = validateCorpus;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
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
async function validateCorpus(dataDir) {
    const dir = dataDir || path.join(process.cwd(), 'data', 'raw');
    const files = await listMarkdownFiles(dir);
    let errors = 0;
    let warnings = 0;
    console.log(`📚 Encontrados ${files.length} arquivos em ${dir}\n`);
    for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const { data, content: body } = (0, gray_matter_1.default)(content);
        const issues = [];
        if (!data.title)
            issues.push('title ausente');
        if (!data.type || !VALID_TYPES.includes(data.type)) {
            issues.push(`type inválido: "${data.type}"`);
        }
        if (!data.area)
            issues.push('area ausente (recomendado)');
        if (!data.tags)
            issues.push('tags ausentes (recomendado)');
        if (body.trim().length < 100)
            issues.push('conteúdo muito curto');
        if (issues.length > 0) {
            console.log(`📄 ${path.relative(process.cwd(), file)}`);
            for (const issue of issues) {
                const isError = issue.includes('inválido') || issue.includes('ausente') && !issue.includes('recomendado');
                console.log(`   ${isError ? '❌' : '⚠️ '}  ${issue}`);
                if (isError)
                    errors++;
                else
                    warnings++;
            }
        }
    }
    console.log(`\n✅ ${files.length} arquivos analisados. Erros: ${errors}, Avisos: ${warnings}`);
    return { ok: errors === 0, errors, warnings };
}
async function listMarkdownFiles(dir) {
    const result = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'README.md')
            continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...(await listMarkdownFiles(fullPath)));
        }
        else if (entry.name.endsWith('.md')) {
            result.push(fullPath);
        }
    }
    return result;
}
//# sourceMappingURL=validation.js.map