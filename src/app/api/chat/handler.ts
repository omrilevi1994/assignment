import { getDb, type Database } from "@/db/client";
import { appendTurn, createConversation, findConversation, loadHistory } from "@/db/repository";
import { runTurn } from "@/pipeline";
import { HISTORY_LIMIT } from "@/pipeline/history";
import { historyTurn } from "./history";
import { readRequest, validationError, type ChatRequest } from "./request";
import { answeredResponse, failedResponse } from "./response";

export type ChatDeps = { runTurn?: typeof runTurn; db?: Database };

/** Finds an existing conversation or starts one with the trimmed question as its title. */
async function conversationFor(input: ChatRequest, db: Database) {
  return input.conversationId
    ? findConversation(input.conversationId, db)
    : createConversation({ title: input.message.slice(0, 80) }, db);
}

/** Persists the question before running the pipeline with only the preceding six turns. */
async function completeChat(input: ChatRequest, deps: ChatDeps): Promise<Response> {
  const db = deps.db ?? getDb();
  const conversation = await conversationFor(input, db);
  if (!conversation) return validationError({ conversationId: ["Conversation not found."] });
  const user = await appendTurn({ conversationId: conversation.id, role: "user", content: { text: input.message } }, db);
  const history = await loadHistory(conversation.id, HISTORY_LIMIT, db, user.position);
  const result = await (deps.runTurn ?? runTurn)(input.message, history.map(historyTurn));
  return result.status === "failed"
    ? failedResponse(result, conversation.id, user.id, db)
    : answeredResponse(result, conversation.id, db);
}

/** Validates, answers and persists a chat request; unexpected errors never reach the client. */
export async function handleChat(request: Request, deps: ChatDeps = {}): Promise<Response> {
  try {
    const parsed = await readRequest(request);
    if (parsed.response) return parsed.response;
    return await completeChat(parsed.input, deps);
  } catch {
    return Response.json({ error: { kind: "internal_error", message: "Something went wrong. Please try again." } }, { status: 500 });
  }
}
