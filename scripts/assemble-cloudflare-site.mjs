import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const releaseTagPattern = /^v(\d+(?:\.\d+)+)$/
const devTagPattern = /^dev(\d+)$/

const parseArgs = argv => {
  const args = new Map()

  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]

    if (!key?.startsWith('--') || !value) {
      throw new Error('Usage: node scripts/assemble-cloudflare-site.mjs --input <dir> --output <dir>')
    }

    args.set(key.slice(2), value)
  }

  return {
    input: args.get('input'),
    output: args.get('output'),
    stream: args.get('stream'),
  }
}

const parseReleaseTag = tag => {
  const match = releaseTagPattern.exec(tag)
  if (!match) {
    return null
  }

  return match[1].split('.').map(part => Number(part))
}

const parseDevTag = tag => {
  const match = devTagPattern.exec(tag)
  if (!match) {
    return null
  }

  return Number(match[1])
}

const compareNumberArrays = (left, right) => {
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0
    const rightPart = right[index] ?? 0

    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }

  return 0
}

const compareReleaseTags = (left, right) => compareNumberArrays(parseReleaseTag(left), parseReleaseTag(right))
const compareDevTags = (left, right) => parseDevTag(left) - parseDevTag(right)

const ensureBundle = sourceDir => {
  const indexPath = path.join(sourceDir, 'index.html')
  if (!existsSync(indexPath)) {
    throw new Error(`Bundle is missing index.html: ${sourceDir}`)
  }
}

const copyBundle = (sourceDir, targetDir) => {
  mkdirSync(targetDir, { recursive: true })

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === '_headers') {
      continue
    }

    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      cpSync(sourcePath, targetPath, { recursive: true })
    } else {
      cpSync(sourcePath, targetPath)
    }
  }
}

const buildHeadersFile = () => `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/runtime/*
  Cache-Control: public, max-age=31536000, immutable

/:tag/assets/*
  Cache-Control: public, max-age=31536000, immutable

/:tag/runtime/*
  Cache-Control: public, max-age=31536000, immutable
`

const { input, output, stream } = parseArgs(process.argv)

if (!input || !output || !stream) {
  throw new Error('Usage: node scripts/assemble-cloudflare-site.mjs --input <dir> --output <dir> --stream <release|dev>')
}

if (stream !== 'release' && stream !== 'dev') {
  throw new Error(`Unsupported stream: ${stream}`)
}

if (!existsSync(input)) {
  throw new Error(`Input directory does not exist: ${input}`)
}

const bundleEntries = readdirSync(input, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(name => parseReleaseTag(name) || parseDevTag(name) !== null)

const releaseTags = bundleEntries
  .filter(name => parseReleaseTag(name))
  .sort((left, right) => compareReleaseTags(right, left))
const devTags = bundleEntries
  .filter(name => parseDevTag(name) !== null)
  .sort((left, right) => compareDevTags(right, left))
const selectedTags = stream === 'release' ? releaseTags : devTags

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

for (const tag of selectedTags) {
  const sourceDir = path.join(input, tag)
  const targetDir = path.join(output, tag)
  ensureBundle(sourceDir)
  copyBundle(sourceDir, targetDir)
}

const rootTag = selectedTags[0] ?? null
if (rootTag) {
  copyBundle(path.join(input, rootTag), output)
}

writeFileSync(path.join(output, '_headers'), buildHeadersFile())
writeFileSync(
  path.join(output, 'site-manifest.json'),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      stream,
      rootTag,
      tags: selectedTags.map(tag => ({
        tag,
        path: `/${tag}/`,
      })),
    },
    null,
    2
  )}\n`
)

const outputStats = statSync(output)
if (!outputStats.isDirectory()) {
  throw new Error(`Failed to create output directory: ${output}`)
}

console.log(`[cloudflare-site] assembled ${selectedTags.length} ${stream} bundles`)
if (rootTag) {
  console.log(`[cloudflare-site] ${stream} root points to ${rootTag}`)
} else {
  console.log(`[cloudflare-site] no ${stream} bundles available for root publishing yet`)
}
