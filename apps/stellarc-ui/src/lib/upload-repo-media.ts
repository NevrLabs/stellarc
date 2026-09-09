import { getApiUrl } from "@/fetchers/get-api-url";
import {
  getImageAltText,
  isSupportedImageFile,
  isSupportedTaskAsset,
} from "@/lib/upload-task-image";

type UploadSurface = "description" | "comment";

export async function uploadRepoMedia({
  repoId,
  surface,
  file,
}: {
  repoId: string;
  surface: UploadSurface;
  file: File;
}) {
  if (!isSupportedTaskAsset(file)) {
    throw new Error("Only non-empty file uploads are supported.");
  }

  const metadata = {
    filename: file.name || "image",
    contentType: file.type || "application/octet-stream",
    size: file.size,
    surface,
  };
  const presign = await fetch(getApiUrl(`/repo/${repoId}/media-upload`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(metadata),
  });
  if (!presign.ok) throw new Error(await presign.text());
  const upload = (await presign.json()) as {
    key: string;
    uploadUrl: string;
    headers: Record<string, string>;
  };

  const stored = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: file,
  });
  if (!stored.ok) throw new Error("Failed to upload file to storage.");

  const finalized = await fetch(
    getApiUrl(`/repo/${repoId}/media-upload/finalize`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...metadata, key: upload.key }),
    },
  );
  if (!finalized.ok) throw new Error(await finalized.text());
  const asset = (await finalized.json()) as { url: string };

  return {
    // GitHub resolves relative Markdown URLs against github.com, so the editor
    // must persist an absolute Kaneo asset URL.
    url: new URL(asset.url, window.location.origin).toString(),
    alt: getImageAltText(file.name || "image"),
    filename: file.name || "file",
    kind: isSupportedImageFile(file)
      ? ("image" as const)
      : ("attachment" as const),
    mimeType: file.type,
    size: file.size,
  };
}

export default uploadRepoMedia;
