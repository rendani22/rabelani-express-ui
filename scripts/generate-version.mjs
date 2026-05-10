#!/usr/bin/env node
/**
 * Generates src/environments/version.ts with a semver derived from
 * Conventional Commits in the git history.
 *
 * Rules (Conventional Commits):
 *   - "feat!:" / "fix!:" / "BREAKING CHANGE" footer  -> major bump (minor while < 1.0.0)
 *   - "feat:"                                        -> minor bump
 *   - "fix:" / "perf:"                               -> patch bump
 *   - Anything else (chore, docs, refactor, test...) -> no bump
 *
 * Starting point:
 *   - The latest tag matching v?MAJOR.MINOR.PATCH, if any. Otherwise 0.0.0.
 *   - Only commits *after* that tag are considered.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(__dirname, '..', 'src', 'environments', 'version.ts');
const pkgFile = resolve(__dirname, '..', 'package.json');

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .replace(/\n$/, '');
  } catch {
    return fallback;
  }
}

// Detect availability of a real git repo with history. CI builds (Cloudflare
// Pages, GitHub Actions, etc.) often run against a shallow clone with no tags,
// which would cause the version to collapse to the 0.0.0 -> 0.1.0 fallback.
const hasGit = git(['rev-parse', '--is-inside-work-tree'], '') === 'true';
const isShallow = hasGit && git(['rev-parse', '--is-shallow-repository'], 'false') === 'true';
if (isShallow) {
  // Best-effort: try to fetch full history + tags so semver derivation works.
  // Failures are fine (no network, detached, etc.) — we'll fall back below.
  try {
    execFileSync('git', ['fetch', '--unshallow', '--tags'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    try {
      execFileSync('git', ['fetch', '--tags'], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
      /* ignore */
    }
  }
}

// Read package.json version as a deployment-time fallback when git history
// isn't available (shallow CI clones, source tarballs, etc.).
let pkgVersion = '';
try {
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  if (typeof pkg.version === 'string' && /^\d+\.\d+\.\d+/.test(pkg.version)) {
    pkgVersion = pkg.version;
  }
} catch {
  /* ignore */
}

const SEMVER_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;
const allTags = git(['tag', '--list'], '')
  .split('\n')
  .map((t) => t.trim())
  .filter(Boolean);

let baseTag = '';
let base = { major: 0, minor: 0, patch: 0 };
const semverTags = allTags
  .map((t) => {
    const m = SEMVER_TAG.exec(t);
    return m ? { tag: t, major: +m[1], minor: +m[2], patch: +m[3] } : null;
  })
  .filter(Boolean)
  .sort((a, b) =>
    a.major !== b.major
      ? a.major - b.major
      : a.minor !== b.minor
        ? a.minor - b.minor
        : a.patch - b.patch,
  );

if (semverTags.length > 0) {
  const latest = semverTags[semverTags.length - 1];
  baseTag = latest.tag;
  base = { major: latest.major, minor: latest.minor, patch: latest.patch };
}

const range = baseTag ? baseTag + '..HEAD' : 'HEAD';
const SEP = '<<<COMMIT>>>';
const FSEP = '<<<F>>>';
const raw = git(
  ['log', range, '--reverse', '--pretty=format:%H' + FSEP + '%s' + FSEP + '%B' + SEP],
  '',
);

const commits = raw
  .split(SEP)
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [hash, subject, body] = c.split(FSEP);
    return { hash, subject: (subject ?? '').trim(), body: (body ?? '').trim() };
  });

const HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?:\s/;

let { major, minor, patch } = base;
let commitsSince = 0;

