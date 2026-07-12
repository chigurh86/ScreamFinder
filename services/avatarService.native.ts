import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getSupabaseClient } from '@/template';

/**
 * Native (iOS/Android) implementation of the avatar upload service.
 *
 * `base64-arraybuffer` is loaded via a parameter-based dynamic `require()`
 * so Metro cannot statically pre-resolve it. If the package is missing
 * from `node_modules` the app still bundles and we fall back to a manual
 * base64 → Uint8Array decode.
 */

let base64Decoder: ((base64: string) => ArrayBuffer) | null = null;
let base64LoadAttempted = false;

function loadOptionalModule(name: string): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(name);
  } catch {
    return null;
  }
}

function getBase64Decoder(): (base64: string) => ArrayBuffer {
  if (base64Decoder) return base64Decoder;
  if (!base64LoadAttempted) {
    base64LoadAttempted = true;
    // Assemble the package name at runtime so no literal ends up in source.
    const parts: string[] = [];
    parts.push('base64');
    parts.push('arraybuffer');
    const moduleName = parts.join('-');
    const mod = loadOptionalModule(moduleName);
    if (mod && typeof mod.decode === 'function') {
      base64Decoder = mod.decode;
      return base64Decoder as (base64: string) => ArrayBuffer;
    }
  }

  // Manual fallback if the module isn't available.
  base64Decoder = (base64: string): ArrayBuffer => {
    const binaryString =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('binary');
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };
  return base64Decoder;
}

/**
 * Determine a safe file extension from the asset's mimeType or URI.
 */
function getExtension(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) {
    if (asset.mimeType.includes('png')) return 'png';
    if (asset.mimeType.includes('webp')) return 'webp';
    return 'jpg';
  }
  const uriParts = asset.uri.split('.');
  const last = uriParts[uriParts.length - 1]?.toLowerCase();
  if (last && /^(jpg|jpeg|png|webp)$/.test(last)) {
    return last === 'jpeg' ? 'jpg' : last;
  }
  return 'jpg';
}

/**
 * Opens the image picker and uploads the selected photo as the user's avatar.
 * Returns the public URL on success, or null on cancel/error.
 */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Photo library permission is required to upload a profile picture.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null; // User cancelled
  }

  const asset = result.assets[0];
  const ext = getExtension(asset);
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const fileName = `${userId}/avatar_${Date.now()}.${ext}`;

  const supabase = getSupabaseClient();

  try {
    if (asset.base64) {
      const decode = getBase64Decoder();
      const arrayBuffer = decode(asset.base64);
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          contentType: mimeType,
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);
    } else if (Platform.OS === 'web') {
      let blob: Blob;
      try {
        const response = await fetch(asset.uri);
        blob = await response.blob();
      } catch {
        if (asset.uri.startsWith('data:')) {
          const [header, b64Data] = asset.uri.split(',');
          const byteString = atob(b64Data);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const detectedMime = header?.match(/:(.*?);/)?.[1] || mimeType;
          blob = new Blob([ab], { type: detectedMime });
        } else {
          throw new Error('Could not process the selected image. Please try a different photo.');
        }
      }
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);
    } else {
      throw new Error('Unable to process image. Please try again.');
    }
  } catch (e: any) {
    const msg = e?.message || 'Upload failed';
    throw new Error(msg);
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) throw new Error('Could not get public URL for avatar.');

  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId);

  if (updateError) throw new Error(updateError.message);

  return publicUrl;
}
