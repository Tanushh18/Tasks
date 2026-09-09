import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as recurringPaymentService from "../services/recurringPaymentService";

type PopulatedRef = { _id: unknown; name: string } | null | undefined;

function serializeRef(ref: PopulatedRef) {
  if (!ref || typeof ref !== "object" || !("name" in ref)) return null;
  return { id: String(ref._id), name: ref.name };
}

function serializePayment(payment: Awaited<ReturnType<typeof recurringPaymentService.createPayment>>) {
  const sharedWith = (payment.sharedWith as unknown as PopulatedRef[]) ?? [];
  const history = (payment.history as unknown as { date: string; amount: number; paid: boolean }[]) ?? [];
  return {
    id: String(payment._id),
    name: payment.name,
    amount: payment.amount,
    category: payment.category,
    frequency: payment.frequency,
    nextDueDate: payment.nextDueDate,
    accountId: payment.accountId ? String(payment.accountId) : null,
    createdBy: serializeRef(payment.createdBy as unknown as PopulatedRef),
    sharedWith: sharedWith.map(serializeRef).filter((r): r is { id: string; name: string } => r !== null),
    active: payment.active,
    status: recurringPaymentService.computeStatus(payment.nextDueDate, payment.active),
    history,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const payments = await recurringPaymentService.listPayments(req.userId!);
  res.json({ payments: payments.map(serializePayment) });
});

export const getPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await recurringPaymentService.getPayment(req.userId!, req.params.id);
  res.json({ payment: serializePayment(payment) });
});

export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await recurringPaymentService.createPayment(req.userId!, req.body);
  res.status(201).json({ payment: serializePayment(payment) });
});

export const updatePayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await recurringPaymentService.updatePayment(req.userId!, req.params.id, req.body);
  res.json({ payment: serializePayment(payment) });
});

export const deletePayment = asyncHandler(async (req: Request, res: Response) => {
  await recurringPaymentService.deletePayment(req.userId!, req.params.id);
  res.status(204).send();
});

export const markPaid = asyncHandler(async (req: Request, res: Response) => {
  const payment = await recurringPaymentService.markPaid(req.userId!, req.params.id, req.body);
  res.json({ payment: serializePayment(payment) });
});
