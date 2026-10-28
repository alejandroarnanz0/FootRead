import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { FiltersProvider } from './hooks/useFilters.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <FiltersProvider>
        <App />
      </FiltersProvider>
    </BrowserRouter>
  </StrictMode>
);
