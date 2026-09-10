import { Task } from "../models/Task";
import { Transaction } from "../models/Transaction";
import { Contact } from "../models/Contact";
import { GroupExpense } from "../models/GroupExpense";
import { ExpenseGroup } from "../models/ExpenseGroup";
import { Note } from "../models/Note";
import { User } from "../models/User";
import { getFlags } from "../models/FeatureFlags";

export type ActivityKind = "task" | "expense" | "contact" | "group-expense" | "note";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  actorName: string;
  text: string;
  amount?: number;
  at: Date;
}

const PER_SOURCE_LIMIT = 15;
const FEED_LIMIT = 25;

/**
 * A lightweight, utility-focused activity feed — not a social one (spec §5).
 * There's no persisted activity log; this reads the last few events straight
 * out of the collections that already exist and merges them by time. Visible
 * to every registered user, matching how the rest of this app treats
 * "family" (see emergencyInfoService for the same reasoning): everyone
 * signed in is assumed to be family.
 */
export async function getActivityFeed(): Promise<ActivityEntry[]> {
  const [tasks, transactions, contacts, groupExpenses, notes] = await Promise.all([
    Task.find({ completed: true, completedAt: { $ne: null } })
      .sort("-completedAt")
      .limit(PER_SOURCE_LIMIT)
      .select("title userId completedAt"),
    Transaction.find().sort("-createdAt").limit(PER_SOURCE_LIMIT).select("amount type category description userId createdAt"),
    Contact.find().sort("-createdAt").limit(PER_SOURCE_LIMIT).select("name addedBy createdAt"),
    (async () => {
      const flags = await getFlags();
      if (!flags.groupExpenses) return [];
      return GroupExpense.find().sort("-createdAt").limit(PER_SOURCE_LIMIT).select("amount paidBy groupId createdAt");
    })(),
    Note.find().sort("-createdAt").limit(PER_SOURCE_LIMIT).select("title ownerId createdAt"),
  ]);

  const groupIds = Array.from(new Set(groupExpenses.map((g) => String(g.groupId))));
  const groups = groupIds.length > 0 ? await ExpenseGroup.find({ _id: { $in: groupIds } }).select("name") : [];
  const groupNameById = new Map(groups.map((g) => [String(g._id), g.name]));

  const userIds = new Set<string>();
  for (const t of tasks) userIds.add(String(t.userId));
  for (const t of transactions) userIds.add(String(t.userId));
  for (const c of contacts) userIds.add(String(c.addedBy));
  for (const g of groupExpenses) userIds.add(String(g.paidBy));
  for (const n of notes) userIds.add(String(n.ownerId));

  const users = await User.find({ _id: { $in: Array.from(userIds) } }).select("name");
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));
  const nameOf = (id: unknown) => nameById.get(String(id)) ?? "Someone";

  const entries: ActivityEntry[] = [];

  for (const task of tasks) {
    entries.push({
      id: `task-${task._id}`,
      kind: "task",
      actorName: nameOf(task.userId),
      text: `completed "${task.title}"`,
      at: task.completedAt as Date,
    });
  }

  for (const tx of transactions) {
    const label = tx.description || tx.category;
    entries.push({
      id: `tx-${tx._id}`,
      kind: "expense",
      actorName: nameOf(tx.userId),
      text: `${tx.type === "IN" ? "added" : "logged"} a ${label} ${tx.type === "IN" ? "payment" : "expense"}`,
      amount: tx.amount,
      at: tx.createdAt as unknown as Date,
    });
  }

  for (const contact of contacts) {
    entries.push({
      id: `contact-${contact._id}`,
      kind: "contact",
      actorName: nameOf(contact.addedBy),
      text: `added contact "${contact.name}"`,
      at: contact.createdAt as unknown as Date,
    });
  }

  for (const ge of groupExpenses) {
    const groupName = groupNameById.get(String(ge.groupId)) ?? "a group";
    entries.push({
      id: `ge-${ge._id}`,
      kind: "group-expense",
      actorName: nameOf(ge.paidBy),
      text: `added an expense to "${groupName}"`,
      amount: ge.amount,
      at: ge.createdAt as unknown as Date,
    });
  }

  for (const note of notes) {
    entries.push({
      id: `note-${note._id}`,
      kind: "note",
      actorName: nameOf(note.ownerId),
      text: note.title ? `created the note "${note.title}"` : "created a note",
      at: note.createdAt as unknown as Date,
    });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, FEED_LIMIT);
}
