import { z } from "zod";
import type { Database } from "@/db/client";
import { saveFeedback } from "@/db/feedback";
import { FeedbackInputSchema } from "@/domain/feedback";

interface Dependencies {
  db?: Database;
  save?: typeof saveFeedback;
}

/** Returns the shared validation shape for malformed requests and unknown turn ids. */
function invalid(fields: Record<string, string[]>): Response {
  return Response.json({ error: { kind: "validation", message: "Please check your feedback.", fields } }, { status: 400 });
}

/** Validates a report and stores it, returning only safe JSON errors to the caller. */
export async function handleFeedback(request: Request, deps: Dependencies = {}): Promise<Response> {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = FeedbackInputSchema.safeParse(body);
    if (!parsed.success) return invalid(z.flattenError(parsed.error).fieldErrors);
    const saved = await (deps.save ?? saveFeedback)(parsed.data, deps.db);
    if (!saved) return invalid({ turnId: ["This turn could not be found."] });
    return Response.json({ id: saved.id }, { status: 201 });
  } catch {
    return Response.json({ error: {
      kind: "internal_error", message: "Something went wrong. Please try again.",
    } }, { status: 500 });
  }
}
