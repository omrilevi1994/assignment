import { z } from "zod";

export const ChatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).max(2000),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
type ParsedRequest = { input: ChatRequest; response?: never } | { input?: never; response: Response };

/** A consistent, user-safe validation response with field-specific errors. */
export function validationError(fields: Record<string, string[]>) {
  return Response.json({ error: { kind: "validation", message: "Please check your request.", fields } }, { status: 400 });
}

/** Reads JSON and validates it before any persistence or pipeline work. */
export async function readRequest(request: Request): Promise<ParsedRequest> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: validationError({ body: ["Send a valid JSON body."] }) };
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (parsed.success) return { input: parsed.data };
  const flattened = z.flattenError(parsed.error);
  const fields = { ...flattened.fieldErrors };
  if (flattened.formErrors.length) return { response: validationError({ ...fields, body: flattened.formErrors }) };
  return { response: validationError(fields) };
}
