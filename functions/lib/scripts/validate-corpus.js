#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Valida o corpus (mesmo script do CLI, mas rodável de dentro de functions/).
 */
const validation_1 = require("../services/validation");
(0, validation_1.validateCorpus)()
    .then((result) => process.exit(result.ok ? 0 : 1))
    .catch((err) => {
    console.error('💥', err);
    process.exit(1);
});
//# sourceMappingURL=validate-corpus.js.map