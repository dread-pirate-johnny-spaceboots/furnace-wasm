import { execFileSync } from 'node:child_process'

const releaseTagPattern = /^v(\d+(?:\.\d+)+)$/
const devTagPattern = /^dev(\d+)$/

const runGit = args =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

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

const getTagStream = tag => {
  if (parseReleaseTag(tag)) {
    return 'release'
  }
  if (parseDevTag(tag) !== null) {
    return 'dev'
  }
  return null
}

const validateThreshold = (value, stream) => {
  if (!value) {
    return null
  }

  const valid = stream === 'release' ? parseReleaseTag(value) : parseDevTag(value)
  if (valid === null) {
    throw new Error(`Invalid ${stream} threshold: ${value}`)
  }

  return value
}

const listTags = () => {
  const raw = runGit(['for-each-ref', '--format=%(refname:short)%00%(creatordate:unix)', 'refs/tags'])
  if (!raw) {
    return []
  }

  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [name, createdAt = '0'] = line.split('\0')
      return {
        name,
        createdAt: Number(createdAt) || 0,
      }
    })
}

const output = values => {
  for (const [key, value] of Object.entries(values)) {
    process.stdout.write(`${key}=${value}\n`)
  }
}

const minimumReleaseTag = validateThreshold(process.env.MIN_RELEASE_TAG?.trim(), 'release')
const minimumDevTag = validateThreshold(process.env.MIN_DEV_TAG?.trim(), 'dev')
const requestedTag = process.env.INPUT_UPSTREAM_TAG?.trim() ?? ''
const forceRebuild = /^true$/i.test(process.env.FORCE_REBUILD ?? '')

const tagInfo = listTags()
const allTags = new Set(tagInfo.map(entry => entry.name))
const archivedTags = new Set(
  tagInfo
    .filter(entry => entry.name.startsWith('wasm-'))
    .map(entry => entry.name.slice('wasm-'.length))
)

const describeTag = tag => ({
  should_build: 'true',
  tag,
  stream: getTagStream(tag),
  archive_tag: `wasm-${tag}`,
  archive_asset: `furnace-gui-${tag}.zip`,
  metadata_asset: `build-metadata-${tag}.json`,
  release_title: `WASM browser build for ${tag}`,
})

const noSelection = reason =>
  output({
    should_build: 'false',
    tag: '',
    stream: '',
    archive_tag: '',
    archive_asset: '',
    metadata_asset: '',
    release_title: '',
    reason,
  })

if (requestedTag) {
  if (!allTags.has(requestedTag)) {
    throw new Error(`Requested upstream tag was not fetched: ${requestedTag}`)
  }

  const stream = getTagStream(requestedTag)
  if (!stream) {
    throw new Error(`Requested tag does not match supported release/dev patterns: ${requestedTag}`)
  }

  if (archivedTags.has(requestedTag) && !forceRebuild) {
    noSelection(`archive already exists for ${requestedTag}`)
  } else {
    output({
      ...describeTag(requestedTag),
      reason: 'manual workflow_dispatch selection',
    })
  }

  process.exit(0)
}

const candidates = tagInfo
  .filter(entry => {
    if (entry.name.startsWith('wasm-')) {
      return false
    }

    const stream = getTagStream(entry.name)
    if (!stream) {
      return false
    }

    if (archivedTags.has(entry.name) && !forceRebuild) {
      return false
    }

    if (stream === 'release' && minimumReleaseTag && compareReleaseTags(entry.name, minimumReleaseTag) < 0) {
      return false
    }

    if (stream === 'dev' && minimumDevTag && compareDevTags(entry.name, minimumDevTag) < 0) {
      return false
    }

    return true
  })
  .sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return right.createdAt - left.createdAt
    }

    return right.name.localeCompare(left.name)
  })

if (candidates.length === 0) {
  noSelection('no eligible upstream tags found')
  process.exit(0)
}

const selectedTag = candidates[0].name
output({
  ...describeTag(selectedTag),
  reason: 'automatic discovery selection',
})
