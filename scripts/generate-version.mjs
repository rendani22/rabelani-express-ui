#!/usr/bin/env node
/**
 * Generates src/environments/version.ts with a SemVer 2.0.0 version derived
 * from the git history using Conventional Commits.
 *
 * Output is fully SemVer 2.0.0 compliant:
 *
 *     MAJOR.MINOR.PATCH[-prerelease][+buildmetadata]
 *     e.g. 1.4.2            (stable release branch, clean tree)
 *          1.4.2-dev.7      (dev branch, 7 commits past base)
 *          1.4.2-feat-x.3+9f1c2ab.dirty
 *
 * --- How the MAJOR.MINOR.PATCH core is computed -----------------------------
 *
 * Conventional Commit bump rules:
 *   - "feat!:" / "fix!:" / "BREAKING CHANGE" footer  -> major (minor while <1.0)
 *   - "feat:"                                        -> minor
 *   - "fix:" / "perf:"                               -> patch
 *   - "revert:"                                      -> cancels the most recent bump
 *   - Anything else (chore, docs, refactor, test...) -> no bump
 *
 * The starting point is the nearest annotated/lightweight tag matching
 * v?MAJOR.MINOR.PATCH that is *reachable from HEAD* (via `git describe`), so the
 * version is computed against the branch's own history rather than the highest
 * tag anywhere in the repo. Only commits after that tag are replayed.
 *
 * --- Channels (the prerelease / build-metadata part) -----------------------
 *
 *   - Release branches (main, master, release/*, hotfix/*) -> stable: no
 *     prerelease suffix; the core IS the release version.
 *   - dev branch                                           -> "-dev.<height>"
 *   - any other branch                                     -> "-<branch>.<height>"
 *
 * <height> is the number of commits since the base tag (monotonic per branch),
 * so prereleases sort correctly and always rank below the eventual stable
 * release (e.g. 1.4.2-dev.7 < 1.4.2). The short commit hash and a "dirty"
 * marker (uncommitted changes) live in +build metadata, which SemVer ignores
 * for precedence — exactly what build metadata is for.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(__dirname, '..', 'src', 'environments', 'version.ts');
const pkgFile = resolve(__dirname, '..', 'package.json');

/** Run a git command, returning trimmed stdout or `fallback` on any failure. */
function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .replace(/\n+$/, '');
  } catch {
    return fallback;
  }
}

// --- Official SemVer 2.0.0 grammar (https://semver.org) ----------------------
// Used as a final guardrail: a build must never emit an invalid version string.
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// --- Repo detection & shallow-clone recovery ---------------------------------
// CI builds (Cloudflare Pages, GitHub Actions, ...) frequently run against a
// shallow clone with no tags, which would collapse the derived version. Try to
// deepen the history so semver derivation works; failures are non-fatal.
const hasGit = git(['rev-parse', '--is-inside-work-tree'], '') === 'true';
const isShallow = hasGit && git(['rev-parse', '--is-shallow-repository'], 'false') === 'true';
if (isShallow) {
  try {
    execFileSync('git', ['fetch', '--unshallow', '--tags'], { stdio: 'ignore' });
  } catch {
    try {
      execFileSync('git', ['fetch', '--tags'], { stdio: 'ignore' });
    } catch {
      /* offline / detached — fall back below */
    }
  }
}

// package.json version is the deployment-time fallback when git history is
// unavailable (shallow CI clones, source tarballs, etc.).
let pkgVersion = '';
try {
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  if (typeof pkg.version === 'string' && /^\d+\.\d+\.\d+/.test(pkg.version)) {
    pkgVersion = pkg.version;
  }
} catch {
  /* ignore */
}

// --- Locate the base tag (nearest semver tag reachable from HEAD) ------------
const SEMVER_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;

function parseTag(tag) {
  const m = SEMVER_TAG.exec(tag);
  return m ? { tag, major: +m[1], minor: +m[2], patch: +m[3] } : null;
}

