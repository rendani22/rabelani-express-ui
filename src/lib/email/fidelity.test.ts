// The same email HTML lives in three places: the DB (`body_html`, written by the
// migration), the edge function's in-code fallback, and the editor's compiler.
// They drifted before — the editor's compiled output dropped the footer the real
// templates had, and customers stopped receiving it. These tests are the guard:
// all three must be the exact output of compileBlocks(SEED_CONTENT[key]).

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileBlocks } from './compile'
import { SEED_CONTENT } from './seed-content'
import { renderTemplate } from './render'
import { SAMPLE_DATA } from './catalog'
import type { EmailTemplateKey } from './blocks'

const ROOT = resolve(__dirname, '../../..')
const FALLBACKS = readFileSync(resolve(ROOT, 'supabase/functions/_shared/email-templates.ts'), 'utf8')

// Migrations replay in filename order, so a key's LAST write is what the DB
// actually ends up serving — that, not any one file, is what must match the
// seed. Pinning a single migration would go stale the next time a template is
// re-seeded, and the stale file can no longer be edited once it has been applied.
const MIGRATIONS = resolve(ROOT, 'supabase/migrations')

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
  const statements = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .flatMap((f) =>
      readFileSync(resolve(MIGRATIONS, f), 'utf8').split('update public.email_templates').slice(1),
    )

  /** The winning write for a key: the last one that actually seeds a template. */
  const latestSeedOf = (key: EmailTemplateKey) =>
    statements.filter((s) => s.includes(`where key = '${key}';`) && s.includes('set body_html = $tpl$')).at(-1)

  it.each(SEEDED_IN_DB)('the migration body_html for %s is the compiled seed', (key) => {
    const stmt = latestSeedOf(key)
    expect(stmt, `no migration update for ${key}`).toBeTruthy()

    const html = /set body_html = \$tpl\$\n([\s\S]*?)\n\$tpl\$,/.exec(stmt!)
    expect(html, `no body_html in the ${key} update`).toBeTruthy()
    expect(html![1]).toBe(compileBlocks(SEED_CONTENT[key]))
  })

  it.each(SEEDED_IN_DB)('the migration content doc for %s is the seed doc', (key) => {
    const stmt = latestSeedOf(key)!
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

  // The customer's notes have to survive to the two emails that bracket the
  // handover — a note left at registration is worthless if it is gone by the
  // time they come to collect.
  it.each(['package_registered', 'package_ready_for_collection', 'package_completed', 'package_contents_updated'] as const)(
    '%s renders the customer notes callout, gated so it collapses when blank',
    (key) => {
      const html = compileBlocks(SEED_CONTENT[key])
      expect(html).toContain('{{#notes}}')
      expect(html).toContain('{{notes}}')
      expect(html).toContain('{{/notes}}')

      const blank = renderTemplate(html, { ...SAMPLE_DATA[key], notes: '' })
      expect(blank).not.toContain('Notes')
    },
  )

  it('drops the review QR from the invite, which has nothing to review yet', () => {
    expect(compileBlocks(SEED_CONTENT.customer_invited)).not.toContain('review_qr_code_url')
    expect(compileBlocks(SEED_CONTENT.package_completed)).toContain('review_qr_code_url')
  })
})
