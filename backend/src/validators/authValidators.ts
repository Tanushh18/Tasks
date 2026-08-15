import { z } from "zod";

const mobileNumber = z.string().trim().min(10).max(16);
const mpin = z.string().regex(/^\d{4,6}$/, "MPIN must be 4 to 6 digits");

export const registerSchema = z
  .object({
    mobileNumber,
    mpin,
    confirmMpin: z.string(),
  })
  .refine((data) => data.mpin === data.confirmMpin, {
    message: "MPIN and confirmation do not match",
    path: ["confirmMpin"],
  });

export const loginSchema = z.object({
  mobileNumber,
  mpin: z.string().min(4).max(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const changeMpinSchema = z
  .object({
    currentMpin: z.string().min(4).max(6),
    newMpin: mpin,
    confirmNewMpin: z.string(),
  })
  .refine((data) => data.newMpin === data.confirmNewMpin, {
    message: "New MPIN and confirmation do not match",
    path: ["confirmNewMpin"],
  });
