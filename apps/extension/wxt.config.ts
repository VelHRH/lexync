import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: () => {
    const supabaseUrl = import.meta.env.WXT_PUBLIC_SUPABASE_URL;

    return {
      name: 'Lexync',
      description: 'Deliberately capture private language-learning material.',
      permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
      host_permissions: [
        'http://*/*',
        'https://*/*',
        ...(supabaseUrl ? [`${new URL(supabaseUrl).origin}/*`] : []),
      ],
      web_accessible_resources: [
        {
          resources: ['auth-callback.html'],
          matches: ['<all_urls>'],
        },
      ],
    };
  },
});
