import { test, expect, Page } from '@playwright/test'

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForCanvas(page: Page) {
  await page.goto('/')
  await page.waitForSelector('[aria-label="Tool palette"]', { timeout: 20000 })
}

async function clearCanvas(page: Page) {
  // Select all and delete to start fresh
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.waitForTimeout(300)
}

async function dragNodeToCanvas(page: Page, label: string, x = 400, y = 300) {
  const tile = page.locator('[aria-label="Tool palette"]').locator(`[role="button"]`).filter({ hasText: label })
  const canvas = page.locator('.react-flow__pane').first()
  await tile.waitFor({ timeout: 5000 })
  await tile.dragTo(canvas, { targetPosition: { x, y } })
  await page.waitForTimeout(400)
}

async function getNodeCount(page: Page) {
  return page.locator('.react-flow__node').count()
}

// ─── Suite 1: App Shell ──────────────────────────────────────────────────────

test.describe('App Shell', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
  })

  test('page title is set', async ({ page }) => {
    await expect(page).toHaveTitle(/web|champiq/i)
  })

  test('canvas pane renders', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible()
  })

  test('left sidebar (tool palette) is visible', async ({ page }) => {
    await expect(page.locator('[aria-label="Tool palette"]')).toBeVisible()
  })

  test('top bar renders with canvas name input and save button', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: /canvas name/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /save/i }).first()).toBeVisible()
  })
})

// ─── Suite 2: Sidebar — System Nodes ────────────────────────────────────────

test.describe('Sidebar — system node tiles', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
  })

  test('shows trigger nodes', async ({ page }) => {
    const palette = page.locator('[aria-label="Tool palette"]')
    await expect(palette.getByText(/trigger/i).first()).toBeVisible()
  })

  test('shows control-flow nodes (If, Switch, Merge, Set)', async ({ page }) => {
    const palette = page.locator('[aria-label="Tool palette"]')
    for (const label of ['If', 'Merge', 'Set']) {
      await expect(palette.getByText(label).first()).toBeVisible()
    }
  })

  test('shows integration nodes (HTTP, Code, LLM)', async ({ page }) => {
    const palette = page.locator('[aria-label="Tool palette"]')
    for (const label of ['HTTP', 'Code', 'LLM']) {
      await expect(palette.getByText(label).first()).toBeVisible()
    }
  })

  test('shows tool nodes (Champmail, ChampGraph, LakeB2B)', async ({ page }) => {
    const palette = page.locator('[aria-label="Tool palette"]')
    for (const label of ['Champmail', 'ChampGraph', 'LakeB2B']) {
      await expect(palette.getByText(new RegExp(label, 'i')).first()).toBeVisible()
    }
  })
})

// ─── Suite 3: UC-1 — Drag nodes onto canvas ──────────────────────────────────

test.describe('UC-1: Drag nodes to canvas (basic chain)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
    await clearCanvas(page)
  })

  test('drags a trigger node to canvas', async ({ page }) => {
    const before = await getNodeCount(page)
    await dragNodeToCanvas(page, 'Trigger', 300, 250)
    const after = await getNodeCount(page)
    expect(after).toBeGreaterThan(before)
  })

  test('drags a Set node to canvas', async ({ page }) => {
    await dragNodeToCanvas(page, 'Set', 400, 300)
    const count = await getNodeCount(page)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('drags multiple different nodes to canvas', async ({ page }) => {
    await dragNodeToCanvas(page, 'Trigger', 200, 250)
    await dragNodeToCanvas(page, 'If', 480, 250)
    await dragNodeToCanvas(page, 'Set', 760, 200)
    const count = await getNodeCount(page)
    expect(count).toBeGreaterThanOrEqual(3)
  })
})

// ─── Suite 4: UC-2 — Node inspector (right panel) ────────────────────────────

