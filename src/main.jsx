import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import EventModelBoard from './EventModelBoard.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EventModelBoard />
  </StrictMode>
);
