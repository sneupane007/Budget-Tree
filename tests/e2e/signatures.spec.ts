import { test, expect, createProject, resetStorage, storedObjects } from "../fixtures"
import { getPool } from "../helpers/db"
import { authFile } from "../helpers/env"
import type { Page } from "@playwright/test"

async function openSignTab(page: Page, projectId: string, nodeId: string) {
  await page.goto(`/projects/${projectId}`)
  await page.locator(`.react-flow__node[data-id="${nodeId}"]`).click()
  await page.getByRole("tab", { name: "Sign" }).click()
}

async function draw(page: Page) {
  const box = await page.locator("canvas").boundingBox()
  if (!box) throw new Error("no canvas")
  await page.mouse.move(box.x + 20, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 80, { steps: 10 })
  await page.mouse.move(box.x + 140, box.y + 30, { steps: 10 })
  await page.mouse.move(box.x + 200, box.y + 70, { steps: 10 })
  await page.mouse.up()
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text })

test.describe("signature pad (admin)", () => {
  test.beforeEach(async () => { await resetStorage() })

  test("blank submit shows 'Please draw your signature' and posts nothing", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    let posted = 0
    await page.route("**/api/signatures", (r) => { posted++; r.continue() })
    await openSignTab(page, projectId, rootId)
    await page.getByRole("button", { name: "Submit Signature" }).click()
    await expect(toast(page, "Please draw your signature")).toBeVisible()
    expect(posted).toBe(0)
  })

  test("name and email are prefilled from the session", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openSignTab(page, projectId, rootId)
    await expect(page.locator("input").first()).toHaveValue("Test Admin")
    await expect(page.locator('input[type="email"]')).toHaveValue("admin@a.test")
  })

  test("draw + submit as OWNER stores signature and moves node to PENDING_VERIFICATION", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openSignTab(page, projectId, rootId)
    await draw(page)
    await page.getByRole("button", { name: "Submit Signature" }).click()
    await expect(toast(page, "Signature submitted")).toBeVisible()

    const { rows } = await getPool().query(`SELECT role,"signerEmail" FROM "Signature" WHERE "nodeId"=$1`, [rootId])
    expect(rows).toEqual([{ role: "OWNER", signerEmail: "admin@a.test" }])
    const objs = await storedObjects()
    expect(objs).toHaveLength(1)
    expect(objs[0].key.startsWith("signatures/")).toBe(true)
    expect(objs[0].size).toBeGreaterThan(50)
    const st = await getPool().query(`SELECT status FROM "BudgetNode" WHERE id=$1`, [rootId])
    expect(st.rows[0].status).toBe("PENDING_VERIFICATION")
  })

  test("BUG(11): status badge updates to Pending immediately after OWNER signature", async ({ page, as }) => {
    test.fail(true, "BUG: globalMutate(`/api/nodes/:id`) returns undefined when no SWR hook is mounted on the Sign tab, so the store/badge stays 'Planned'")
    const { projectId, rootId } = await createProject(await as("admin"))
    await openSignTab(page, projectId, rootId)
    await draw(page)
    await page.getByRole("button", { name: "Submit Signature" }).click()
    await expect(toast(page, "Signature submitted")).toBeVisible()
    await expect(page.locator(`.react-flow__node[data-id="${rootId}"]`).getByText("Pending", { exact: true })).toBeVisible({ timeout: 5000 })
  })

  test("after reload the badge shows Pending", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openSignTab(page, projectId, rootId)
    await draw(page)
    await page.getByRole("button", { name: "Submit Signature" }).click()
    await expect(toast(page, "Signature submitted")).toBeVisible()
    await page.reload()
    await expect(page.locator(`.react-flow__node[data-id="${rootId}"]`).getByText("Pending", { exact: true })).toBeVisible()
  })

  test("Clear empties the pad (subsequent submit is treated as blank)", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openSignTab(page, projectId, rootId)
    await draw(page)
    await page.getByRole("button", { name: "Clear" }).click()
    await page.getByRole("button", { name: "Submit Signature" }).click()
    await expect(toast(page, "Please draw your signature")).toBeVisible()
  })

  test("API failure shows an error toast", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openSignTab(page, projectId, rootId)
    await page.route("**/api/signatures", (r) =>
      r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ data: null, error: "Internal server error" }) })
    )
    await draw(page)
    await page.getByRole("button", { name: "Submit Signature" }).click()
    await expect(toast(page, "Internal server error")).toBeVisible()
  })

  test("invalid name (1 char) is rejected by the API and surfaced", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openSignTab(page, projectId, rootId)
    await page.locator("input").first().fill("J")
    await draw(page)
    await page.getByRole("button", { name: "Submit Signature" }).click()
    await expect(toast(page, "Validation failed")).toBeVisible()
    expect(await storedObjects()).toHaveLength(0)
  })
})

test.describe("signature pad (viewer)", () => {
  test.use({ storageState: authFile("viewer") })

  test("viewer sees 'Viewers cannot submit signatures.' and no canvas", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openSignTab(page, projectId, rootId)
    await expect(page.getByText("Viewers cannot submit signatures.")).toBeVisible()
    await expect(page.locator("canvas")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Submit Signature" })).toHaveCount(0)
  })
})
