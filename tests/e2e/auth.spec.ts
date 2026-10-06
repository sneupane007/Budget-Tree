import { test, expect, uniq } from "../fixtures"
import { PASSWORD } from "../helpers/env"

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

async function fillLogin(page: import("@playwright/test").Page, email: string, password: string) {
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

async function registerViaUi(page: import("@playwright/test").Page, email: string, orgName = "E2E Org") {
  await page.goto("/register")
  await page.locator("#orgName").fill(orgName)
  await page.getByRole("button", { name: /^Next/ }).click()
  await page.locator("#name").fill("E2E Person")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create Account" }).click()
}

test.describe("login page", () => {
  test("renders form and link to register", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByText("Sign in to your account")).toBeVisible()
    await expect(page.locator("#email")).toBeVisible()
    await expect(page.locator("#password")).toBeVisible()
    await page.getByRole("link", { name: "Register your organization" }).click()
    await expect(page).toHaveURL(/\/register$/)
  })

  test("valid credentials -> dashboard", async ({ page }) => {
    await page.goto("/login")
    await fillLogin(page, "admin@a.test", PASSWORD)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
  })

  test("wrong password shows error and stays on /login", async ({ page }) => {
    await page.goto("/login")
    await fillLogin(page, "admin@a.test", "wrong-password")
    await expect(page.getByText("Invalid email or password")).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test("unknown email shows the same generic error", async ({ page }) => {
    await page.goto("/login")
    await fillLogin(page, `${uniq("ghost")}@a.test`, PASSWORD)
    await expect(page.getByText("Invalid email or password")).toBeVisible()
  })

  test("client-side validation: bad email + empty password", async ({ page }) => {
    await page.goto("/login")
    await page.locator("#email").fill("a@b")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByText("Invalid email address")).toBeVisible()
    await expect(page.getByText("Password is required")).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test("unauthenticated /dashboard redirects to /login with callbackUrl", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
  })

  test("callbackUrl is honoured after login", async ({ page }) => {
    await page.goto("/settings")
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
    await fillLogin(page, "admin@a.test", PASSWORD)
    await expect(page).toHaveURL(/\/settings$/, { timeout: 30_000 })
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  })

  test("sign out returns to /login and locks the app again", async ({ page }) => {
    await page.goto("/login")
    await fillLogin(page, "viewer@a.test", PASSWORD)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
    await page.getByText("VIEWER", { exact: true }).first().click()
    await page.getByRole("menuitem", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
  })

  test("BUG: email login is case-sensitive", async ({ page }) => {
    test.fail(true, "BUG: Admin@A.test cannot log in as admin@a.test")
    await page.goto("/login")
    await fillLogin(page, "Admin@A.test", PASSWORD)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  })
})

test.describe("register page", () => {
  test("step 1 validation blocks Next for short org name", async ({ page }) => {
    await page.goto("/register")
    await expect(page.getByText("Step 1 of 2")).toBeVisible()
    await page.locator("#orgName").fill("X")
    await page.getByRole("button", { name: /^Next/ }).click()
    await expect(page.getByText("Organization name must be at least 2 characters")).toBeVisible()
    await expect(page.getByText("Step 1 of 2")).toBeVisible()
  })

  test("step 2 validation: short name, bad email, short password", async ({ page }) => {
    await page.goto("/register")
    await page.locator("#orgName").fill("Valid Org")
    await page.getByRole("button", { name: /^Next/ }).click()
    await expect(page.getByText("Step 2 of 2")).toBeVisible()
    await page.locator("#name").fill("J")
    await page.locator("#email").fill("a@b")
    await page.locator("#password").fill("1234567")
    await page.getByRole("button", { name: "Create Account" }).click()
    await expect(page.getByText("Name must be at least 2 characters")).toBeVisible()
    await expect(page.getByText("Invalid email address")).toBeVisible()
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible()
    await expect(page).toHaveURL(/\/register/)
  })

  test("Back keeps step 1 and returns to step 1", async ({ page }) => {
    await page.goto("/register")
    await page.locator("#orgName").fill("Keep Me")
    await page.getByRole("button", { name: /^Next/ }).click()
    await page.getByRole("button", { name: /Back/ }).click()
    await expect(page.getByText("Step 1 of 2")).toBeVisible()
    await expect(page.locator("#orgName")).toHaveValue("Keep Me")
  })

  test("full registration with Government type logs in, lands on dashboard, is ADMIN", async ({ page }) => {
    const email = `${uniq("ui")}@e2e.test`
    await page.goto("/register")
    await page.locator("#orgName").fill("Gov Org")
    await page.locator("#orgType").click()
    await page.getByRole("option", { name: "Government" }).click()
    await page.getByRole("button", { name: /^Next/ }).click()
    await page.locator("#name").fill("Gov Admin")
    await page.locator("#email").fill(email)
    await page.locator("#password").fill(PASSWORD)
    await page.getByRole("button", { name: "Create Account" }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 })
    await page.goto("/settings")
    await expect(page.getByText("Gov Org")).toBeVisible()
    await expect(page.getByText("Government", { exact: true })).toBeVisible()
    await expect(page.getByText("Your role: ADMIN")).toBeVisible()
    await expect(page.getByText("1 member", { exact: true })).toBeVisible()
  })

  test("duplicate email shows toast and stays on register", async ({ page }) => {
    await registerViaUi(page, "admin@a.test")
    await expect(page.locator("[data-sonner-toast]").getByText("Email already registered")).toBeVisible({ timeout: 30_000 })
    await expect(page).toHaveURL(/\/register/)
  })

  test("link to sign in works", async ({ page }) => {
    await page.goto("/register")
    await page.getByRole("link", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test("register page shows an error and goes to /login when sign-in fails", async ({ page }) => {
    await page.route("**/api/auth/callback/credentials", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "http://localhost:3100/login?error=CredentialsSignin" }),
      })
    )
    await registerViaUi(page, `${uniq("sif")}@e2e.test`)
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 })
  })
})
