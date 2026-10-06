import { test, expect } from "@playwright/test"
import { registerOrg } from "../fixtures"

test.describe("app shell navigation (admin)", () => {
  test("sidebar links navigate between sections", async ({ page }) => {
    await page.goto("/dashboard")
    const nav = page.locator("aside")
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard")
    await nav.getByRole("link", { name: "Projects" }).click()
    await expect(page).toHaveURL(/\/projects$/)
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible()
    await nav.getByRole("link", { name: "Settings" }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await nav.getByRole("link", { name: "Dashboard" }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test("active sidebar link is highlighted", async ({ page }) => {
    await page.goto("/projects")
    await expect(page.locator("aside").getByRole("link", { name: "Projects" })).toHaveClass(/font-medium/)
    await expect(page.locator("aside").getByRole("link", { name: "Dashboard" })).not.toHaveClass(/font-medium/)
  })

  test("top-nav breadcrumb reflects path and role badge shows role", async ({ page }) => {
    await page.goto("/settings")
    const header = page.locator("header")
    await expect(header.getByText("Settings")).toBeVisible()
    await expect(header.getByText("ADMIN")).toBeVisible()
  })

  test("user menu shows name and email", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    await expect(async () => {
      await page.locator("header").getByText("ADMIN").click()
      await expect(page.getByRole("menu")).toBeVisible({ timeout: 6000 })
    }).toPass()
    const menu = page.getByRole("menu")
    await expect(menu.getByText("Test Admin")).toBeVisible()
    await expect(menu.getByText("admin@a.test")).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible()
  })

  test("theme toggle: none exists in the app shell", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.getByRole("button", { name: /theme|dark|light/i })).toHaveCount(0)
  })
})

test.describe("sign out", () => {
  test("sign out returns to /login and protects the app afterwards", async ({ browser }) => {
    const org = await registerOrg()
    const ctx = await browser.newContext({ storageState: await org.api.storageState(), baseURL: "http://localhost:3100" })
    const page = await ctx.newPage()
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    await expect(async () => {
      await page.locator("header").getByText("ADMIN").click()
      await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible({ timeout: 6000 })
    }).toPass()
    await page.getByRole("menuitem", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
    const session = await (await page.request.get("/api/auth/session")).json()
    expect(session?.user).toBeUndefined()
    await ctx.close(); await org.api.dispose()
  })
})
