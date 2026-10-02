import { createApp } from "../src/app";
import * as cloudinary from "../src/services/cloudinaryService";
import { authed, registerUser } from "./helpers";

const app = createApp();
const DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

async function vehicle(mobile: string) {
  const { token } = await registerUser(app, mobile, "4821");
  const api = authed(app, token);
  const created = await api.post("/api/vehicles").send({ name: "Kiger Car" });
  return { api, vehicleId: created.body.vehicle.id as string };
}

describe("document files", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps the file inline when Cloudinary isn't configured, and can remove it", async () => {
    const { api, vehicleId } = await vehicle("9872200001");
    const created = await api.post(`/api/vehicles/${vehicleId}/documents`).send({ type: "insurance", fileData: DATA_URL, fileName: "a.jpg" });
    expect(created.status).toBe(201);
    expect(created.body.document.fileData).toBe(DATA_URL);

    const removed = await api
      .put(`/api/vehicles/${vehicleId}/documents/${created.body.document.id}`)
      .send({ fileData: null });
    expect(removed.status).toBe(200);
    expect(removed.body.document.fileData).toBeNull();
    expect(removed.body.document.fileName).toBeNull();
  });

  it("uploads to Cloudinary, stores the URL, and deletes the stored file with the document", async () => {
    const store = jest
      .spyOn(cloudinary, "storeFile")
      .mockResolvedValue({ url: "https://res.cloudinary.com/demo/image/upload/v1/tasks-app/x.jpg", publicId: "tasks-app/x", resourceType: "image" });
    const remove = jest.spyOn(cloudinary, "removeFile").mockResolvedValue();
    const { api, vehicleId } = await vehicle("9872200002");

    const created = await api.post(`/api/vehicles/${vehicleId}/documents`).send({ type: "other", customLabel: "RC", fileData: DATA_URL });
    expect(store).toHaveBeenCalledWith(DATA_URL, "vehicles");
    expect(created.body.document.fileData).toMatch(/^https:\/\/res\.cloudinary\.com\//);

    // Echoing the stored URL back (an edit that doesn't touch the file) must not re-upload.
    await api
      .put(`/api/vehicles/${vehicleId}/documents/${created.body.document.id}`)
      .send({ fileData: created.body.document.fileData, notes: "hi" });
    expect(store).toHaveBeenCalledTimes(1);

    const del = await api.delete(`/api/vehicles/${vehicleId}/documents/${created.body.document.id}`);
    expect(del.status).toBe(204);
    expect(remove).toHaveBeenCalledWith("tasks-app/x", "image");
  });

  it("uploads vault documents and cleans up the old file on replace", async () => {
    const store = jest
      .spyOn(cloudinary, "storeFile")
      .mockResolvedValueOnce({ url: "https://res.cloudinary.com/demo/image/upload/a.jpg", publicId: "a", resourceType: "image" })
      .mockResolvedValueOnce({ url: "https://res.cloudinary.com/demo/image/upload/b.jpg", publicId: "b", resourceType: "image" });
    const remove = jest.spyOn(cloudinary, "removeFile").mockResolvedValue();
    const { token } = await registerUser(app, "9872200003", "4821");
    const api = authed(app, token);

    const created = await api.post("/api/vault-documents").send({ title: "Passport", fileData: DATA_URL });
    expect(created.status).toBe(201);
    expect(created.body.document.fileData).toContain("/a.jpg");

    const replaced = await api.put(`/api/vault-documents/${created.body.document.id}`).send({ fileData: DATA_URL });
    expect(replaced.body.document.fileData).toContain("/b.jpg");
    expect(store).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("a", "image");
  });
});
