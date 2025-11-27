import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@styles/main.css';
import './styles/global.css';
const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element with id "root" was not found.');
}
ReactDOM.createRoot(rootElement).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
