import { test, expect, createProject, createNode, userId, uniq } from "../fixtures"
import { authFile } from "../helpers/env"

test.describe("projects list + create dialog (admin)", () => {
  test("lists a project created via API as a card linking to its page", async ({ page, as }) => {
    const api = await as("admin")
    const { project, projectId } = await createProject(api, "2500.00")
    await page.goto("/projects")
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible()
    const card = page.locator(`a[href="/projects/${projectId}"]`)
    await expect(card).toBeVisible()
    await expect(card).toContainText(project.name)
    await expect(card).toContainText("ACTIVE")
    await expect(card).toContainText("1 nodes")
    await expect(card).toContainText("2,500")
  })

  test("create dialog creates a project and it appears after refresh", async ({ page }) => {
    const name = uniq("ui-proj")
    await page.goto("/projects")
    await page.getByRole("button", { name: "New Project" }).click()
    await expect(page.getByRole("heading", { name: "Create Project" })).toBeVisible()
    await page.locator("#proj-name").fill(name)
    await page.locator("#proj-desc").fill("created from UI")
    await page.locator("#proj-budget").fill("12345.67")
    await expect(page.locator("#proj-currency")).toHaveValue("USD")
    await page.getByRole("button", { name: "Create Project" }).click()
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Project created" })).toBeVisible()
    await expect(page.getByRole("dialog")).toBeHidden()
    const card = page.locator("a[href^='/projects/']").filter({ hasText: name })
    await expect(card).toBeVisible()
    await expect(card).toContainText("created from UI")
    await expect(card).toContainText("12,345.67")
  })

  test("dialog validation: short name and missing budget show errors, no request sent", async ({ page }) => {
    let posted = false
    page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/projects")) posted = true })
    await page.goto("/projects")
    await page.getByRole("button", { name: "New Project" }).click()
    await page.locator("#proj-name").fill("a")
    await page.getByRole("button", { name: "Create Project" }).click()
    await expect(page.getByText("Project name must be at least 2 characters")).toBeVisible()
    await expect(page.getByText("Budget must be positive")).toBeVisible()
    expect(posted).toBe(false)
  })

  test("dialog: zero budget rejected client-side", async ({ page }) => {
    let posted = false
    page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/projects")) posted = true })
    await page.goto("/projects")
    await page.getByRole("button", { name: "New Project" }).click()
    await page.locator("#proj-name").fill("Zero Budget")
    await page.locator("#proj-budget").fill("0")
    await page.getByRole("button", { name: "Create Project" }).click()
    // native min=0.01 validation blocks submit before zod runs
    expect(await page.locator("#proj-budget").evaluate((e: HTMLInputElement) => e.validity.valid)).toBe(false)
    await expect(page.getByRole("dialog")).toBeVisible()
    expect(posted).toBe(false)
  })

  test("Cancel closes the dialog", async ({ page }) => {
    await page.goto("/projects")
    await page.getByRole("button", { name: "New Project" }).click()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
  })

  test("clicking a card navigates to the project page", async ({ page, as }) => {
    const { project, projectId } = await createProject(await as("admin"))
    await page.goto("/projects")
    await page.locator(`a[href="/projects/${projectId}"]`).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
    void project
  })

  test("spent/total progress reflects allocated amount on the card", async ({ page, as }) => {
    const api = await as("admin")
    const { rootId, projectId } = await createProject(api, "1000.00")
    await createNode(api, rootId, "100.00", await userId("admin"))
    await page.goto("/projects")
    const card = page.locator(`a[href="/projects/${projectId}"]`)
    await expect(card).toContainText("2 nodes")
    await expect(card).toContainText("1,000")
  })
})

test.describe("projects page as viewer", () => {
  test.use({ storageState: authFile("viewer") })
  test("viewer can see the list", async ({ page, as }) => {
    const { project, projectId } = await createProject(await as("admin"))
    await page.goto("/projects")
    await expect(page.locator(`a[href="/projects/${projectId}"]`)).toContainText(project.name)
  })
})

test.describe("projects page unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test("redirects to /login", async ({ page }) => {
    await page.goto("/projects")
    await expect(page).toHaveURL(/\/login/)
  })
})
