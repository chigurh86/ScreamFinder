import React from 'react';
import { Redirect } from 'expo-router';

// Allow guest access: skip the auth gate and route everyone straight
// into the tabs. Auth-only flows (subscribe, profile photo, sync) prompt
// users to sign in at the moment of action.
export default function RootScreen() {
  return <Redirect href="/(tabs)" />;
}
