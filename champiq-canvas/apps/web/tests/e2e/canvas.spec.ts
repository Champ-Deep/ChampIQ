import { test, expect } from '@playwright/test'

test.describe('ChampIQ Canvas smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for tool palette to load (manifests fetched from API).
    await page.waitForSelector('[aria-label="Tool palette"]', { timeout: 15000 })
  })

  test('shows three tool tiles in sidebar', async ({ page }) => {
    const sidebar = page.locator('[aria-label="Tool palette"]')
    await expect(sidebar.locator('[role="button"]')).toHaveCount(3)
    await expect(page.getByRole('button', { name: /ChampGraph Query/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Champmail Outreach/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /ChampVoice Call/i })).toBeVisible()
  })

  test('drags ChampGraph node to canvas', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    const tile = page.getByRole('button', { name: /ChampGraph Query/i })

    await tile.dragTo(canvas, { targetPosition: { x: 300, y: 250 } })

    await expect(page.locator('.react-flow__node')).toHaveCount(1)
  })

  test('drags all three nodes to canvas', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')

    await page.getByRole('button', { name: /ChampGraph Query/i })
      .dragTo(canvas, { targetPosition: { x: 200, y: 200 } })
    await page.getByRole('button', { name: /Champmail Outreach/i })
      .dragTo(canvas, { targetPosition: { x: 500, y: 200 } })
    await page.getByRole('button', { name: /ChampVoice Call/i })
      .dragTo(canvas, { targetPosition: { x: 500, y: 400 } })

    await expect(page.locator('.react-flow__node')).toHaveCount(3)
  })

  test('top bar shows canvas name input and save button', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: /Canvas name/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Save canvas/i })).toBeVisible()
  })
})
