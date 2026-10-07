import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { theme } from '../../constants/theme';
import type { MovieVersion } from '../../services/versionService';

interface VersionPickerModalProps {
  visible: boolean;
  title: string;
  versions: MovieVersion[];
  onSelect: (version: MovieVersion) => void;
  onClose: () => void;
}

export default function VersionPickerModal({
  visible,
  title,
  versions,
  onSelect,
  onClose,
}: VersionPickerModalProps) {
  // Group identical-year duplicates (rare — happens for re-releases)
  // just so the list reads cleanly.
  const uniqueVersions = useMemo(() => {
    const seen = new Set<string>();
    const out: MovieVersion[] = [];
    for (const v of versions) {
      const key = `${v.type}_${v.year}_${v.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }, [versions]);

  const handleSelect = (version: MovieVersion) => {
    Haptics.selectionAsync().catch(() => {});
    onSelect(version);
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <Animated.View entering={FadeIn.duration(220)} style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Which version?</Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                We found multiple matches for "{title}". Pick the one you mean
                so we can tailor the recommendations.
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color={theme.textMuted} />
            </Pressable>
          </View>

          {/* Version list */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {uniqueVersions.map((version, index) => (
              <Animated.View
                key={version.id}
                entering={FadeInDown.delay(index * 50).duration(260)}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.versionRow,
                    pressed && styles.versionRowPressed,
                  ]}
                  onPress={() => handleSelect(version)}
                >
                  {version.posterUrl ? (
                    <Image
                      source={{ uri: version.posterUrl }}
                      style={styles.poster}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={styles.posterPlaceholder}>
                      <Ionicons
                        name={version.type === 'tv' ? 'tv-outline' : 'film-outline'}
                        size={22}
                        color={theme.textMuted}
                      />
                    </View>
                  )}
                  <View style={styles.versionBody}>
                    <View style={styles.versionTitleRow}>
                      <Text style={styles.versionTitle} numberOfLines={1}>
                        {version.title}
                      </Text>
                      {version.year ? (
                        <Text style={styles.versionYear}>{version.year}</Text>
                      ) : null}
                    </View>
                    <View style={styles.metaRow}>
                      <View style={styles.typeChip}>
                        <Ionicons
                          name={version.type === 'tv' ? 'tv' : 'film'}
                          size={9}
                          color={theme.accent}
                        />
                        <Text style={styles.typeChipText}>
                          {version.type === 'tv' ? 'TV Show' : 'Movie'}
                        </Text>
                      </View>
                      {version.voteAverage > 0 ? (
                        <View style={styles.ratingChip}>
                          <Ionicons name="star" size={10} color="#FCD34D" />
                          <Text style={styles.ratingChipText}>
                            {version.voteAverage.toFixed(1)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {version.overview ? (
                      <Text style={styles.versionOverview} numberOfLines={2}>
                        {version.overview}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.chevron}>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={theme.textMuted}
                    />
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>

          {/* Footer */}
          <Pressable onPress={handleClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>{'Not sure \u2014 just search'}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.primary,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceLight,
  },
  list: {
    maxHeight: 480,
  },
  listContent: {
    paddingVertical: 10,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  versionRowPressed: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  poster: {
    width: 56,
    height: 84,
    borderRadius: 6,
    backgroundColor: theme.surfaceLight,
  },
  posterPlaceholder: {
    width: 56,
    height: 84,
    borderRadius: 6,
    backgroundColor: theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionBody: {
    flex: 1,
    gap: 4,
  },
  versionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  versionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  versionYear: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.primaryLight,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(252, 211, 77, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FCD34D',
  },
  versionOverview: {
    fontSize: 11,
    color: theme.textMuted,
    lineHeight: 15,
    marginTop: 2,
  },
  chevron: {
    paddingLeft: 2,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.backgroundSecondary,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
});