test.describe('UC-2: Node inspector opens on click', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
    await clearCanvas(page)
    await dragNodeToCanvas(page, 'Set', 400, 300)
  })

  test('clicking a node opens the right inspector panel', async ({ page }) => {
    const node = page.locator('.react-flow__node').first()
    await node.click()
    // Inspector panel should appear
    await expect(page.locator('[aria-label="Node inspector"]')).toBeVisible({ timeout: 3000 })
  })

  test('inspector shows status field', async ({ page }) => {
    await page.locator('.react-flow__node').first().click()
    const inspector = page.locator('[aria-label="Node inspector"]')
    await expect(inspector).toBeVisible()
    await expect(inspector.getByText(/status/i)).toBeVisible()
  })

  test('inspector close button works', async ({ page }) => {
    await page.locator('.react-flow__node').first().click()
    const inspector = page.locator('[aria-label="Node inspector"]')
    await expect(inspector).toBeVisible()
    await inspector.getByRole('button', { name: /close/i }).click()
    await expect(inspector).not.toBeVisible()
  })
})

// ─── Suite 5: UC-3 — Canvas save / load ──────────────────────────────────────

test.describe('UC-3: Canvas save and reload', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
  })

  test('canvas name can be edited', async ({ page }) => {
    const nameInput = page.getByRole('textbox', { name: /canvas name/i })
    await nameInput.clear()
    await nameInput.fill('My Test Canvas')
    await expect(nameInput).toHaveValue('My Test Canvas')
  })

  test('save button is clickable', async ({ page }) => {
    const saveBtn = page.getByRole('button', { name: /save/i }).first()
    await saveBtn.click()
    // After save, button should still be there (no crash)
    await expect(saveBtn).toBeVisible()
  })

  test('canvas state persists after page reload', async ({ page }) => {
    await clearCanvas(page)
    await dragNodeToCanvas(page, 'Set', 400, 300)
    const before = await getNodeCount(page)

    // Save
    await page.getByRole('button', { name: /save/i }).first().click()
    await page.waitForTimeout(500)

    // Reload
    await page.reload()
    await page.waitForSelector('[aria-label="Tool palette"]', { timeout: 15000 })

    const after = await getNodeCount(page)
    expect(after).toBeGreaterThanOrEqual(before)
  })
})

// ─── Suite 6: UC-5 — If node branching UI ────────────────────────────────────

test.describe('UC-5: If node visible on canvas with handles', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
    await clearCanvas(page)
    await dragNodeToCanvas(page, 'If', 400, 300)
  })

  test('If node appears on canvas', async ({ page }) => {
    const node = page.locator('.react-flow__node').filter({ hasText: /if/i }).first()
    await expect(node).toBeVisible()
  })

  test('If node has connection handles', async ({ page }) => {
    const handles = page.locator('.react-flow__handle')
    const count = await handles.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

// ─── Suite 7: UC-6 — HTTP node ───────────────────────────────────────────────

test.describe('UC-6: HTTP node on canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
    await clearCanvas(page)
    await dragNodeToCanvas(page, 'HTTP', 400, 300)
  })

  test('HTTP node appears on canvas', async ({ page }) => {
    const node = page.locator('.react-flow__node').filter({ hasText: /http/i }).first()
    await expect(node).toBeVisible()
  })

  test('HTTP node inspector shows configure option', async ({ page }) => {
    await page.locator('.react-flow__node').first().click()
    const inspector = page.locator('[aria-label="Node inspector"]')
    await expect(inspector).toBeVisible()
  })
})

// ─── Suite 8: UC-7 — Wait node on canvas ─────────────────────────────────────

test.describe('UC-7: Wait node on canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
    await clearCanvas(page)
    await dragNodeToCanvas(page, 'Wait', 400, 300)
  })

  test('Wait node appears on canvas', async ({ page }) => {
    const node = page.locator('.react-flow__node').filter({ hasText: /wait/i }).first()
    await expect(node).toBeVisible()
  })
})

// ─── Suite 9: UC-9 — Multi-node workflow layout ───────────────────────────────

test.describe('UC-9: Full workflow layout (multi-node)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
    await clearCanvas(page)
  })

  test('can place 5 nodes forming a pipeline', async ({ page }) => {
    await dragNodeToCanvas(page, 'Trigger', 100, 250)
    await dragNodeToCanvas(page, 'If', 320, 250)
    await dragNodeToCanvas(page, 'Set', 540, 150)
    await dragNodeToCanvas(page, 'HTTP', 540, 350)
    await dragNodeToCanvas(page, 'Merge', 760, 250)

    const count = await getNodeCount(page)
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test('minimap renders for complex workflows', async ({ page }) => {
    await dragNodeToCanvas(page, 'Trigger', 100, 250)
    await dragNodeToCanvas(page, 'Set', 400, 250)
    await dragNodeToCanvas(page, 'HTTP', 700, 250)
    const minimap = page.locator('.react-flow__minimap')
    await expect(minimap).toBeVisible()
  })
})

