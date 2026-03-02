/**
 * Convert a File to base64 using FileReader (native C++ path, avoids O(N^2) JS string alloc).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(",");
      resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a Uint8Array to base64 using chunked btoa (avoids O(N^2) string concat).
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    parts.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(parts.join(""));
}
