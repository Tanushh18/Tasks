import { Poll, type PollDocument } from "../models/Poll";
import { ApiError } from "../utils/ApiError";

export interface PollInput {
  question: string;
  options: string[];
  closesAt?: string | null;
}

function isActive(poll: PollDocument): boolean {
  if (poll.closed) return false;
  if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) return false;
  return true;
}

export async function listPolls(status: "active" | "closed" | "all"): Promise<PollDocument[]> {
  const polls = await Poll.find({}).populate("createdBy", "name").sort("-createdAt");
  if (status === "all") return polls;
  return polls.filter((poll) => (status === "active" ? isActive(poll) : !isActive(poll)));
}

export async function getPoll(pollId: string): Promise<PollDocument> {
  const poll = await Poll.findById(pollId).populate("createdBy", "name");
  if (!poll) throw ApiError.notFound("Poll not found");
  return poll;
}

export async function createPoll(userId: string, input: PollInput): Promise<PollDocument> {
  const poll = await Poll.create({
    question: input.question,
    options: input.options,
    createdBy: userId,
    closesAt: input.closesAt ? new Date(input.closesAt) : null,
  });
  return poll.populate("createdBy", "name");
}

export async function votePoll(userId: string, pollId: string, optionIndex: number): Promise<PollDocument> {
  const poll = await Poll.findById(pollId);
  if (!poll) throw ApiError.notFound("Poll not found");
  if (!isActive(poll)) throw ApiError.badRequest("This poll is closed");
  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    throw ApiError.badRequest("Invalid option");
  }

  // Upsert this voter's choice: replace their existing vote if present, otherwise append.
  const existing = poll.votes.find((v) => String(v.userId) === String(userId));
  if (existing) {
    existing.optionIndex = optionIndex;
  } else {
    poll.votes.push({ userId, optionIndex } as unknown as PollDocument["votes"][number]);
  }
  await poll.save();
  return poll.populate("createdBy", "name");
}

export async function closePoll(userId: string, pollId: string): Promise<PollDocument> {
  const poll = await Poll.findById(pollId);
  if (!poll) throw ApiError.notFound("Poll not found");
  if (String(poll.createdBy) !== String(userId)) {
    throw ApiError.forbidden("Only the poll's creator can close it");
  }
  poll.closed = true;
  await poll.save();
  return poll.populate("createdBy", "name");
}
