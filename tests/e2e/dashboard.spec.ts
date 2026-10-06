import { test, expect } from "@playwright/test"
import { registerOrg, createProject, createNode } from "../fixtures"

async function freshPage(browser: import("@playwright/test").Browser) {
  const org = await registerOrg()
  const ctx = await browser.newContext({ storageState: await org.api.storageState(), baseURL: "http://localhost:3100" })
  const page = await ctx.newPage()
  const me = (await (await org.api.get("/api/auth/session")).json()).user.id as string
  return { ...org, ctx, page, me }
}

test.describe("/dashboard page", () => {
  test("empty org shows zeroed stats and empty-state messages", async ({ browser }) => {
    const { ctx, page, api } = await freshPage(browser)
    await page.goto("/dashboard")
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible()
    await expect(page.getByText("No nodes yet")).toBeVisible()
    await expect(page.getByText("No overspent nodes")).toBeVisible()
    await expect(page.getByText("No recent activity")).toBeVisible()
    await expect(page.getByText("$0.00").first()).toBeVisible()
    await expect(page.getByText("0% of budget")).toBeVisible()
    await ctx.close(); await api.dispose()
  })

  test("page counts only root budgets and shows status + activity", async ({ browser }) => {
    const { ctx, page, api, me } = await freshPage(browser)
    const { rootId } = await createProject(api, "10000.00")
    await createNode(api, rootId, "4000.00", me)
    await page.goto("/dashboard")
    await expect(page.getByText("$10,000.00").first()).toBeVisible()
    await expect(page.getByText("$14,000.00")).toHaveCount(0)
    await expect(page.getByText("Planned")).toBeVisible()
    await expect(page.getByText("Recent Activity")).toBeVisible()
    await expect(page.getByText("node created").first()).toBeVisible()
    await ctx.close(); await api.dispose()
  })

  test("dashboard page total budget and /api/dashboard should agree", async ({ browser }) => {
    const { ctx, page, api, me } = await freshPage(browser)
    const { rootId } = await createProject(api, "10000.00")
    await createNode(api, rootId, "4000.00", me)
    await page.goto("/dashboard")
    await expect(page.getByText("$10,000.00").first()).toBeVisible()
    const d = (await (await api.get("/api/dashboard")).json()).data
    expect(Number(d.totalBudget)).toBe(10000)
    await ctx.close(); await api.dispose()
  })

  test("Active Projects card counts active projects", async ({ browser }) => {
    const { ctx, page, api } = await freshPage(browser)
    await createProject(api, "100.00")
    await createProject(api, "100.00")
    await page.goto("/dashboard")
    await expect(page.getByText("Active Projects", { exact: true })).toBeVisible()
    // 4th stat card value (Total Budget, Spent, Remaining, Active Projects)
    await expect(page.locator("p.text-2xl").nth(3)).toHaveText("2")
    await ctx.close(); await api.dispose()
  })

  test.skip("error boundary: 'Database unavailable' / 'Something went wrong' / 'Try again' (needs DB outage or injected server error; shared Postgres must not be stopped)", async () => {})
})

test.describe("/projects page", () => {
  test("empty org shows empty state", async ({ browser }) => {
    const { ctx, page, api } = await freshPage(browser)
    await page.goto("/projects")
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible()
    await expect(page.getByText("0 projects")).toBeVisible()
    await expect(page.getByText("No projects yet")).toBeVisible()
    await ctx.close(); await api.dispose()
  })

  test("lists created projects as cards linking to detail", async ({ browser }) => {
    const { ctx, page, api } = await freshPage(browser)
    const { projectId } = await createProject(api, "2500.00", "Card Project One")
    await page.goto("/projects")
    await expect(page.getByText("1 project", { exact: true })).toBeVisible()
    const link = page.getByRole("link", { name: /Card Project One/ })
    await expect(link).toHaveAttribute("href", `/projects/${projectId}`)
    await expect(link.getByText("ACTIVE")).toBeVisible()
    await expect(link.getByText("$2,500.00 total")).toBeVisible()
    await expect(link.getByText("1 nodes")).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
    await ctx.close(); await api.dispose()
  })
})
