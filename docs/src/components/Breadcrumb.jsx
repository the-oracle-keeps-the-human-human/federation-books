import { Link } from 'react-router-dom';
import { sections } from '../data/nav';
import { useLang } from '../i18n/context';

export default function Breadcrumb({ section, title }) {
  const { lang } = useLang();
  const sec = sections.find((s) => s.id === section);
  const sectionLabel = sec ? (sec.label[lang] || sec.label.en) : section;

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        fontSize: '0.875rem',
        color: '#8b949e',
        flexWrap: 'wrap',
      }}
    >
      <Link to="/" style={{ color: '#58a6ff', textDecoration: 'none' }}>
        Home
      </Link>
      <span>/</span>
      <span style={{ color: '#c9d1d9' }}>{sectionLabel}</span>
      <span>/</span>
      <span style={{ color: '#e6edf3' }}>{title}</span>
    </nav>
  );
}
