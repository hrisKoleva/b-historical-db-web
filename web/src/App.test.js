import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from '@testing-library/react';
import App from './App';
describe('App shell', () => {
    it('renders the key product areas', () => {
        render(_jsx(App, {}));
        expect(screen.getByRole('heading', { name: /historical database portal/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /customers/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /suppliers/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /customer orders/i })).toBeInTheDocument();
    });
});
