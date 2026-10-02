import { handleChat } from "./handler";

export const maxDuration = 120;

/** Handles one complete chat turn as JSON without streaming. */
export async function POST(request: Request): Promise<Response> {
  return handleChat(request);
}
