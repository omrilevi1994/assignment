import { handleFeedback } from "./handler";

/** Records a review note for a saved conversation turn. */
export async function POST(request: Request): Promise<Response> {
  return handleFeedback(request);
}
