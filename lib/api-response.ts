import { NextResponse } from "next/server"
import type { ZodIssue } from "zod"

export function success<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data, error: null }, { status })
}

export function error(message: string, status: number): NextResponse {
  return NextResponse.json({ data: null, error: message }, { status })
}

export function validationError(issues: ZodIssue[]): NextResponse {
  return NextResponse.json(
    {
      data: null,
      error: "Validation failed",
      issues: issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    },
    { status: 422 }
  )
}
