import { withAuth } from "next-auth/middleware"

export default withAuth({
  pages: {
    signIn: "/login",
  },
})

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/settings/:path*",
    "/api/projects/:path*",
    "/api/nodes/:path*",
    "/api/receipts/:path*",
    "/api/signatures/:path*",
    "/api/audit/:path*",
    "/api/dashboard",
  ],
}
