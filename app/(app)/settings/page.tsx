import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TeamSection } from "@/components/settings/team-section"
import { Building2 } from "lucide-react"

const orgTypeLabel = {
  BUSINESS: "Business",
  NGO: "NGO / Non-profit",
  GOVERNMENT: "Government",
}

async function getSettingsData(orgId: string) {
  const [org, members] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, type: true },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ])
  return { org, members }
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  const { org, members } = await getSettingsData(session!.user.organizationId)
  const isAdmin = session!.user.role === "ADMIN"

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your organization and team</p>
      </div>

      {/* Organization overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Organization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="font-semibold text-lg">{org?.name}</p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {org ? orgTypeLabel[org.type] : ""}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {members.length} member{members.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <Badge className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-100">
              Your role: {session!.user.role}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Team members (client component for invite + role management) */}
      <TeamSection
        initialMembers={members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
        currentUserId={session!.user.id}
        isAdmin={isAdmin}
      />
    </div>
  )
}
