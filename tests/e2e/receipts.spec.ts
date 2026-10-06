import { test, expect, data, createProject, resetStorage, storedObjects } from "../fixtures"
import type { Page } from "@playwright/test"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)

async function openReceiptsTab(page: Page, projectId: string, nodeId: string) {
  await page.goto(`/projects/${projectId}`)
  await page.locator(`.react-flow__node[data-id="${nodeId}"]`).click()
  await page.getByRole("tab", { name: "Receipts" }).click()
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text })

test.describe("receipts tab", () => {
  test.beforeEach(async () => { await resetStorage() })

  test("empty state, then uploader shows form only after a file is chosen", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openReceiptsTab(page, projectId, rootId)
    await expect(page.getByText("No receipts uploaded yet")).toBeVisible()
    await expect(page.getByText("Drop receipt here or click to browse")).toBeVisible()
    await expect(page.getByRole("button", { name: "Upload Receipt" })).toHaveCount(0)

    await page.locator("input[type=file]").setInputFiles({ name: "lunch.png", mimeType: "image/png", buffer: PNG })
    await expect(page.getByText("lunch.png")).toBeVisible()
    const upload = page.getByRole("button", { name: "Upload Receipt" })
    await expect(upload).toBeDisabled() // amount required
    await page.locator('input[type=number][placeholder="0.00"]').fill("12.50")
    await expect(upload).toBeEnabled()
  })

  test("removing the chosen file hides the form again", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openReceiptsTab(page, projectId, rootId)
    await page.locator("input[type=file]").setInputFiles({ name: "lunch.png", mimeType: "image/png", buffer: PNG })
    await page.locator("button:has(svg.lucide-x)").last().click()
    await expect(page.getByText("Drop receipt here or click to browse")).toBeVisible()
    await expect(page.getByRole("button", { name: "Upload Receipt" })).toHaveCount(0)
  })

  test("disallowed file type is rejected with an error toast", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openReceiptsTab(page, projectId, rootId)
    await page.locator("input[type=file]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") })
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Upload Receipt" })).toHaveCount(0)
    expect(await storedObjects()).toHaveLength(0)
  })

  test("uploading via the UI shows 'Receipt uploaded' and lists the receipt", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openReceiptsTab(page, projectId, rootId)
    await page.locator("input[type=file]").setInputFiles({ name: "lunch.png", mimeType: "image/png", buffer: PNG })
    await page.locator('input[type=number][placeholder="0.00"]').fill("12.50")
    await page.getByPlaceholder("Vendor name").fill("Cafe")
    await page.getByRole("button", { name: "Upload Receipt" }).click()
    await expect(toast(page, "Receipt uploaded")).toBeVisible()
    await expect(page.getByText(/Cafe/)).toBeVisible()
    expect(await storedObjects()).toHaveLength(1)
  })

  test("UI upload failure surfaces the API error toast and keeps the form", async ({ page, as }) => {
    const { projectId, rootId } = await createProject(await as("admin"))
    await openReceiptsTab(page, projectId, rootId)
    await page.locator("input[type=file]").setInputFiles({ name: "lunch.png", mimeType: "image/png", buffer: PNG })
    await page.locator('input[type=number][placeholder="0.00"]').fill("12.50")
    await page.route("**/api/receipts", (r) =>
      r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ data: null, error: "Internal server error" }) })
    )
    await page.getByRole("button", { name: "Upload Receipt" }).click()
    await expect(toast(page, "Internal server error")).toBeVisible()
    await expect(page.getByRole("button", { name: "Upload Receipt" })).toBeVisible()
  })

  test("receipt created via API appears in the list and opens a signed URL", async ({ page, as, context }) => {
    const api = await as("admin")
    const { projectId, rootId } = await createProject(api)
    const res = await api.post("/api/receipts", {
      multipart: {
        file: { name: "r.png", mimeType: "image/png", buffer: PNG },
        nodeId: rootId, amount: "42.00", vendor: "Hardware Co", receiptDate: "2024-03-05", notes: "n",
      },
    })
    await data(res, 201)
    await openReceiptsTab(page, projectId, rootId)
    await expect(page.getByText("Hardware Co")).toBeVisible()
    await expect(page.getByText(/\$42\.00/)).toBeVisible()
    await expect(page.getByText("No receipts uploaded yet")).toHaveCount(0)

    const popup = context.waitForEvent("page")
    await page.locator("button:has(svg.lucide-external-link)").click()
    const p = await popup
    expect(p.url()).toContain("/object/sign/receipts/")
    expect(p.url()).toContain("token=")
  })
})
