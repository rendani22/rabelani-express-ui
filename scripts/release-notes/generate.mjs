#!/usr/bin/env node
// Release-notes generator.
//
// Reads a git commit range, distills the feat/fix commits that landed, asks an
// LLM to (a) classify each into one of the frozen application pages and (b)
// rewrite the engineer's commit subject into a business-facing sentence, then
// renders grouped markdown.
//
// Design guarantees:
//  - NEVER throws on the happy path failing: if the LLM is unavailable or errors,
//    it falls back to deterministic path-glob classification + a cleaned subject,
//    so a `dev -> main` merge is never blocked by this script.
//  - Deterministic dedup: a squash-merge commit carries `(#123)`; those are keyed
//    by PR number so the same feature is never counted as both a PR and a commit.
//  - Revert pairs cancel out within the release window.
//
// Usage:
//   node scripts/release-notes/generate.mjs --range=<A>..<B> --mode=draft|final \
//        [--out=RELEASE_NOTES.md] [--version=v1.2.0] [--date=2026-07-15]
//
// Env:
//   ANTHROPIC_API_KEY     required for AI rewrite; absent => deterministic fallback
//   RELEASE_NOTES_MODEL   default 'claude-sonnet-5'

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/)
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]
  }),
)
const RANGE = args.range
const MODE = args.mode === 'final' ? 'final' : 'draft'
const OUT = args.out || null
if (!RANGE) {
  console.error('error: --range=<A>..<B> is required')
  process.exit(2)
}

