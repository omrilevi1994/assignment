import { handleChat } from "./handler";

// Stage attempts and retry delays can total 241s; leave time for persistence on Vercel Fluid compute.
export const maxDuration = 300;

/** Handles one complete chat turn as JSON without streaming. */
export async function POST(request: Request): Promise<Response> {
  return handleChat(request);
}
