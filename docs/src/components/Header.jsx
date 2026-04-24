import { Link } from 'react-router-dom';
import LangToggle from './LangToggle';
import '../styles/layout.css';

export default function Header({ onToggleSidebar }) {
  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="hamburger" onClick={onToggleSidebar}>
          &#9776;
        </button>
        <Link to="/" className="header-title" style={{ textDecoration: 'none' }}>
          <span className="accent">Federation</span> Docs
        </Link>
      </div>
      <div className="header-right">
        <LangToggle />
        <a
          href="https://github.com/the-oracle-keeps-the-human-human/federation-books"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-dim)', fontSize: '0.85em' }}
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
