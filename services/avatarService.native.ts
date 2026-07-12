import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getSupabaseClient } from '@/template';
import { decode } from 'base64-arraybuffer';

/**
 * Determine a safe file extension from the asset's mimeType or URI.
 */
function getExtension(asset: ImagePicker.ImagePickerAsset): string {
  // Prefer the mimeType if available
  if (asset.mimeType) {
    if (asset.mimeType.includes('png')) return 'png';
    if (asset.mimeType.includes('webp')) return 'webp';
    return 'jpg';
  }
  // Fallback: try to extract from URI (only if it looks like a real extension)
  const uriParts = asset.uri.split('.');
  const last = uriParts[uriParts.length - 1]?.toLowerCase();
  if (last && /^(jpg|jpeg|png|webp)$/.test(last)) return last === 'jpeg' ? 'jpg' : last;
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
    // Always prefer base64 upload when available (works on all platforms)
    if (asset.base64) {
      const arrayBuffer = decode(asset.base64);
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          contentType: mimeType,
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);
    } else if (Platform.OS === 'web') {
      // Web fallback: convert data URI to blob manually if fetch fails
      let blob: Blob;
      try {
        const response = await fetch(asset.uri);
        blob = await response.blob();
      } catch {
        // If fetch fails (common with blob/data URIs in web preview), try manual conversion
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
      // Mobile fallback without base64
      throw new Error('Unable to process image. Please try again.');
    }
  } catch (e: any) {
    const msg = e?.message || 'Upload failed';
    throw new Error(msg);
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) throw new Error('Could not get public URL for avatar.');

  // Update user_profiles table
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId);

  if (updateError) throw new Error(updateError.message);

  return publicUrl;
}
