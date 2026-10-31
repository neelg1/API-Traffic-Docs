import { browser } from 'wxt/browser';

// Adds the "APITrafficDocs" tab to DevTools. No icon yet; the path is
// relative to the extension root, where WXT emits the panel page.
browser.devtools.panels.create('APITrafficDocs', '', 'devtools-panel.html');
