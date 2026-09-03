import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: () => ({
    name: 'Lexync',
    description: 'Deliberately capture private language-learning material.',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_icon: {
        16: 'icons/icon-16.png',
        24: 'icons/icon-24.png',
        32: 'icons/icon-32.png',
      },
    },
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    host_permissions: [
      'http://*/*',
      'https://*/*',
    ],
    web_accessible_resources: [
      {
        resources: ['auth-callback.html'],
        matches: ['<all_urls>'],
      },
    ],
  }),
});
