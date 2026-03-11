import type { StateCreator } from "zustand"
import type { Project } from "@prisma/client"

export interface ProjectSlice {
  currentProject: Project | null
  orgUsers: { id: string; name: string; email: string; role: string }[]
  setCurrentProject: (project: Project) => void
  setOrgUsers: (users: { id: string; name: string; email: string; role: string }[]) => void
}

export const createProjectSlice: StateCreator<ProjectSlice, [], [], ProjectSlice> = (set) => ({
  currentProject: null,
  orgUsers: [],
  setCurrentProject: (project) => set({ currentProject: project }),
  setOrgUsers: (users) => set({ orgUsers: users }),
})
