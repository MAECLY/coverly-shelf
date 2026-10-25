import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Manifest permissions are kept to the minimum the spec allows: `storage`
// for the per-game cache and host access only to the two artwork hosts.
// The content script's own match pattern grants access to hShop pages.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Coverly Shelf',
    // Strings for the options page live in public/_locales (en, es).
    default_locale: 'en',
    description:
      'Box art and screenshots for 3DS game pages. Purely cosmetic: it never touches downloads.',
    permissions: ['storage'],
    // Toolbar button with no popup: a click opens the settings page (background.ts).
    // Declaring an action needs no permission.
    action: { default_title: '__MSG_optionsTitle__' },
    host_permissions: ['https://art.gametdb.com/*', 'https://thumbnails.libretro.com/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
