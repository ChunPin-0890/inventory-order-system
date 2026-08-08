import { Link } from 'react-router-dom';

const TECH_STACK = [
  'React', 'TypeScript', '.NET 8', 'EF Core', 'Azure SQL', 'Azure App Service', 'GitHub Actions',
];

const HIGHLIGHTS = [
  {
    title: 'Concurrency-safe stock management',
    body: 'Optimistic concurrency tokens and database transactions prevent overselling when two orders race for the same inventory.',
  },
  {
    title: 'Order state machine',
    body: 'Orders move through Pending → Confirmed → Shipped → Completed/Cancelled, with every transition validated server-side.',
  },
  {
    title: 'JWT auth with role-based access',
    body: 'Admin and Staff roles, a public guest mode, and permission checks enforced on the API — not just hidden in the UI.',
  },
  {
    title: 'Real CI/CD pipeline',
    body: '27 backend + 14 frontend tests run automatically on every push; deployment is blocked if anything fails.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <h1>📦 Inventory &amp; Order System</h1>
        <p className="landing-tagline">
          A full-stack portfolio project — a small business inventory and order platform,
          built end-to-end and deployed live on Azure.
        </p>
        <div className="landing-cta">
          <Link className="btn primary" to="/products">Browse as Guest</Link>
          <Link className="btn" to="/login">Sign in</Link>
        </div>
        <div className="landing-tech">
          {TECH_STACK.map((tech) => (
            <span key={tech} className="tech-badge">{tech}</span>
          ))}
        </div>
      </section>

      <section className="landing-highlights">
        {HIGHLIGHTS.map((h) => (
          <div key={h.title} className="panel highlight-card">
            <h2>{h.title}</h2>
            <p>{h.body}</p>
          </div>
        ))}
      </section>

      <section className="landing-footer-note panel">
        <p>
          Demo accounts are available on the sign-in page (Admin and Staff) — or browse the
          product catalog right now without an account using "Browse as Guest" above.
        </p>
      </section>
    </div>
  );
}