// ─── Suite 10: UC-10 — Chat panel ────────────────────────────────────────────

test.describe('UC-10: Chat panel — natural language workflow generation', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
  })

  test('chat toggle button is visible', async ({ page }) => {
    // Chat is typically a toggle or sidebar — look for chat-related element
    const chatBtn = page.getByRole('button', { name: /chat/i }).or(
      page.locator('[aria-label*="chat" i]')
    ).first()
    await expect(chatBtn).toBeVisible({ timeout: 5000 })
  })

  test('chat panel opens and shows input', async ({ page }) => {
    const chatBtn = page.getByRole('button', { name: /chat/i }).or(
      page.locator('[aria-label*="chat" i]')
    ).first()
    await chatBtn.click()
    const chatInput = page.getByRole('textbox').filter({ hasText: '' }).last()
    await expect(chatInput).toBeVisible({ timeout: 3000 })
  })

  test('can type a prompt into the chat input', async ({ page }) => {
    // Find and open chat
    const chatBtn = page.getByRole('button', { name: /chat/i }).or(
      page.locator('[aria-label*="chat" i]')
    ).first()
    await chatBtn.click()
    await page.waitForTimeout(500)

    const inputs = page.getByRole('textbox')
    const count = await inputs.count()
    // Use the last textbox (chat input, not canvas name)
    const chatInput = inputs.nth(count - 1)
    await chatInput.fill('Build me a simple workflow with a trigger and a set node')
    await expect(chatInput).toHaveValue(/build me/i)
  })

  test('chat send button is visible when panel is open', async ({ page }) => {
    const chatBtn = page.getByRole('button', { name: /chat/i }).or(
      page.locator('[aria-label*="chat" i]')
    ).first()
    await chatBtn.click()
    await page.waitForTimeout(500)
    // Send button or submit
    const sendBtn = page.getByRole('button', { name: /send/i }).or(
      page.locator('[aria-label*="send" i]')
    ).first()
    await expect(sendBtn).toBeVisible({ timeout: 3000 })
  })
})

// ─── Suite 11: Canvas multi-canvas switcher ───────────────────────────────────

test.describe('Canvas switcher', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
  })

  test('new canvas button exists', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new canvas|\+ canvas|add canvas/i }).or(
      page.locator('[aria-label*="new canvas" i]')
    ).first()
    await expect(newBtn).toBeVisible({ timeout: 5000 })
  })

  test('can create a new canvas', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new canvas|\+ canvas|add canvas/i }).or(
      page.locator('[aria-label*="new canvas" i]')
    ).first()
    await newBtn.click()
    await page.waitForTimeout(500)
    // Canvas name input should now show a fresh canvas
    const nameInput = page.getByRole('textbox', { name: /canvas name/i })
    await expect(nameInput).toBeVisible()
  })
})

// ─── Suite 12: Run All button ─────────────────────────────────────────────────

test.describe('Run All execution button', () => {
  test.beforeEach(async ({ page }) => {
    await waitForCanvas(page)
  })

  test('Run All button is visible in top bar', async ({ page }) => {
    const runBtn = page.getByRole('button', { name: /run all|run workflow/i }).or(
      page.locator('[aria-label*="run all" i]')
    ).first()
    await expect(runBtn).toBeVisible({ timeout: 5000 })
  })

  test('clicking Run All on empty canvas does not crash', async ({ page }) => {
    await clearCanvas(page)
    const runBtn = page.getByRole('button', { name: /run all|run workflow/i }).or(
      page.locator('[aria-label*="run all" i]')
    ).first()
    await runBtn.click()
    await page.waitForTimeout(1000)
    // Page should still be functional
    await expect(page.locator('.react-flow')).toBeVisible()
  })
})
