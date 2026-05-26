import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getSupabaseClient } from '@/template';
import { decode } from 'base64-arraybuffer';

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
  const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const fileName = `${userId}/avatar_${Date.now()}.${ext}`;

  const supabase = getSupabaseClient();

  // Always prefer base64 upload when available (works on all platforms)
  if (asset.base64) {
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, decode(asset.base64), {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);
  } else if (Platform.OS === 'web') {
    // Web fallback: fetch blob from URI
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, blob, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);
  } else {
    // Mobile fallback without base64: read file as base64
    throw new Error('Unable to process image. Please try again.');
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
