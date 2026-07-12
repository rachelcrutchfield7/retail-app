export type CompressedImage = {
  uri: string;
  width?: number;
  height?: number;
};

export async function compressImage(uri: string): Promise<CompressedImage> {
  return { uri };
}