// ---------- helpers ----------
function git(cliArgs) {
  return execFileSync('git', cliArgs, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

const RECORD_SEP = '\x1e'
const FIELD_SEP = '\x1f'

// Conventional-commit types we surface. Everything else is noise.
const FEATURE_TYPES = new Set(['feat'])
const FIX_TYPES = new Set(['fix'])

function parseConventional(subject) {
  // type(scope)!: description
  const m = subject.match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/)
  if (!m) return null
  return { type: m[1].toLowerCase(), scope: m[2] || null, breaking: !!m[3], description: m[4].trim() }
}

function prNumber(subject) {
  const m = subject.match(/\(#(\d+)\)\s*$/)
  return m ? m[1] : null
}

function stripPrSuffix(subject) {
  return subject.replace(/\s*\(#\d+\)\s*$/, '').trim()
}

// ---------- collect commits ----------
function collectCommits() {
  let raw
  try {
    raw = git(['log', '--no-merges', `--pretty=format:%H${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`, RANGE])
  } catch (e) {
    console.error(`error: git log failed for range ${RANGE}: ${e.message}`)
    process.exit(2)
  }
  return raw
    .split(RECORD_SEP)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [hash, subject, body = ''] = r.split(FIELD_SEP)
      return { hash: hash.trim(), subject: (subject || '').trim(), body: body.trim() }
    })
}

function changedFiles(hash) {
  try {
    return git(['show', '--name-only', '--pretty=format:', hash])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

// ---------- taxonomy ----------
const taxonomy = JSON.parse(readFileSync(join(REPO_ROOT, '.github', 'release-pages.json'), 'utf8'))
const PAGES = taxonomy.pages
const UNDER_THE_HOOD = taxonomy.underTheHoodLabel || 'Under the hood'
const PAGE_NAMES = new Set(PAGES.map((p) => p.name))

// Deterministic page guess from changed files: the page whose path prefixes
// match the most files wins. Used as a hint for the LLM and as the fallback.
function guessPage(files) {
  let best = null
  let bestScore = 0
  for (const page of PAGES) {
    let score = 0
    for (const f of files) {
      for (const prefix of page.paths) {
        if (f.startsWith(prefix)) {
          score++
          break
        }
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = page.name
    }
  }
  return bestScore > 0 ? best : UNDER_THE_HOOD
}

// ---------- build the item list (filter, dedup, cancel reverts) ----------
function buildItems() {
  const commits = collectCommits()

  // 1) Cancel revert pairs: a "revert:" or 'Revert "X"' removes the matching X.
  const revertedSubjects = new Set()
  for (const c of commits) {
    const conv = parseConventional(c.subject)
    if (conv && conv.type === 'revert') {
      // conventional: `revert: <original subject>`
      revertedSubjects.add(stripPrSuffix(conv.description))
    }
    const m = c.subject.match(/^Revert "(.+)"$/)
    if (m) revertedSubjects.add(stripPrSuffix(m[1]))
  }

  const seenPr = new Set()
  const seenSubject = new Set()
  const items = []

  for (const c of commits) {
    const conv = parseConventional(c.subject)
    if (!conv) continue
    const isFeature = FEATURE_TYPES.has(conv.type)
    const isFix = FIX_TYPES.has(conv.type)
    if (!isFeature && !isFix) continue // drops chore/refactor/test/build/ci/docs/style/revert/etc.

    const cleanSubject = stripPrSuffix(conv.description)
    if (revertedSubjects.has(cleanSubject)) continue // reverted within the window

    // Dedup: PR squash commit -> key by PR number; direct commit -> key by subject.
    const pr = prNumber(c.subject)
    if (pr) {
      if (seenPr.has(pr)) continue
      seenPr.add(pr)
    } else {
      const key = `${conv.type}:${cleanSubject.toLowerCase()}`
      if (seenSubject.has(key)) continue
      seenSubject.add(key)
    }

    const files = changedFiles(c.hash)
    items.push({
      hash: c.hash,
      kind: isFeature ? 'feature' : 'fix',
      type: conv.type,
      scope: conv.scope,
      breaking: conv.breaking,
      rawSubject: cleanSubject,
      pr,
      files,
      guessedPage: guessPage(files),
    })
  }
  return items
}

// ---------- AI classify + rewrite (with deterministic fallback) ----------
async function enrich(items) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || items.length === 0) {
    return items.map((it) => ({ ...it, page: it.guessedPage, headline: fallbackHeadline(it) }))
  }

  const model = process.env.RELEASE_NOTES_MODEL || 'claude-sonnet-5'
  const pageList = PAGES.map((p) => `- ${p.name}`).join('\n')
  const payload = items.map((it, i) => ({
    id: i,
    kind: it.kind,
    subject: it.rawSubject,
    suggested_page: it.guessedPage,
    files: it.files.slice(0, 12),
  }))

  const prompt = `You are writing customer-facing release notes for "Dispatch", a delivery and package-management dashboard.

For EACH change below, do two things:
1. "page": assign it to exactly ONE of these application pages (use the exact name). Prefer "suggested_page" unless the subject/files clearly indicate another page. If it is purely internal (build, CI, tooling, refactor, deps, database plumbing with no user-visible effect), use "${UNDER_THE_HOOD}".
Pages:
${pageList}
- ${UNDER_THE_HOOD}
2. "headline": rewrite the engineer's commit subject into ONE concise, business-friendly sentence describing the user-visible benefit. No jargon, no file names, no ticket numbers. Do NOT overstate: describe only what the subject supports. Sentence case, no trailing period.

Return ONLY a JSON array, one object per change, no prose:
[{"id":0,"page":"Inventory","headline":"..."}]

Changes:
${JSON.stringify(payload, null, 2)}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const text = (data.content || []).map((b) => b.text || '').join('')
    const jsonText = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
    const parsed = JSON.parse(jsonText)
    const byId = new Map(parsed.map((o) => [o.id, o]))
    return items.map((it, i) => {
      const o = byId.get(i)
      const page = o && PAGE_NAMES.has(o.page) ? o.page : o && o.page === UNDER_THE_HOOD ? UNDER_THE_HOOD : it.guessedPage
      const headline = o && typeof o.headline === 'string' && o.headline.trim() ? o.headline.trim() : fallbackHeadline(it)
      return { ...it, page, headline }
    })
  } catch (e) {
    console.error(`warn: AI enrichment failed, using deterministic fallback: ${e.message}`)
    return items.map((it) => ({ ...it, page: it.guessedPage, headline: fallbackHeadline(it) }))
  }
}

function fallbackHeadline(it) {
  const s = it.rawSubject
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------- version ----------
function computeVersion(hasFeature) {
  if (args.version) return String(args.version)
  let latest = null
  try {
    const tags = git(['tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'])
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
    latest = tags[0] || null
  } catch {
    latest = null
  }
  let major = 0
  let minor = 0
  let patch = 0
  if (latest) {
    const m = latest.match(/^v?(\d+)\.(\d+)\.(\d+)/)
    if (m) {
      major = +m[1]
      minor = +m[2]
      patch = +m[3]
    }
  }
  if (hasFeature) {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `v${major}.${minor}.${patch}`
}

// ---------- render ----------
function render(enriched, version, date) {
  const features = enriched.filter((i) => i.kind === 'feature')
  const fixes = enriched.filter((i) => i.kind === 'fix')

  const lines = []
  lines.push(`## ${version} — ${date}`)
  lines.push('')
  if (MODE === 'draft') {
    lines.push('> ⚠️ **Draft** — regenerated automatically when this PR merges.')
    lines.push('')
  }

  if (features.length === 0 && fixes.length === 0) {
    lines.push('_No user-facing features or fixes in this release._')
    lines.push('')
    return lines.join('\n')
  }

  // Features grouped by page, in taxonomy order, "Under the hood" last.
  const orderedPages = [...PAGES.map((p) => p.name), UNDER_THE_HOOD]
  const byPage = new Map()
  for (const f of features) {
    if (!byPage.has(f.page)) byPage.set(f.page, [])
    byPage.get(f.page).push(f)
  }

  const featurePages = orderedPages.filter((p) => p !== UNDER_THE_HOOD && byPage.has(p))
  if (featurePages.length) {
    lines.push("### ✨ What's new")
    lines.push('')
    for (const page of featurePages) {
      lines.push(`#### ${page}`)
      for (const f of byPage.get(page)) {
        lines.push(`- ${f.headline}${f.breaking ? ' **(breaking change)**' : ''}`)
      }
      lines.push('')
    }
  }

  if (fixes.length) {
    lines.push('### 🐛 Bug fixes')
    lines.push('')
    for (const fx of fixes) {
      const tag = fx.page && fx.page !== UNDER_THE_HOOD ? `**${fx.page}** — ` : ''
      lines.push(`- ${tag}${fx.headline}`)
    }
    lines.push('')
  }

  if (byPage.has(UNDER_THE_HOOD)) {
    lines.push(`### 🔧 ${UNDER_THE_HOOD}`)
    lines.push('')
    for (const f of byPage.get(UNDER_THE_HOOD)) {
      lines.push(`- ${f.headline}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ---------- main ----------
const items = buildItems()
const enriched = await enrich(items)
const hasFeature = enriched.some((i) => i.kind === 'feature')
const version = computeVersion(hasFeature)
const date = args.date ? String(args.date) : new Date().toISOString().slice(0, 10)
const notes = render(enriched, version, date)

if (OUT) {
  // `resolve` honours an absolute --out (e.g. /tmp/release-notes.md from CI);
  // a relative one is anchored at the repo root. Create the parent dir first so
  // a not-yet-existing target directory doesn't ENOENT the write.
  const outPath = resolve(REPO_ROOT, OUT)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, notes + '\n', 'utf8')
  console.error(`wrote ${OUT}`)
}
// Emit machine-readable outputs for the workflow (stdout).
process.stdout.write(
  JSON.stringify({ version, date, count: enriched.length, hasFeature, notes }) + '\n',
)
