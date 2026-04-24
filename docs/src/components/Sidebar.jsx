import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../i18n/context';
import { sections } from '../data/nav';
import '../styles/sidebar.css';

export default function Sidebar({ isOpen, onClose }) {
  const { t, lang } = useLang();
  const location = useLocation();
  const [openSections, setOpenSections] = useState(
    sections.reduce((acc, s) => ({ ...acc, [s.id]: true }), {})
  );

  const toggleSection = (id) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isActive = (path) => {
    return location.hash === '#' + path || location.pathname === path;
  };

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`} onClick={e => {
      if (e.target === e.currentTarget) onClose?.();
    }}>
      <Link to="/" className="sidebar-home" onClick={onClose}>
        {t('nav.home')}
      </Link>

      {sections.map(section => (
        <div key={section.id} className="sidebar-section">
          <div
            className="sidebar-section-title"
            onClick={() => toggleSection(section.id)}
          >
            {section.label[lang] || section.label.en}
            <span className={`arrow ${openSections[section.id] ? 'open' : ''}`}>
              &#9654;
            </span>
          </div>

          {openSections[section.id] && (
            <ul className="sidebar-links">
              {section.docs.map(doc => (
                <li key={doc.slug}>
                  <Link
                    to={`/${section.id}/${doc.slug}`}
                    className={`sidebar-link ${isActive(`/${section.id}/${doc.slug}`) ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    {doc.title[lang] || doc.title.en}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
