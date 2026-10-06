import { test, expect } from "@playwright/test"

test.describe("logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("/ redirects to /home", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/home$/)
  })

  test("landing page content and CTA links", async ({ page }) => {
    await page.goto("/home")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Control your budgets")
    await expect(page.getByRole("link", { name: "Log in" }).first()).toHaveAttribute("href", "/login")
    await expect(page.getByRole("link", { name: "Get Started" }).first()).toHaveAttribute("href", "/register")
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Audit Trail" })).toBeVisible()
  })

  test("Log in link navigates to /login form", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Log in" }).first().click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
  })

  test("Get Started link navigates to /register", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Get Started" }).first().click()
    await expect(page).toHaveURL(/\/register$/)
  })

  for (const path of ["/dashboard", "/projects", "/settings"]) {
    test(`${path} redirects to /login with callbackUrl`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login\?callbackUrl=/)
      expect(decodeURIComponent(page.url())).toContain(path)
    })
  }

  test("footer Dashboard link bounces logged-out user to login", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Dashboard" }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("logged in (admin)", () => {
  test("/ redirects to /dashboard", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible()
  })

  test("/home is still viewable when authenticated (no auth check)", async ({ page }) => {
    await page.goto("/home")
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Control your budgets")
  })

  test("/login while authenticated: observed behaviour (stays on login form, no redirect)", async ({ page }) => {
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
  })
})
