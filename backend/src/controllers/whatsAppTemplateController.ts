import type { Request, Response } from "express";
import * as service from "../services/whatsAppTemplateService";

export async function listTemplates(_req: Request, res: Response) {
  const docs = await service.listTemplates();
  res.json({ templates: docs.map(service.serializeTemplate) });
}

export async function createTemplate(req: Request, res: Response) {
  const doc = await service.createTemplate(req.userId!, req.body);
  res.status(201).json({ template: service.serializeTemplate(doc) });
}

export async function updateTemplate(req: Request, res: Response) {
  const doc = await service.updateTemplate(req.params.id, req.body);
  res.json({ template: service.serializeTemplate(doc) });
}

export async function deleteTemplate(req: Request, res: Response) {
  await service.deleteTemplate(req.params.id);
  res.status(204).send();
}

export async function improveTemplate(req: Request, res: Response) {
  res.json({ text: await service.improveMessage(req.body.text) });
}

export async function templateStatus(_req: Request, res: Response) {
  res.json(service.aiStatus());
}
