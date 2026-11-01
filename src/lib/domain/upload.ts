export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export type UploadValidationError = "too_large" | "invalid_type";

export function validateUpload(file: {
  name: string;
  size: number;
  type: string;
}): UploadValidationError | null {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "too_large";
  }

  const nameLower = file.name.toLowerCase();
  if (!nameLower.endsWith(".mp3")) {
    return "invalid_type";
  }

  if (file.type !== "audio/mpeg") {
    return "invalid_type";
  }

  return null;
}

export function uploadTrackPath(venueId: string, sha256: string): string {
  return `${venueId}/${sha256}.mp3`;
}

export async function sha256File(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

