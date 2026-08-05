#!/usr/bin/env node
/**
 * Valida o corpus (mesmo script do CLI, mas rodável de dentro de functions/).
 */
import { validateCorpus } from '../services/validation'

validateCorpus()
  .then((result) => process.exit(result.ok ? 0 : 1))
  .catch((err) => {
    console.error('💥', err)
    process.exit(1)
  })
