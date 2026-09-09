import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as pollService from "../services/pollService";
import type { PollDocument } from "../models/Poll";

type PopulatedRef = { _id: unknown; name: string } | null | undefined;

function serializeRef(ref: PopulatedRef) {
  if (!ref || typeof ref !== "object" || !("name" in ref)) return null;
  return { id: String(ref._id), name: ref.name };
}

// Vote counts per option, plus the requesting user's own choice (if any) so
// the client can render results without re-deriving them from raw votes.
function serializePoll(poll: PollDocument, viewerId: string) {
  const counts = poll.options.map(() => 0);
  for (const vote of poll.votes) {
    if (vote.optionIndex >= 0 && vote.optionIndex < counts.length) counts[vote.optionIndex] += 1;
  }
  const myVote = poll.votes.find((v) => String(v.userId) === String(viewerId));
  const totalVotes = poll.votes.length;
  const closed = poll.closed || Boolean(poll.closesAt && poll.closesAt.getTime() <= Date.now());

  return {
    id: String(poll._id),
    question: poll.question,
    options: poll.options,
    createdBy: serializeRef(poll.createdBy as unknown as PopulatedRef),
    closesAt: poll.closesAt,
    closed,
    totalVotes,
    counts,
    myVote: myVote ? myVote.optionIndex : null,
    createdAt: poll.createdAt,
    updatedAt: poll.updatedAt,
  };
}

export const listPolls = asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query.status as "active" | "closed" | "all") ?? "active";
  const polls = await pollService.listPolls(status);
  res.json({ polls: polls.map((p) => serializePoll(p, req.userId!)) });
});

export const getPoll = asyncHandler(async (req: Request, res: Response) => {
  const poll = await pollService.getPoll(req.params.id);
  res.json({ poll: serializePoll(poll, req.userId!) });
});

export const createPoll = asyncHandler(async (req: Request, res: Response) => {
  const poll = await pollService.createPoll(req.userId!, req.body);
  res.status(201).json({ poll: serializePoll(poll, req.userId!) });
});

export const votePoll = asyncHandler(async (req: Request, res: Response) => {
  const poll = await pollService.votePoll(req.userId!, req.params.id, req.body.optionIndex);
  res.json({ poll: serializePoll(poll, req.userId!) });
});

export const closePoll = asyncHandler(async (req: Request, res: Response) => {
  const poll = await pollService.closePoll(req.userId!, req.params.id);
  res.json({ poll: serializePoll(poll, req.userId!) });
});
