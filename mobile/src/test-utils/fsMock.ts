/** In-memory stand-in for expo-file-system/legacy used by the UPI log tests. */
export const memFiles = new Map<string, string>();
export const fsFailures = { write: false };

export function createFsMock() {
  return {
    documentDirectory: "file:///doc/",
    cacheDirectory: "file:///cache/",
    getInfoAsync: jest.fn(async (uri: string) => (memFiles.has(uri) ? { exists: true, size: (memFiles.get(uri) as string).length, uri } : { exists: false, uri })),
    readAsStringAsync: jest.fn(async (uri: string) => {
      if (!memFiles.has(uri)) throw new Error("ENOENT");
      return memFiles.get(uri) as string;
    }),
    writeAsStringAsync: jest.fn(async (uri: string, content: string) => {
      if (fsFailures.write) throw new Error("disk full");
      memFiles.set(uri, content);
    }),
    deleteAsync: jest.fn(async (uri: string) => {
      memFiles.delete(uri);
    }),
  };
}
