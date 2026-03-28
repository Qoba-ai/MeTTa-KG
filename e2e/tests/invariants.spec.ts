/**
 * E2E tests for the MeTTa editor invariants described in INVARIANTS.md.
 *
 * Invariant 1 — MeTTa is collapsed beyond first sub-key
 *   When loading a space whose fringe has multiple sub-paths under a key,
 *   that key is shown as "(key $)" in the editor, not fully expanded.
 *
 * Invariant 2 — "$" symbols correspond to collapsed child nodes in the trie
 *   For a line like "(foo $)" the trie shows "foo" as an open parent with a
 *   collapsed "$" child at path "/foo/$/".  Clicking that "$" child expands
 *   it, replacing "(foo $)" in the editor with the one-level-deeper content.
 *
 * Invariant 3 — collapsing and expanding are inverses
 *   After expanding a "$" node, clicking it again restores the exact content
 *   that was present before the expansion.
 *
 * Invariant 4 — expanding "$" reveals only one level beyond the current key
 *   Expanding a "$" node shows the immediate sub-keys each collapsed behind
 *   their own "$" markers — it does NOT recurse all the way to terminals.
 *
 * The global-setup.ts seeds the root namespace "/" with:
 *   (foo (alpha 1))
 *   (foo (alpha 2))
 *   (foo (beta  3))
 *   (foo (beta  4))
 *   (bar (gamma 5))
 *   (bar (gamma 6))
 *   (bar (delta 7))
 *   (bar (delta 8))
 *
 * Because "foo" and "bar" each have ≥ 2 sub-paths, the explore algorithm
 * consolidates them into a single fringe marker per key, so the initial
 * display is:
 *   (bar $)
 *   (foo $)
 *
 * Each sub-key (alpha, beta, gamma, delta) also has ≥ 2 entries, so that
 * expanding a top-level "$" reveals the next level as fringe markers rather
 * than raw terminals (needed for Invariant 4 assertions).
 */

import { test, expect, type Page } from '@playwright/test'

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Return an array of trimmed non-empty lines from the editor.
 * CodeMirror 6 renders each line as a separate .cm-line element, so we
 * query them individually rather than relying on textContent newlines.
 */
async function getEditorLines(page: Page): Promise<string[]> {
  const raw = await page.locator('.cm-line').allTextContents()
  return raw.map(l => l.trim()).filter(l => l.length > 0)
}

/** Return the editor content as a single newline-joined string. */
async function getEditorText(page: Page): Promise<string> {
  return (await getEditorLines(page)).join('\n')
}

/**
 * Wait for the editor to contain non-empty content.
 * The app loads asynchronously; we poll until text appears.
 */
async function waitForEditorContent(page: Page): Promise<void> {
  await expect(async () => {
    const lines = await getEditorLines(page)
    expect(lines.length).toBeGreaterThan(0)
  }).toPass({ timeout: 30_000, intervals: [300] })
}

// ── test suite ───────────────────────────────────────────────────────────────

