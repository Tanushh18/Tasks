import { isRemoteUrl, mimeTypeFromDataUrl } from "../filePicker";

describe("mimeTypeFromDataUrl", () => {
  it("reads the type from a base64 data URL", () => {
    expect(mimeTypeFromDataUrl("data:application/pdf;base64,AAAA")).toBe("application/pdf");
  });

  it("recognises Cloudinary photo URLs", () => {
    expect(mimeTypeFromDataUrl("https://res.cloudinary.com/demo/image/upload/v1/tasks-app/abc")).toBe("image/jpeg");
    expect(mimeTypeFromDataUrl("https://res.cloudinary.com/demo/image/upload/v1/abc.png?x=1")).toBe("image/png");
  });

  it("uses the file name for raw (PDF/Word) uploads", () => {
    const url = "https://res.cloudinary.com/demo/raw/upload/v1/tasks-app/abc";
    expect(mimeTypeFromDataUrl(url, "policy.pdf")).toBe("application/pdf");
    expect(mimeTypeFromDataUrl(url, "letter.docx")).toContain("wordprocessingml");
    expect(mimeTypeFromDataUrl(url)).toBeNull();
  });

  it("detects remote URLs", () => {
    expect(isRemoteUrl("https://x.test/a.jpg")).toBe(true);
    expect(isRemoteUrl("data:image/jpeg;base64,AA")).toBe(false);
    expect(isRemoteUrl(null)).toBe(false);
  });
});
