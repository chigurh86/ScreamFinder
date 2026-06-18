import * as ImagePicker from 'expo-image-picker';
import { getSupabaseClient } from '@/template';

function getExtension(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) {
    if (asset.mimeType.includes('png')) return 'png';
    if (asset.mimeType.includes('webp')) return 'webp';
    return 'jpg';
  }
  const uriParts = asset.uri.split('.');
  const last = uriParts[uriParts.length - 1]?.toLowerCase();
  if (last && /^(jpg|jpeg|png|webp)$/.test(last)) return last === 'jpeg' ? 'jpg' : last;
  return 'jpg';
}

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
    return null;
  }

  const asset = result.assets[0];
  const ext = getExtension(asset);
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const fileName = `${userId}/avatar_${Date.now()}.${ext}`;

  const supabase = getSupabaseClient();

  try {
    let blob: Blob;
    if (asset.base64) {
      // Convert base64 directly to blob using browser APIs
      const byteString = atob(asset.base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab], { type: mimeType });
    } else {
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
    }
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, blob, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);
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
