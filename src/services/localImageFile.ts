import { createServiceError } from './errors';

type LocalImageFile = {
  blob: Blob;
  extension: 'jpg' | 'png' | 'webp';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
};

type FetchResponse = {
  ok: boolean;
  blob: () => Promise<Blob>;
};

export type LocalImageFileDependencies = {
  fetchFile?: (fileUri: string) => Promise<FetchResponse>;
  readNativeBytes?: (fileUri: string) => Promise<{ bytes: Uint8Array; mimeType?: string | null }>;
};

const IMAGE_UPLOAD_MESSAGE = 'We could not upload that photo.';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DATA_IMAGE_PATTERN = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/i;
const supportedDataImageMimeTypes = new Set<LocalImageFile['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

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

function imageFileFromBytes(bytes: Uint8Array, mimeType: LocalImageFile['mimeType']): LocalImageFile {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mimeType });

  return {
    blob,
    extension: extensionFromMimeType(mimeType),
    mimeType,
    size: bytes.byteLength,
  };
}

function decodeBase64(value: string): Uint8Array {
  if (!value || value.length % 4 !== 0) {
    throw new Error('Invalid Base64 length');
  }

  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let outputIndex = 0;

  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value[index] ?? '');
    const second = BASE64_ALPHABET.indexOf(value[index + 1] ?? '');
    const thirdCharacter = value[index + 2] ?? '=';
    const fourthCharacter = value[index + 3] ?? '=';
    const third = thirdCharacter === '=' ? 0 : BASE64_ALPHABET.indexOf(thirdCharacter);
    const fourth = fourthCharacter === '=' ? 0 : BASE64_ALPHABET.indexOf(fourthCharacter);

    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw new Error('Invalid Base64 characters');
    }

    if (outputIndex < bytes.length) bytes[outputIndex++] = (first << 2) | (second >> 4);
    if (outputIndex < bytes.length) bytes[outputIndex++] = ((second & 15) << 4) | (third >> 2);
    if (outputIndex < bytes.length) bytes[outputIndex++] = ((third & 3) << 6) | fourth;
  }

  return bytes;
}

function readDataImageUri(fileUri: string, code: string, internalMessage: string): LocalImageFile {
  try {
    const match = DATA_IMAGE_PATTERN.exec(fileUri);
    const mimeType = match?.[1]?.toLowerCase() as LocalImageFile['mimeType'] | undefined;
    const encodedBytes = match?.[2];

    if (!mimeType || !encodedBytes || !supportedDataImageMimeTypes.has(mimeType)) {
      throw new Error('Unsupported or malformed image data URI');
    }

    return imageFileFromBytes(decodeBase64(encodedBytes), mimeType);
  } catch {
    throw createServiceError(code, `${internalMessage}: malformed or unsupported image data URI`, IMAGE_UPLOAD_MESSAGE);
  }
}

async function readWithFetch(
  fileUri: string,
  code: string,
  internalMessage: string,
  fetchFile: (fileUri: string) => Promise<FetchResponse>
): Promise<LocalImageFile> {
  const response = await fetchFile(fileUri);

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

async function readWithExpoFile(fileUri: string): Promise<{ bytes: Uint8Array; mimeType?: string | null }> {
  const { File: ExpoFile } = await import('expo-file-system');
  const file = new ExpoFile(fileUri);

  return {
    bytes: await file.bytes(),
    mimeType: file.type,
  };
}

export async function readLocalImageFile(
  fileUri: string,
  code: string,
  internalMessage: string,
  dependencies: LocalImageFileDependencies = {}
): Promise<LocalImageFile> {
  if (fileUri.startsWith('data:')) {
    return readDataImageUri(fileUri, code, internalMessage);
  }

  const fetchFile = dependencies.fetchFile ?? ((uri: string) => fetch(uri));

  if (typeof document !== 'undefined' || fileUri.startsWith('blob:')) {
    return readWithFetch(fileUri, code, internalMessage, fetchFile);
  }

  const readNativeBytes = dependencies.readNativeBytes ?? readWithExpoFile;

  try {
    const { bytes, mimeType: reportedMimeType } = await readNativeBytes(fileUri);
    const mimeType = normalizeMimeType(reportedMimeType, fileUri);
    return imageFileFromBytes(bytes, mimeType);
  } catch {
    if (fileUri.startsWith('file:') || fileUri.startsWith('content:')) {
      throw createServiceError(code, `${internalMessage}: native image file could not be read`, IMAGE_UPLOAD_MESSAGE);
    }

    try {
      return await readWithFetch(fileUri, code, internalMessage, fetchFile);
    } catch {
      throw createServiceError(code, `${internalMessage}: image file could not be read`, IMAGE_UPLOAD_MESSAGE);
    }
  }
}
