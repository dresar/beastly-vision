import ImageKit from 'imagekit';

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || '',
});

export default imagekit;

/**
 * Uploads a file to ImageKit
 * @param file Base64 string or Buffer
 * @param fileName Name of the file
 * @returns ImageKit upload result
 */
export async function uploadToImageKit(file: string | Buffer, fileName: string) {
  if (!process.env.IMAGEKIT_PRIVATE_KEY) {
    // Development mode fallback
    console.warn("IMAGEKIT_PRIVATE_KEY is missing. Using mock upload result.");
    return {
      url: typeof file === 'string' && file.startsWith('http') ? file : "https://images.unsplash.com/photo-1549480017-d76466a4b7e8?auto=format&fit=crop&q=80&w=800",
      fileId: "mock-id-" + Math.random().toString(36).substring(7)
    };
  }

  return await imagekit.upload({
    file: file,
    fileName: fileName,
    folder: "/wildguard/manual-checks/",
  });
}
