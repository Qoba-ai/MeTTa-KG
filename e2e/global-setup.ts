/**
 * E2E global setup — spawns isolated MORK, API, and frontend instances.
 *
 * Ports used (all distinct from the default dev stack):
 *   PostgreSQL  5433
 *   MORK        8011
 *   API         8010
 *   Frontend    3001   ← must not conflict with a running dev server (port 3000)
 *
 * Teardown info is written to /tmp/metta-kg-e2e-state.json so that
 * global-teardown.ts can clean up even if this process crashes.
 */

import { execSync, spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import * as net from 'net'
import * as path from 'path'
import * as os from 'os'

// ── constants ──────────────────────────────────────────────────────────────

const ROOT        = path.resolve(__dirname, '..')
const STATE_FILE  = '/tmp/metta-kg-e2e-state.json'

const ADMIN_TOKEN = '200003ee-c651-4069-8b7f-2ad9fb46c3ab'

const PG_CONTAINER = 'metta-kg-e2e-pg'
const PG_PORT      = 5433
const PG_USER      = 'e2euser'
const PG_PASS      = 'e2epass'
const PG_DB        = 'e2edb'

const MORK_PORT     = 8011
const API_PORT      = 8010
const FRONTEND_PORT = 3001

/** MeTTa S-expressions seeded into /e2etest/.
 *  Produces two top-level fringe nodes ("foo" and "bar") when the space is
 *  explored one level deep.  Each top-level key has ≥2 sub-keys, and each
 *  sub-key also has ≥2 entries, so that expanding a top-level "$" reveals
 *  the next level as fringe markers ("(foo (alpha $))" etc.) rather than
 *  raw terminals — required by Invariant 4. */
const TEST_SPACE_METTA = `
(foo (alpha 1))
(foo (alpha 2))
(foo (beta 3))
(foo (beta 4))
(bar (gamma 5))
(bar (gamma 6))
(bar (delta 7))
(bar (delta 8))
`.trim()

// ── helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

/** Poll until an HTTP GET returns 2xx or throw after timeout. */
async function waitForHttp(
  url: string,
  opts: { headers?: Record<string, string> } = {},
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>(resolve => {
      const parsed = new URL(url)
      const req = http.request(
        { hostname: parsed.hostname, port: Number(parsed.port), path: parsed.pathname + parsed.search,
          method: 'GET', headers: opts.headers ?? {} },
        res => { resolve((res.statusCode ?? 0) < 400) },
      )
      req.on('error', () => resolve(false))
      req.end()
    })
    if (ok) return
    await sleep(700)
  }
  throw new Error(`HTTP ${url} not ready after ${timeoutMs}ms`)
}

async function portFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => { s.close(); resolve(true) })
    s.listen(port, '127.0.0.1')
  })
}

/** Run SQL inside the already-running postgres Docker container. */
function psql(sql: string) {
  execSync(
    `docker exec -i ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB}`,
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  )
}

// ── setup ──────────────────────────────────────────────────────────────────

