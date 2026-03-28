/**
 * E2E global teardown — kills spawned processes and removes the Docker
 * container that was started by global-setup.ts.
 */

import { execSync } from 'child_process'
import * as fs from 'fs'

const STATE_FILE = '/tmp/metta-kg-e2e-state.json'

export default async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('[teardown] No state file found — nothing to clean up.')
    return
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as {
    pids: (number | undefined)[]
    pgContainer: string
    morkDir: string
    apiCwdDir: string
    envLocalPath: string
  }

  // Kill spawned processes
  for (const pid of state.pids) {
    if (!pid) continue
    try {
      process.kill(pid, 'SIGKILL')
      console.log(`[teardown] Killed process ${pid}`)
    } catch {
      // Already exited — ignore
    }
  }

  // Remove Docker container
  try {
    execSync(`docker rm -f ${state.pgContainer}`, { stdio: 'ignore' })
    console.log(`[teardown] Removed container ${state.pgContainer}`)
  } catch {}

  // Remove the Vite env override
  try {
    fs.unlinkSync(state.envLocalPath)
    console.log('[teardown] Removed Vite env override')
  } catch {}

  // Remove the state file
  fs.unlinkSync(STATE_FILE)
  console.log('[teardown] Done.')
}
