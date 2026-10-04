const mockPost = jest.fn();
jest.mock("../client", () => ({ apiClient: { get: jest.fn(), post: (...a: unknown[]) => mockPost(...a) } }));

import { uploadMany, uploadToCloudinary, type UploadSignature } from "../shineMedia";

const sig: UploadSignature = {
  uploadUrl: "https://api.cloudinary.com/v1_1/c/image/upload",
  apiKey: "k",
  timestamp: 1,
  signature: "s",
  folder: "ShineOne/sec 4",
  tags: "sec4",
};

class FakeXhr {
  static last: FakeXhr;
  static status = 200;
  static body = "{}";
  status = 0;
  responseText = "";
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  method = "";
  url = "";
  sent: FormData | null = null;
  open(m: string, u: string) {
    this.method = m;
    this.url = u;
    FakeXhr.last = this;
  }
  send(body: FormData) {
    this.sent = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    this.status = FakeXhr.status;
    this.responseText = FakeXhr.body;
    this.onload?.();
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  FakeXhr.status = 200;
  FakeXhr.body = "{}";
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
});

describe("shine media upload", () => {
  it("posts the file with the signed fields straight to Cloudinary and reports progress", async () => {
    const progress: number[] = [];
    await uploadToCloudinary(sig, { uri: "file:///a.jpg", kind: "image", fileName: "a.jpg", mimeType: "image/jpeg" }, (f) => progress.push(f));
    expect(FakeXhr.last.method).toBe("POST");
    expect(FakeXhr.last.url).toBe(sig.uploadUrl);
    const parts = Array.from((FakeXhr.last.sent as unknown as { keys(): Iterable<string> }).keys());
    expect(parts).toEqual(expect.arrayContaining(["file", "api_key", "timestamp", "signature", "folder", "tags"]));
    expect(progress).toEqual([0.5]);
  });

  it("surfaces Cloudinary's error message", async () => {
    FakeXhr.status = 400;
    FakeXhr.body = JSON.stringify({ error: { message: "File size too large" } });
    await expect(uploadToCloudinary(sig, { uri: "file:///a.mp4", kind: "video" }, () => undefined)).rejects.toThrow("File size too large");
  });

  it("uploads each file after signing it, counts successes, keeps going after a failure, and refreshes the site list", async () => {
    mockPost.mockImplementation(async (url: string) => (url === "/shine-media/sign" ? { data: sig } : { data: { ok: true } }));
    let call = 0;
    const realSend = FakeXhr.prototype.send;
    FakeXhr.prototype.send = function (this: FakeXhr, body: FormData) {
      call++;
      FakeXhr.status = call === 2 ? 400 : 200;
      FakeXhr.body = call === 2 ? JSON.stringify({ error: { message: "bad file" } }) : "{}";
      realSend.call(this, body);
    };
    const res = await uploadMany(
      "sec 4",
      [
        { uri: "file:///1.jpg", kind: "image" },
        { uri: "file:///2.mp4", kind: "video" },
        { uri: "file:///3.jpg", kind: "image" },
      ],
      () => undefined
    );
    FakeXhr.prototype.send = realSend;
    expect(res).toEqual({ uploaded: 2, error: "bad file" });
    expect(mockPost).toHaveBeenCalledWith("/shine-media/sign", { project: "sec 4", kind: "image" });
    expect(mockPost).toHaveBeenCalledWith("/shine-media/sign", { project: "sec 4", kind: "video" });
    expect(mockPost).toHaveBeenCalledWith("/shine-media/uploaded", {});
  });
});