export default async function globalSetup() {
  const procs: ChildProcess[] = []

  function cleanup() {
    procs.forEach(p => { try { p.kill('SIGKILL') } catch {} })
    try { execSync(`docker rm -f ${PG_CONTAINER}`, { stdio: 'ignore' }) } catch {}
    try { fs.unlinkSync(path.join(ROOT, 'frontend/.env.e2e.local')) } catch {}
    try { fs.unlinkSync(STATE_FILE) } catch {}
  }

  // ── 1. guard: frontend port must be free ─────────────────────────────────
  if (!(await portFree(FRONTEND_PORT))) {
    throw new Error(
      `Port ${FRONTEND_PORT} is already in use.\n` +
      `Stop the running dev server before running e2e tests (e.g. kill the 'npm run dev' process).`
    )
  }

  // ── 2. PostgreSQL ─────────────────────────────────────────────────────────
  console.log('[setup] Starting PostgreSQL container …')
  try { execSync(`docker rm -f ${PG_CONTAINER}`, { stdio: 'ignore' }) } catch {}
  execSync(
    `docker run -d --name ${PG_CONTAINER}` +
    ` -e POSTGRES_USER=${PG_USER}` +
    ` -e POSTGRES_PASSWORD=${PG_PASS}` +
    ` -e POSTGRES_DB=${PG_DB}` +
    ` -p ${PG_PORT}:5432` +
    ` postgres:16-alpine`,
    { stdio: 'inherit' },
  )

  console.log('[setup] Waiting for PostgreSQL to accept connections …')
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      execSync(`docker exec ${PG_CONTAINER} pg_isready -U ${PG_USER}`, { stdio: 'ignore' })
      break
    } catch { await sleep(600) }
  }

  // ── 3. Run migrations ─────────────────────────────────────────────────────
  console.log('[setup] Running DB migrations …')
  const migrationsDir = path.join(ROOT, 'api/migrations')
  const migrationDirs = fs.readdirSync(migrationsDir).sort()
  for (const dir of migrationDirs) {
    const upSql = path.join(migrationsDir, dir, 'up.sql')
    if (fs.existsSync(upSql)) {
      psql(fs.readFileSync(upSql, 'utf-8'))
    }
  }

  // ── 4. MORK binary ────────────────────────────────────────────────────────
  const morkBin = path.join(ROOT, 'MORK/target/debug/mork-server')
  if (!fs.existsSync(morkBin)) {
    console.log('[setup] Building MORK server (first run — this may take several minutes) …')
    execSync('cargo build --bin mork-server', {
      cwd: path.join(ROOT, 'MORK'),
      stdio: 'inherit',
    })
    console.log('[setup] MORK build complete.')
  }

  // ── 5. Start MORK ─────────────────────────────────────────────────────────
  console.log(`[setup] Starting MORK on port ${MORK_PORT} …`)
  const morkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mork-e2e-'))
  const mork = spawn(morkBin, [], {
    env: {
      ...process.env,
      MORK_SERVER_ADDR: '127.0.0.1',
      MORK_SERVER_PORT: String(MORK_PORT),
      MORK_SERVER_DIR:  morkDir,
    },
    stdio: 'pipe',
  })
  procs.push(mork)
  mork.stderr?.on('data', d => process.stderr.write(`[mork] ${d}`))

  // MORK's health-check: any well-formed request returns; busywait/0 is lightest
  await waitForHttp(`http://127.0.0.1:${MORK_PORT}/busywait/0`)
  console.log('[setup] MORK ready.')

  // ── 6. Start API ──────────────────────────────────────────────────────────
  console.log(`[setup] Starting API on port ${API_PORT} …`)
  const apiBin    = path.join(ROOT, 'api/target/debug/api')
  const apiCwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-e2e-'))
  // The API writes temp .metta files to ./static/ relative to its CWD
  fs.mkdirSync(path.join(apiCwdDir, 'static'), { recursive: true })

  const api = spawn(apiBin, [], {
    cwd: apiCwdDir,
    env: {
      ...process.env,
      METTA_KG_DATABASE_URL: `postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}`,
      METTA_KG_MORK_URL:    `http://127.0.0.1:${MORK_PORT}`,
      METTA_KG_SECRET:       'e2e-test-secret',
      // Origin URL must be reachable by MORK so it can fetch uploaded .metta files
      METTA_KG_ORIGIN_URL:  `http://127.0.0.1:${API_PORT}`,
      ROCKET_ADDRESS:        '127.0.0.1',
      ROCKET_PORT:           String(API_PORT),
    },
    stdio: 'pipe',
  })
  procs.push(api)
  api.stderr?.on('data', d => process.stderr.write(`[api] ${d}`))

  await waitForHttp(
    `http://127.0.0.1:${API_PORT}/explore`,
    { headers: { Authorization: ADMIN_TOKEN } },
  )
  console.log('[setup] API ready.')

  // ── 7. Seed data into root namespace ─────────────────────────────────────
  // We seed into the root "/" so the admin token's panel (which auto-loads on
  // page open) shows foo and bar as top-level fringe nodes directly — no
  // sub-panel navigation needed.
  console.log('[setup] Seeding test data into root namespace …')
  const seedResp = await fetch(`http://127.0.0.1:${API_PORT}/spaces/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Authorization: ADMIN_TOKEN,
    },
    body: TEST_SPACE_METTA,
  })
  if (!seedResp.ok) {
    cleanup()
    throw new Error(`Space seeding failed: ${seedResp.status} ${await seedResp.text()}`)
  }

  // MORK's import is asynchronous — poll the explore endpoint until data appears
  console.log('[setup] Waiting for MORK to finish importing …')
  const exploreDeadline = Date.now() + 30_000
  while (Date.now() < exploreDeadline) {
    const r = await fetch(`http://127.0.0.1:${API_PORT}/explore/`, {
      headers: { Authorization: ADMIN_TOKEN },
    })
    if (r.ok) {
      const paths: string[][] = await r.json()
      if (paths.length > 0) break
    }
    await sleep(500)
  }
  console.log('[setup] Data confirmed in MORK.')

  // ── 8. Start Vite frontend ────────────────────────────────────────────────
  // Use the admin token — the app auto-loads the "/" panel which has foo/bar fringes.
  const envLocalPath = path.join(ROOT, 'frontend/.env.e2e.local')
  fs.writeFileSync(
    envLocalPath,
    `VITE_BACKEND_URL=http://localhost:${API_PORT}\nVITE_TOKEN=${ADMIN_TOKEN}\n`,
  )

  console.log(`[setup] Starting Vite frontend on port ${FRONTEND_PORT} …`)
  const frontend = spawn(
    'npx', ['vite', '--mode', 'e2e', '--port', String(FRONTEND_PORT), '--strictPort'],
    {
      cwd: path.join(ROOT, 'frontend'),
      env: { ...process.env },
      stdio: 'pipe',
    },
  )
  procs.push(frontend)
  frontend.stderr?.on('data', d => process.stderr.write(`[vite] ${d}`))
  frontend.stdout?.on('data', d => process.stdout.write(`[vite] ${d}`))

  await waitForHttp(`http://127.0.0.1:${FRONTEND_PORT}`)
  // Give Vite a moment to fully compile and serve the initial bundle
  await sleep(2_000)
  console.log('[setup] Vite frontend ready.')

  // ── 9. Persist teardown state ─────────────────────────────────────────────
  const state = {
    pids:        procs.map(p => p.pid),
    pgContainer: PG_CONTAINER,
    morkDir,
    apiCwdDir,
    envLocalPath,
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

  console.log('[setup] All services up. Running tests …')
  console.log(`  Frontend : http://localhost:${FRONTEND_PORT}`)
  console.log(`  API      : http://localhost:${API_PORT}`)
  console.log(`  MORK     : http://localhost:${MORK_PORT}`)
}
