import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neonrush.gravityracer',
  appName: 'Neon Rush',
  webDir: 'dist',
  backgroundColor: '#03030a',
  android: { allowMixedContent: false, backgroundColor: '#03030a' },
  plugins: {
    StatusBar: { style: 'DARK', backgroundColor: '#03030a', overlaysWebView: true },
  },
};

export default config;