let baseTag = '';
let base = { major: 0, minor: 0, patch: 0 };

// Prefer the nearest ancestor tag so branches compute against their own
// history. `git describe` walks back from HEAD and returns the closest match.
const described = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*'], '');
let parsed = described ? parseTag(described) : null;

// Some repos tag without the leading "v"; retry without the match filter.
if (!parsed) {
  const describedAny = git(['describe', '--tags', '--abbrev=0'], '');
  parsed = describedAny ? parseTag(describedAny) : null;
}

// Fall back to the globally-highest semver tag if HEAD has no ancestor tag.
if (!parsed) {
  const semverTags = git(['tag', '--list'], '')
    .split('\n')
    .map((t) => parseTag(t.trim()))
    .filter(Boolean)
    .sort((a, b) =>
      a.major !== b.major
        ? a.major - b.major
        : a.minor !== b.minor
          ? a.minor - b.minor
          : a.patch - b.patch,
    );
  if (semverTags.length) parsed = semverTags[semverTags.length - 1];
}

if (parsed) {
  baseTag = parsed.tag;
  base = { major: parsed.major, minor: parsed.minor, patch: parsed.patch };
}

// --- Replay commits since the base tag to compute the core version -----------
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
let bumpsSince = 0; // bump-worthy commits (feat/fix/perf/breaking)
const bumpHistory = []; // stack of applied bumps, so revert can undo the last one

for (const c of commits) {
  const m = HEADER.exec(c.subject);
  const type = m ? m[1].toLowerCase() : '';
  const hasBreakingFooter = /(^|\n)BREAKING[ -]CHANGE:/i.test(c.body);

  // A revert cancels the most recent bump rather than minting a new one.
  if (type === 'revert' && bumpHistory.length) {
    const last = bumpHistory.pop();
    if (last === 'major') major = Math.max(0, major - 1);
    else if (last === 'minor') minor = Math.max(0, minor - 1);
    else if (last === 'patch') patch = Math.max(0, patch - 1);
    bumpsSince = Math.max(0, bumpsSince - 1);
    continue;
  }

  let bump = 'none';
  if (m) {
    if (m[3] === '!' || hasBreakingFooter) bump = 'major';
    else if (type === 'feat') bump = 'minor';
    else if (type === 'fix' || type === 'perf') bump = 'patch';
  } else if (hasBreakingFooter) {
    bump = 'major';
  }

  if (bump === 'none') continue;

  // Pre-1.0.0 convention: breaking changes are a minor bump, not major.
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
  bumpsSince += 1;
  bumpHistory.push(bump);
}

// --- Branch / channel resolution ---------------------------------------------
const ciSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '';
const ciBranch =
  process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || process.env.BRANCH || '';

let branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], '');
if (!branch || branch === 'HEAD') branch = ciBranch || 'unknown'; // detached / CI

const isReleaseBranch = /^(main|master)$/.test(branch) || /^(release|hotfix)\//.test(branch);

/** Sanitize a branch name into valid SemVer prerelease identifiers. */
function channelId(name) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^0-9a-z-]+/g, '-') // only [0-9a-z-] allowed in identifiers
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'build';
}

const channel = isReleaseBranch ? 'stable' : branch === 'dev' ? 'dev' : channelId(branch);

// Commit height = commits since the base tag; monotonic along a branch, so it
// makes a stable, sortable prerelease counter.
const heightRaw = baseTag
  ? git(['rev-list', '--count', baseTag + '..HEAD'], '')
  : git(['rev-list', '--count', 'HEAD'], '');
const height = /^\d+$/.test(heightRaw) ? +heightRaw : bumpsSince;

// On a prerelease channel with commits but no bump yet, advance one patch so the
// prerelease sorts ABOVE the released base (1.2.1-dev.3 > 1.2.0), never below it.
if (!isReleaseBranch && height > 0 && major === base.major && minor === base.minor && patch === base.patch) {
  patch += 1;
}

