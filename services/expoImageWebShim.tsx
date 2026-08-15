import React from 'react';
import { Image as RNImage, ImageResizeMode } from 'react-native';

// Web-only shim for expo-image. The real expo-image@2.2.1 module fails to
// bundle on web because its ImageRef class extends a SharedRef export that
// is undefined at web build time. Since every consumer in this project only
// imports the named `Image` export, we provide a thin wrapper around React
// Native's Image with the props expo-image consumers pass in.

type ContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

type ExpoImageSource =
  | string
  | number
  | { uri?: string; width?: number; height?: number; blurhash?: string }
  | Array<string | { uri?: string; width?: number; height?: number }>
  | null
  | undefined;

const contentFitToResizeMode = (fit?: ContentFit): ImageResizeMode => {
  switch (fit) {
    case 'contain':
      return 'contain';
    case 'fill':
      return 'stretch';
    case 'none':
      return 'center';
    case 'scale-down':
      return 'contain';
    case 'cover':
    default:
      return 'cover';
  }
};

const normalizeSource = (source: ExpoImageSource): any => {
  if (source == null) return undefined;
  if (typeof source === 'string') return { uri: source };
  if (Array.isArray(source)) {
    const first = source[0];
    if (first == null) return undefined;
    if (typeof first === 'string') return { uri: first };
    return first;
  }
  return source;
};

export interface ImageProps {
  source?: ExpoImageSource;
  style?: any;
  contentFit?: ContentFit;
  contentPosition?: any;
  transition?: any;
  placeholder?: any;
  placeholderContentFit?: ContentFit;
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string | null;
  allowDownscaling?: boolean;
  autoplay?: boolean;
  responsivePolicy?: string;
  enableLiveTextInteraction?: boolean;
  focusable?: boolean;
  blurRadius?: number;
  tintColor?: string;
  accessibilityLabel?: string;
  accessible?: boolean;
  testID?: string;
  onLoad?: (event?: any) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: (event?: any) => void;
  onProgress?: (event?: any) => void;
  [key: string]: any;
}

export const Image = React.forwardRef<any, ImageProps>(function ExpoImageWebShim(
  props,
  ref,
) {
  const {
    source,
    style,
    contentFit,
    tintColor,
    blurRadius,
    onLoad,
    onLoadStart,
    onLoadEnd,
    onError,
    accessibilityLabel,
    accessible,
    testID,
    // props unique to expo-image that RN Image does not accept
    contentPosition: _contentPosition,
    transition: _transition,
    placeholder: _placeholder,
    placeholderContentFit: _placeholderContentFit,
    cachePolicy: _cachePolicy,
    priority: _priority,
    recyclingKey: _recyclingKey,
    allowDownscaling: _allowDownscaling,
    autoplay: _autoplay,
    responsivePolicy: _responsivePolicy,
    enableLiveTextInteraction: _enableLiveTextInteraction,
    focusable: _focusable,
    onProgress: _onProgress,
    ...rest
  } = props;

  return (
    <RNImage
      ref={ref as any}
      source={normalizeSource(source) as any}
      style={style}
      resizeMode={contentFitToResizeMode(contentFit)}
      tintColor={tintColor as any}
      blurRadius={blurRadius}
      onLoad={onLoad}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
      onError={onError as any}
      accessibilityLabel={accessibilityLabel}
      accessible={accessible}
      testID={testID}
      {...rest}
    />
  );
});

// Named + default export so both `import { Image }` and default-style
// imports resolve correctly.
export default { Image };
