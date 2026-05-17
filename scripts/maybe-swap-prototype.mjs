import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const branch = process.env.VERCEL_GIT_COMMIT_REF ?? ''
const STAGING_BRANCHES = ['develop']

if (!STAGING_BRANCHES.includes(branch)) {
  console.log(`[swap-prototype] skipped (branch="${branch}", not in ${STAGING_BRANCHES.join(',')})`)
  process.exit(0)
}

const src = resolve('dist', 'fittrainer-prototype.html')
const dst = resolve('dist', 'index.html')

if (!existsSync(src)) {
  console.error(`[swap-prototype] source missing: ${src}`)
  process.exit(1)
}

copyFileSync(src, dst)
console.log(`[swap-prototype] dist/index.html replaced with prototype (branch="${branch}")`)
