import { createRoot } from 'react-dom/client';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/alexandria';
import './styles.css';
import App from './App.jsx';
import { applyAppearance, readAppearance, watchSystemTheme } from './appearance.js';

applyAppearance(readAppearance());
watchSystemTheme();

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
