import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { success, error } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { getSignedUrl } from "@/lib/storage"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession()
    const receipt = await prisma.receipt.findFirst({
      where: {
        id: params.id,
        node: { project: { organizationId: session.user.organizationId } },
      },
    })
    if (!receipt) return error("Receipt not found", 404)

    const signedUrl = await getSignedUrl("receipts", receipt.filePath, 3600)
    return success({ ...receipt, signedUrl })
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
