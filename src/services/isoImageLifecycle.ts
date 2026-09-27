import { createServiceError } from './errors';
import type { IsoPostImage } from './types';

export type IsoImageCleanupDependencies = {
  objectExists: (path: string) => Promise<boolean>;
  removeObject: (path: string) => Promise<void>;
  deleteImageRow: (imageId: string) => Promise<boolean>;
};

export async function deleteRegisteredIsoImage(
  imageId: string,
  path: string,
  dependencies: IsoImageCleanupDependencies
): Promise<void> {
  if (await dependencies.objectExists(path)) {
    await dependencies.removeObject(path);

    if (await dependencies.objectExists(path)) {
      throw createServiceError(
        'ISO_IMAGE_STORAGE_DELETE_UNCONFIRMED',
        `Storage did not remove the registered ISO image object: ${path}`,
        'We could not remove that photo. Please try again.'
      );
    }
  }

  if (!await dependencies.deleteImageRow(imageId)) {
    throw createServiceError(
      'ISO_IMAGE_DATABASE_DELETE_UNCONFIRMED',
      `The ISO image database row was not removed after Storage cleanup: ${imageId}`,
      'The photo was removed from storage, but we could not finish updating the request. Please try again.'
    );
  }
}

export type IsoImageReplacementDependencies = {
  addImage: (postId: string, fileUri: string) => Promise<IsoPostImage>;
  removeImage: (postId: string, imageId: string) => Promise<void>;
};

export async function replaceRegisteredIsoImage(
  postId: string,
  currentImage: IsoPostImage | undefined,
  replacementFileUri: string | undefined,
  dependencies: IsoImageReplacementDependencies
): Promise<IsoPostImage | null> {
  if (!replacementFileUri) {
    if (currentImage) {
      await dependencies.removeImage(postId, currentImage.id);
    }

    return null;
  }

  if (currentImage?.imageUrl === replacementFileUri) {
    return currentImage;
  }

  const replacement = await dependencies.addImage(postId, replacementFileUri);

  if (currentImage) {
    await dependencies.removeImage(postId, currentImage.id);
  }

  return replacement;
}
