import { createServiceError } from './errors';

type LocalImageFile = {
  blob: Blob;
  extension: 'jpg' | 'png' | 'webp';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
};

const IMAGE_UPLOAD_MESSAGE = 'We could not upload that photo.';

function mimeTypeFromUri(fileUri: string): LocalImageFile['mimeType'] {
  const cleanUri = fileUri.split('?')[0]?.toLowerCase() ?? '';

  if (cleanUri.endsWith('.png')) {
    return 'image/png';
  }

  if (cleanUri.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function normalizeMimeType(value: string | null | undefined, fileUri: string): LocalImageFile['mimeType'] {
  if (value === 'image/png') {
    return 'image/png';
  }

  if (value === 'image/webp') {
    return 'image/webp';
  }

  return mimeTypeFromUri(fileUri);
}

function extensionFromMimeType(mimeType: LocalImageFile['mimeType']): LocalImageFile['extension'] {
  if (mimeType === 'image/png') {
    return 'png';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return 'jpg';
}

async function readWithFetch(fileUri: string, code: string, internalMessage: string): Promise<LocalImageFile> {
  const response = await fetch(fileUri);

  if (!response.ok) {
    throw createServiceError(code, `${internalMessage}: ${fileUri}`, IMAGE_UPLOAD_MESSAGE);
  }

  const blob = await response.blob();
  const mimeType = normalizeMimeType(blob.type, fileUri);

  return {
    blob,
    extension: extensionFromMimeType(mimeType),
    mimeType,
    size: blob.size,
  };
}

export async function readLocalImageFile(fileUri: string, code: string, internalMessage: string): Promise<LocalImageFile> {
  if (typeof document !== 'undefined' || fileUri.startsWith('blob:') || fileUri.startsWith('data:')) {
    return readWithFetch(fileUri, code, internalMessage);
  }

  try {
    const { File: ExpoFile } = await import('expo-file-system');
    const file = new ExpoFile(fileUri);
    const bytes = await file.bytes();
    const mimeType = normalizeMimeType(file.type, fileUri);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: mimeType });

    return {
      blob,
      extension: extensionFromMimeType(mimeType),
      mimeType,
      size: bytes.byteLength,
    };
  } catch {
    try {
      return await readWithFetch(fileUri, code, internalMessage);
    } catch {
      throw createServiceError(code, `${internalMessage}: ${fileUri}`, IMAGE_UPLOAD_MESSAGE);
    }
  }
}
