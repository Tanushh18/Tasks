import { z } from "zod";

export const searchUsersQuerySchema = z.object({
  // Optional: with no query this lists everyone, which in a family-sized app
  // is simply "the family" — what the Family screen needs to show avatars.
  query: z.string().trim().max(80).optional(),
});
