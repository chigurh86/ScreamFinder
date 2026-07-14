import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getSupabaseClient } from '@/template';

/**
 * Native (iOS/Android) implementation of the avatar upload service.
 *
 * Uses a pure-JS base64 -> ArrayBuffer decoder so we don't depend on
 * `base64-arraybuffer` (which would require a dynamic require that
 * Metro's newer static analyser rejects) or Hermes-unsupported globals
 * like `atob` / `Buffer`.
 */

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Pure-JS base64 -> ArrayBuffer decoder. Ignores whitespace and standard
 * padding. Handles URL-safe base64 (- and _) as well.
 */
function base64ToArrayBuffer(input: string): ArrayBuffer {
  const clean = input.replace(/[^A-Za-z0-9+/=_-]/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLen = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLen = Math.floor((clean.length * 3) / 4) - padLen;
  const bytes = new Uint8Array(byteLen);

  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = BASE64_CHARS.indexOf(clean.charAt(i));
    const c2 = BASE64_CHARS.indexOf(clean.charAt(i + 1));
    const c3 = BASE64_CHARS.indexOf(clean.charAt(i + 2));
    const c4 = BASE64_CHARS.indexOf(clean.charAt(i + 3));

    const b1 = (c1 << 2) | (c2 >> 4);
    const b2 = ((c2 & 15) << 4) | (c3 >> 2);
    const b3 = ((c3 & 3) << 6) | c4;

    if (outIdx < byteLen) bytes[outIdx++] = b1;
    if (outIdx < byteLen) bytes[outIdx++] = b2;
    if (outIdx < byteLen) bytes[outIdx++] = b3;
  }
  return bytes.buffer;
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
      const arrayBuffer = base64ToArrayBuffer(asset.base64);
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
          const ab = base64ToArrayBuffer(b64Data);
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