for (const c of commits) {
  const m = HEADER.exec(c.subject);
  const hasBreakingFooter = /(^|\n)BREAKING[ -]CHANGE:/i.test(c.body);
  let bump = 'none';

  if (m) {
    const type = m[1].toLowerCase();
    const bang = m[3] === '!';
    if (bang || hasBreakingFooter) bump = 'major';
    else if (type === 'feat') bump = 'minor';
    else if (type === 'fix' || type === 'perf') bump = 'patch';
  } else if (hasBreakingFooter) {
    bump = 'major';
  }

  if (bump === 'none') continue;
  commitsSince++;

  // Pre-1.0.0 convention: treat breaking changes as a minor bump.
  if (bump === 'major' && major === 0) bump = 'minor';

  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
}

if (major === 0 && minor === 0 && patch === 0) {
  // No git tags AND no bump-worthy commits found. This happens on shallow CI
  // clones. Prefer the version pinned in package.json so deploys reflect the
  // actual release. Only fall back to 0.1.0 if package.json has no version.
  if (pkgVersion) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(pkgVersion);
    if (m) {
      major = +m[1];
      minor = +m[2];
      patch = +m[3];
    }
  }
  if (major === 0 && minor === 0 && patch === 0) {
    minor = 1;
  }
}

const semver = major + '.' + minor + '.' + patch;

const ciSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '';
const ciBranch =
  process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || process.env.BRANCH || '';

const hash = git(['rev-parse', '--short', 'HEAD'], ciSha ? ciSha.slice(0, 7) : 'unknown');
const fullHash = git(['rev-parse', 'HEAD'], ciSha || 'unknown');
const subject = git(['log', '-1', '--pretty=%s'], '');
const commitDate = git(['log', '-1', '--pretty=%cI'], new Date().toISOString());
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], ciBranch || 'unknown');
const buildDate = new Date().toISOString();

// Treat a working tree as dirty only when we actually have a git repo to
// inspect; CI clones with no `.git` should not be reported as "-dev".
const isDirty = hasGit && git(['status', '--porcelain'], '').length > 0;
const display = isDirty ? semver + '-dev' : semver;

const version = {
  version: display,
  semver,
  baseTag: baseTag || null,
  commitsSinceBase: commitsSince,
  isDirty,
  hash,
  fullHash,
  branch,
  message: subject,
  commitDate,
  buildDate,
};

const banner =
  '// AUTO-GENERATED FILE - do not edit by hand.\n' +
  '// Regenerated by scripts/generate-version.mjs from the git history.\n';

const content =
  banner +
  'export interface AppVersion {\n' +
  '  /** Display version, e.g. "1.4.2" or "1.4.2-dev" when the tree is dirty. */\n' +
  '  version: string;\n' +
  '  /** Pure MAJOR.MINOR.PATCH derived from Conventional Commits. */\n' +
  '  semver: string;\n' +
  '  /** The tag that semver was computed from, or null when no base tag exists. */\n' +
  '  baseTag: string | null;\n' +
  '  /** Number of bump-worthy commits since baseTag (or since the first commit). */\n' +
  '  commitsSinceBase: number;\n' +
  '  /** True when the working tree had uncommitted changes at build time. */\n' +
  '  isDirty: boolean;\n' +
  '  /** Short commit hash (e.g. "bcff3bb"). */\n' +
  '  hash: string;\n' +
  '  /** Full commit hash. */\n' +
  '  fullHash: string;\n' +
  '  /** Current branch name. */\n' +
  '  branch: string;\n' +
  '  /** First line of the latest commit message. */\n' +
  '  message: string;\n' +
  '  /** ISO-8601 commit timestamp. */\n' +
  '  commitDate: string;\n' +
  '  /** ISO-8601 build timestamp. */\n' +
  '  buildDate: string;\n' +
  '}\n\n' +
  'export const APP_VERSION: AppVersion = ' +
  JSON.stringify(version, null, 2) +
  ';\n';

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, content, 'utf8');
console.log(
  '[version] ' +
    display +
    ' (base=' +
    (baseTag || '0.0.0') +
    ', +' +
    commitsSince +
    ' bumps, ' +
    hash +
    ')',
);





