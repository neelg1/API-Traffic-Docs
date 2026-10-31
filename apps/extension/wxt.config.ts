import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'APITrafficDocs',
    description: 'Turn live API traffic into OpenAPI documentation.',
    // Keep this empty unless a feature truly needs a permission (roadmap X4).
    permissions: [],
  },
});