// --- Fallbacks when no git history is available (shallow/tarball builds) ------
if (major === 0 && minor === 0 && patch === 0) {
  const m = pkgVersion ? /^(\d+)\.(\d+)\.(\d+)/.exec(pkgVersion) : null;
  if (m) {
    major = +m[1];
    minor = +m[2];
    patch = +m[3];
  }
  if (major === 0 && minor === 0 && patch === 0) minor = 1; // last-resort 0.1.0
}

const core = `${major}.${minor}.${patch}`;

// --- Assemble prerelease + build metadata ------------------------------------
const isDirty = hasGit && git(['status', '--porcelain'], '').length > 0;

const prerelease = isReleaseBranch ? '' : `${channel}.${height}`;

const hash = git(['rev-parse', '--short', 'HEAD'], ciSha ? ciSha.slice(0, 7) : 'unknown');
const fullHash = git(['rev-parse', 'HEAD'], ciSha || 'unknown');

const buildParts = [];
if (hash && hash !== 'unknown') buildParts.push(hash);
if (isDirty) buildParts.push('dirty');
const buildMetadata = buildParts.join('.');

let version = core;
if (prerelease) version += '-' + prerelease;
if (buildMetadata) version += '+' + buildMetadata;

// Guardrail: never emit a non-compliant version string.
if (!SEMVER_RE.test(version)) {
  console.error('[version] FATAL: computed an invalid SemVer 2.0.0 string: ' + version);
  process.exit(1);
}

// --- Remaining metadata ------------------------------------------------------
const subject = git(['log', '-1', '--pretty=%s'], '');
const commitDate = git(['log', '-1', '--pretty=%cI'], new Date().toISOString());
const buildDate = new Date().toISOString();

const payload = {
  version,
  semver: core,
  major,
  minor,
  patch,
  prerelease: prerelease || null,
  buildMetadata: buildMetadata || null,
  channel,
  baseTag: baseTag || null,
  commitsSinceBase: height,
  bumpsSinceBase: bumpsSince,
  isDirty,
  isRelease: isReleaseBranch && !isDirty,
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
  '  /** Full SemVer 2.0.0 string, e.g. "1.4.2", "1.4.2-dev.7" or "1.4.2-dev.7+9f1c2ab.dirty". */\n' +
  '  version: string;\n' +
  '  /** Core MAJOR.MINOR.PATCH derived from Conventional Commits. */\n' +
  '  semver: string;\n' +
  '  /** Numeric MAJOR component. */\n' +
  '  major: number;\n' +
  '  /** Numeric MINOR component. */\n' +
  '  minor: number;\n' +
  '  /** Numeric PATCH component. */\n' +
  '  patch: number;\n' +
  '  /** Prerelease label (e.g. "dev.7"), or null on a stable release branch. */\n' +
  '  prerelease: string | null;\n' +
  '  /** Build metadata (e.g. "9f1c2ab.dirty"), or null when unavailable. */\n' +
  '  buildMetadata: string | null;\n' +
  '  /** Release channel: "stable", "dev", or a sanitized branch name. */\n' +
  '  channel: string;\n' +
  '  /** The tag that semver was computed from, or null when no base tag exists. */\n' +
  '  baseTag: string | null;\n' +
  '  /** Number of commits since baseTag (or since the first commit). */\n' +
  '  commitsSinceBase: number;\n' +
  '  /** Number of bump-worthy (feat/fix/perf/breaking) commits since baseTag. */\n' +
  '  bumpsSinceBase: number;\n' +
  '  /** True when the working tree had uncommitted changes at build time. */\n' +
  '  isDirty: boolean;\n' +
  '  /** True for a clean build on a release branch (main/master/release/hotfix). */\n' +
  '  isRelease: boolean;\n' +
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
  JSON.stringify(payload, null, 2) +
  ';\n';

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, content, 'utf8');
console.log(
  `[version] ${version} (base=${baseTag || '0.0.0'}, height=${height}, +${bumpsSince} bumps, ${channel})`,
);
