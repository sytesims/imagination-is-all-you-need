import './shared/fetchCache'; // first: the shared read cache wraps fetch before anything reads the API
import { createRoot } from 'react-dom/client';
import './shared/quietMode'; // reads ?demo=1 before the router rewrites the URL
import './pageStyles'; // component CSS in the pre-split order (keeps the cascade identical with lazy pages)
import App from './App';
import { installMediaManager } from './shared/mediaPause';
import { installTabRestore } from './shared/tabRestore';
import './tokens.css';
import './styles.css';
import './ui-states.css';
import './runon.css';
/* tab switching (2026-10-27): nothing plays in a hidden tab, off-screen clips drop their source, and a reload comes back to the same place */
installMediaManager(); installTabRestore();
createRoot(document.getElementById('root')!).render(<App />);
