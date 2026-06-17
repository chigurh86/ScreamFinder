import React from 'react';
import { Redirect } from 'expo-router';

export default function RootScreen() {
  // Always land on the search tab. Guests can browse freely until they
  // exhaust their free searches, at which point they will be sent to /login.
  return <Redirect href="/(tabs)" />;
}