test.describe('Invariants', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // The editor auto-loads the root namespace because VITE_TOKEN is set.
    await waitForEditorContent(page)
  })

  // ── Invariant 1 ───────────────────────────────────────────────────────────

  test.describe('Invariant 1 — collapsed beyond first sub-key', () => {
    test('editor shows at least one "$" fringe marker on initial load', async ({ page }) => {
      const lines = await getEditorLines(page)
      const fringeLines = lines.filter(l => l.includes('$'))
      expect(fringeLines.length).toBeGreaterThan(0)
    })

    test('editor shows "(bar $)" for bar whose sub-paths are consolidated', async ({ page }) => {
      const lines = await getEditorLines(page)
      expect(lines).toContain('(bar $)')
    })

    test('editor shows "(foo $)" for foo whose sub-paths are consolidated', async ({ page }) => {
      const lines = await getEditorLines(page)
      expect(lines).toContain('(foo $)')
    })

    test('editor does NOT show the raw terminal values of foo on initial load', async ({ page }) => {
      // The terminals (foo (alpha 1)) etc. should be hidden behind the "$"
      const text = await getEditorText(page)
      expect(text).not.toContain('(foo (alpha')
      expect(text).not.toContain('(foo (beta')
    })

    test('trie explorer shows collapsed "$" child nodes for each "$" in the editor', async ({ page }) => {
      // Every "$" line in the editor must have a matching fringe "$" child in
      // the trie at path "/key/$/".
      const fringeToggles = page.locator('[data-testid="trie-toggle"][data-trie-fringe="true"]')
      const count = await fringeToggles.count()
      expect(count).toBeGreaterThan(0)

      const lines = await getEditorLines(page)
      const fringeLineCount = lines.filter(l => l.endsWith('$)')).length
      // Each fringe toggle must correspond to a "$"-containing line in the editor
      expect(fringeLineCount).toBeGreaterThanOrEqual(count)
    })
  })

  // ── Invariant 2 ───────────────────────────────────────────────────────────

  test.describe('Invariant 2 — "$" corresponds to a collapsed "$" child in the trie', () => {
    test('trie shows "foo" as an open parent with a collapsed "$" child', async ({ page }) => {
      // The "foo" node itself should be visible; it is the open parent.
      const fooNode = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/"]')
      await expect(fooNode).toBeVisible()

      // The "$" child under "foo" should exist and be collapsed.
      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')
      await expect(fooDollar).toBeVisible()
      await expect(fooDollar).toHaveAttribute('data-trie-open', 'false')
    })

    test('trie shows "bar" as an open parent with a collapsed "$" child', async ({ page }) => {
      const barNode = page.locator('[data-testid="trie-toggle"][data-trie-path="/bar/"]')
      await expect(barNode).toBeVisible()

      const barDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/bar/$/"]')
      await expect(barDollar).toBeVisible()
      await expect(barDollar).toHaveAttribute('data-trie-open', 'false')
    })

    test('clicking "$" child of foo replaces "(foo $)" with its sub-content', async ({ page }) => {
      const linesBefore = await getEditorLines(page)
      expect(linesBefore).toContain('(foo $)')

      // Click the "$" child node to expand foo
      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')
      await fooDollar.click()

      // Wait for the editor to update (network call to /explore/foo/)
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(foo $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      // The editor should now contain foo's concrete sub-values
      const linesAfter = await getEditorLines(page)
      const fooLines = linesAfter.filter(l => l.startsWith('(foo'))
      expect(fooLines.length).toBeGreaterThan(0)
      expect(linesAfter).not.toContain('(foo $)')
    })

    test('clicking "$" child of bar replaces "(bar $)" with its sub-content', async ({ page }) => {
      const linesBefore = await getEditorLines(page)
      expect(linesBefore).toContain('(bar $)')

      const barDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/bar/$/"]')
      await barDollar.click()

      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(bar $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      const linesAfter = await getEditorLines(page)
      const barLines = linesAfter.filter(l => l.startsWith('(bar'))
      expect(barLines.length).toBeGreaterThan(0)
      expect(linesAfter).not.toContain('(bar $)')
    })

    test('"$" child opens after expanding and sub-key nodes become visible in trie', async ({ page }) => {
      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')
      await fooDollar.click()

      // Wait for the expand to complete
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(foo $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      // The "$" node for foo should now be open
      await expect(fooDollar).toHaveAttribute('data-trie-open', 'true')

      // Sub-key nodes (alpha, beta) should be visible in the trie
      const alphaTrie = page.locator('[data-trie-path="/foo/alpha/"]')
      await expect(alphaTrie).toBeVisible()
      const betaTrie = page.locator('[data-trie-path="/foo/beta/"]')
      await expect(betaTrie).toBeVisible()
    })
  })

  // ── Invariant 3 ───────────────────────────────────────────────────────────

  test.describe('Invariant 3 — collapsing and expanding are inverses', () => {
    test('expanding then collapsing foo restores original editor content', async ({ page }) => {
      const originalLines = await getEditorLines(page)
      expect(originalLines).toContain('(foo $)')

      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')

      // Expand
      await fooDollar.click()
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(foo $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      // Collapse
      await fooDollar.click()
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).toContain('(foo $)')
      }).toPass({ timeout: 10_000, intervals: [300] })

      const restoredLines = await getEditorLines(page)
      expect(restoredLines).toEqual(originalLines)
    })

    test('expanding then collapsing bar restores original editor content', async ({ page }) => {
      const originalLines = await getEditorLines(page)
      expect(originalLines).toContain('(bar $)')

      const barDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/bar/$/"]')

      // Expand
      await barDollar.click()
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(bar $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      // Collapse
      await barDollar.click()
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).toContain('(bar $)')
      }).toPass({ timeout: 10_000, intervals: [300] })

      const restoredLines = await getEditorLines(page)
      expect(restoredLines).toEqual(originalLines)
    })

    test('multiple expand/collapse cycles are idempotent', async ({ page }) => {
      const originalLines = await getEditorLines(page)

      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')

      for (let cycle = 0; cycle < 3; cycle++) {
        // Expand
        await fooDollar.click()
        await expect(async () => {
          const lines = await getEditorLines(page)
          expect(lines).not.toContain('(foo $)')
        }).toPass({ timeout: 15_000, intervals: [300] })

        // Collapse
        await fooDollar.click()
        await expect(async () => {
          const lines = await getEditorLines(page)
          expect(lines).toContain('(foo $)')
        }).toPass({ timeout: 10_000, intervals: [300] })
      }

      const finalLines = await getEditorLines(page)
      expect(finalLines).toEqual(originalLines)
    })

    test('expanding foo does not affect bar, and vice-versa', async ({ page }) => {
      const originalLines = await getEditorLines(page)
      expect(originalLines).toContain('(bar $)')
      expect(originalLines).toContain('(foo $)')

      // Expand foo — bar should still be collapsed
      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')
      await fooDollar.click()
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(foo $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      const linesWithFooExpanded = await getEditorLines(page)
      expect(linesWithFooExpanded).toContain('(bar $)')

      // Collapse foo again
      await fooDollar.click()
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).toContain('(foo $)')
      }).toPass({ timeout: 10_000, intervals: [300] })

      // Now expand bar — foo should still be collapsed
      const barDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/bar/$/"]')
      await barDollar.click()
      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(bar $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      const linesWithBarExpanded = await getEditorLines(page)
      expect(linesWithBarExpanded).toContain('(foo $)')
    })
  })

  // ── Invariant 4 ───────────────────────────────────────────────────────────

  test.describe('Invariant 4 — expanding "$" reveals only one level deeper', () => {
    test('expanding "(foo $)" reveals "(foo (alpha $))" and "(foo (beta $))", not raw terminals', async ({ page }) => {
      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')
      await fooDollar.click()

      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(foo $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      const linesAfter = await getEditorLines(page)

      // Should show one-level-deeper fringe markers, not raw terminals
      expect(linesAfter).toContain('(foo (alpha $))')
      expect(linesAfter).toContain('(foo (beta $))')

      // Should NOT jump all the way to terminal values
      expect(linesAfter).not.toContain('(foo (alpha 1))')
      expect(linesAfter).not.toContain('(foo (alpha 2))')
      expect(linesAfter).not.toContain('(foo (beta 3))')
      expect(linesAfter).not.toContain('(foo (beta 4))')
    })

    test('expanding "(bar $)" reveals "(bar (gamma $))" and "(bar (delta $))", not raw terminals', async ({ page }) => {
      const barDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/bar/$/"]')
      await barDollar.click()

      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(bar $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      const linesAfter = await getEditorLines(page)

      expect(linesAfter).toContain('(bar (gamma $))')
      expect(linesAfter).toContain('(bar (delta $))')

      expect(linesAfter).not.toContain('(bar (gamma 5))')
      expect(linesAfter).not.toContain('(bar (gamma 6))')
      expect(linesAfter).not.toContain('(bar (delta 7))')
      expect(linesAfter).not.toContain('(bar (delta 8))')
    })

    test('trie shows new "$" child nodes under alpha and beta after expanding foo', async ({ page }) => {
      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')
      await fooDollar.click()

      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(foo $)')
      }).toPass({ timeout: 15_000, intervals: [300] })

      // The trie should now show alpha and beta each with their own "$" child
      const alphaDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/alpha/$/"]')
      await expect(alphaDollar).toBeVisible()
      await expect(alphaDollar).toHaveAttribute('data-trie-open', 'false')

      const betaDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/beta/$/"]')
      await expect(betaDollar).toBeVisible()
      await expect(betaDollar).toHaveAttribute('data-trie-open', 'false')
    })

    test('expanding "$" of foo then "$" of alpha reveals the next deeper level', async ({ page }) => {
      // Expand foo's "$"
      const fooDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/$/"]')
      await fooDollar.click()

      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).toContain('(foo (alpha $))')
      }).toPass({ timeout: 15_000, intervals: [300] })

      // Now expand alpha's "$"
      const alphaDollar = page.locator('[data-testid="trie-toggle"][data-trie-path="/foo/alpha/$/"]')
      await alphaDollar.click()

      await expect(async () => {
        const lines = await getEditorLines(page)
        expect(lines).not.toContain('(foo (alpha $))')
      }).toPass({ timeout: 15_000, intervals: [300] })

      // alpha's terminals (1, 2) should now be visible
      const linesAfter = await getEditorLines(page)
      const alphaLines = linesAfter.filter(l => l.startsWith('(foo (alpha'))
      expect(alphaLines.length).toBeGreaterThan(0)
      // foo's beta should still be collapsed at the "$" level
      expect(linesAfter).toContain('(foo (beta $))')
    })
  })
})
