import { createRoot } from 'react-dom/client';
import '@fontsource-variable/readex-pro';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './styles.css';
import App from './App.jsx';
import { applyAppearance, readAppearance, watchSystemTheme } from './appearance.js';

applyAppearance(readAppearance());
watchSystemTheme();

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
