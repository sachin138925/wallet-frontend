import React from 'react';                    // Core React
import ReactDOM from 'react-dom/client';     // New root API since React 18
import './index.css';                        // Global CSS
import App from './App';                     // Main App component

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
