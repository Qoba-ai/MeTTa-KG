/**
 * E2E test: load a space, expand all fringe nodes, collapse them, verify
 * that the editor content is unchanged and no lines are diff-highlighted.
 *
 * Setup (global-setup.ts) seeds the root "/" namespace with:
 *   (foo (alpha 1))  (foo (alpha 2))  (foo (beta 3))
 *   (bar (gamma 4))  (bar (delta 5))
 *
 * The admin token (VITE_TOKEN) auto-loads the "/" panel on page open.
 * The explore algorithm shows (foo $) and (bar $) as top-level fringes because
 * each key has multiple sub-paths, triggering fringe consolidation.
 *
 * The expand → collapse round-trip must:
 *   1. restore the editor text to exactly the pre-expansion snapshot, and
 *   2. leave zero lines with a diff highlight (blue left-border from diffExtension).
 */

import { test, expect, type Page } from '@playwright/test'

// ── helpers ────────────────────────────────────────────────────────────────

/** Concatenate every .cm-line's visible text. */
async function editorText(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.cm-line'))
      .map(l => (l as HTMLElement).innerText)
      .join('\n'),
  )
}

// ── test ──────────────────────────────────────────────────────────────────

test('expand all fringe nodes then collapse restores content with no diff markers', async ({ page }) => {

  // ── navigate ────────────────────────────────────────────────────────────
  await page.goto('/')

  // VITE_TOKEN is the admin token → the app auto-loads the "/" panel.
  // Wait for the CodeMirror editor and at least one fringe toggle to appear.
  await page.waitForSelector('.cm-content', { timeout: 20_000 })
  await page.waitForSelector('[data-testid="trie-toggle"][data-trie-fringe="true"]', {
    timeout: 20_000,
  })

  // ── snapshot initial content ────────────────────────────────────────────
  const initialContent = await editorText(page)
  expect(initialContent).toContain('$')   // fringe markers present initially

  // Collect all top-level fringe paths before clicking anything
  const fringePaths = await page
    .locator('[data-testid="trie-toggle"][data-trie-fringe="true"]')
    .evaluateAll(els =>
      els.map(el => el.getAttribute('data-trie-path')).filter(Boolean) as string[],
    )
  expect(fringePaths.length, 'expected at least one fringe node').toBeGreaterThan(0)
  console.log('Fringe paths found:', fringePaths)

  // ── expand all fringe nodes ─────────────────────────────────────────────
  for (const fringePath of fringePaths) {
    const toggle = page.locator(
      `[data-testid="trie-toggle"][data-trie-path="${fringePath}"][data-trie-fringe="true"]`,
    )
    await toggle.click()

    // Wait for that specific node to no longer be a fringe (API call resolved,
    // AST merged, SolidJS re-rendered)
    await page.waitForSelector(
      `[data-testid="trie-toggle"][data-trie-path="${fringePath}"][data-trie-fringe="false"]`,
      { timeout: 15_000 },
    )
  }

  // Verify the editor now shows expanded content (no $ markers)
  const expandedContent = await editorText(page)
  expect(expandedContent, 'expanded content should differ from initial').not.toBe(initialContent)
  expect(expandedContent, 'fringe $ markers should be gone after expansion').not.toContain('$')

  // ── collapse all expanded nodes ─────────────────────────────────────────
  for (const fringePath of fringePaths) {
    // The node is now open (data-trie-open="true") and no longer a fringe
    const toggle = page.locator(
      `[data-testid="trie-toggle"][data-trie-path="${fringePath}"][data-trie-open="true"]`,
    )
    await toggle.click()

    // Wait for the fringe marker to be restored by unexpandFringe()
    await page.waitForSelector(
      `[data-testid="trie-toggle"][data-trie-path="${fringePath}"][data-trie-fringe="true"]`,
      { timeout: 10_000 },
    )
  }

  // ── assertions ──────────────────────────────────────────────────────────

  // 1. Editor text matches the pre-expansion snapshot exactly
  const finalContent = await editorText(page)
  expect(finalContent, 'content after collapse must equal initial content').toBe(initialContent)

  // 2. No diff highlights — the inline style applied by diffExtension.ts is
  //    "border-left: 4px solid var(--rp-foam)"
  const diffHighlightCount = await page
    .locator('[style*="border-left: 4px solid"]')
    .count()
  expect(diffHighlightCount, 'no lines should be diff-highlighted after collapse').toBe(0)
})
