// The same email HTML lives in three places: the DB (`body_html`, written by the
// migration), the edge function's in-code fallback, and the editor's compiler.
// They drifted before — the editor's compiled output dropped the footer the real
// templates had, and customers stopped receiving it. These tests are the guard:
// all three must be the exact output of compileBlocks(SEED_CONTENT[key]).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileBlocks } from './compile'
import { SEED_CONTENT } from './seed-content'
import { renderTemplate } from './render'
import { SAMPLE_DATA } from './catalog'
import type { EmailTemplateKey } from './blocks'

const ROOT = resolve(__dirname, '../../..')
const FALLBACKS = readFileSync(resolve(ROOT, 'supabase/functions/_shared/email-templates.ts'), 'utf8')
const MIGRATION = readFileSync(
  resolve(ROOT, 'supabase/migrations/20260714170000_email_depot_slip_redesign.sql'),
  'utf8',
)

const KEYS = Object.keys(SEED_CONTENT) as EmailTemplateKey[]
/** customer_invited has no DB row — it is served by the in-code fallback only. */
const SEEDED_IN_DB = KEYS.filter((k) => k !== 'customer_invited')

describe('email fidelity — one design, three copies', () => {
  it.each(KEYS)('the edge fallback for %s is the compiled seed', (key) => {
    const constName = `${key.toUpperCase()}_HTML`
    const m = new RegExp(`const ${constName} = \`([\\s\\S]*?)\`\\n`).exec(FALLBACKS)
    expect(m, `${constName} missing from the edge module`).toBeTruthy()
    expect(m![1]).toBe(compileBlocks(SEED_CONTENT[key]))
  })

  // Split into statements first — matching `body_html … where key` across the
  // whole file would let one statement's HTML pair with a later statement's key.
  const statements = MIGRATION.split('update public.email_templates').slice(1)

  it.each(SEEDED_IN_DB)('the migration body_html for %s is the compiled seed', (key) => {
    const stmt = statements.find((s) => s.includes(`where key = '${key}';`))
    expect(stmt, `no migration update for ${key}`).toBeTruthy()

    const html = /set body_html = \$tpl\$\n([\s\S]*?)\n\$tpl\$,/.exec(stmt!)
    expect(html, `no body_html in the ${key} update`).toBeTruthy()
    expect(html![1]).toBe(compileBlocks(SEED_CONTENT[key]))
  })

  it.each(SEEDED_IN_DB)('the migration content doc for %s is the seed doc', (key) => {
    const stmt = statements.find((s) => s.includes(`where key = '${key}';`))!
    const json = /content   = \$json\$\n([\s\S]*?)\n\$json\$::jsonb/.exec(stmt)
    expect(json, `no content doc in the ${key} update`).toBeTruthy()
    expect(JSON.parse(json![1])).toEqual(SEED_CONTENT[key])
  })
})

describe('email rendering', () => {
  it.each(KEYS)('%s renders against its sample data with no leftover tokens', (key) => {
    const html = renderTemplate(compileBlocks(SEED_CONTENT[key]), SAMPLE_DATA[key])
    expect(html).not.toMatch(/\{\{/)
    expect(html.length).toBeGreaterThan(1000)
  })

  it('reserves green for delivered, and uses cargo orange everywhere else', () => {
    const GREEN = '#3b9555'
    const completed = compileBlocks(SEED_CONTENT.package_completed)
    expect(completed).toContain(GREEN)

    for (const key of KEYS.filter((k) => k !== 'package_completed')) {
      expect(compileBlocks(SEED_CONTENT[key]), `${key} must not use the delivered green`).not.toContain(GREEN)
    }
  })

  it('drops the review QR from the invite, which has nothing to review yet', () => {
    expect(compileBlocks(SEED_CONTENT.customer_invited)).not.toContain('review_qr_code_url')
    expect(compileBlocks(SEED_CONTENT.package_completed)).toContain('review_qr_code_url')
  })
})
