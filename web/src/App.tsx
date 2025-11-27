import klingerLogo from '@assets/KLINGERWestad_hires.png';
import upkipLogo from '@assets/Upkip-brand-assets-gray-2048x559.png';

const App = () => {
  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="app-header">
        <img src={klingerLogo} alt="KLINGER Westad logo" className="brand-logo" />
        <div className="app-header__text">
          <h1>Historical Database Portal</h1>
          <p>Search and explore KLINGER Westad history with Azure SQL intelligence.</p>
        </div>
        <img src={upkipLogo} alt="Upkip logo" className="app-badge" />
      </header>

      <main className="app-main">
        <section className="card-grid">
          <article className="card">
            <h2>Customers</h2>
            <p>
              Locate customers by name, number, contact details, or industry whilst correlating order
              references.
            </p>
          </article>
          <article className="card">
            <h2>Suppliers</h2>
            <p>
              Review supplier profiles and addresses to accelerate sourcing and audit readiness.
            </p>
          </article>
          <article className="card">
            <h2>Customer Orders</h2>
            <p>
              Drill into customer order history, line items, and BOM structures in a single workspace.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
};

export default App;

