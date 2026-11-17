import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {installClickFeedback} from './services/clickFeedback';

const stopClickFeedback = installClickFeedback();
if (import.meta.hot) import.meta.hot.dispose(stopClickFeedback);

createRoot(document.getElementById('root')!).render(<App />);
