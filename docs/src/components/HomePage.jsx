import { Link } from 'react-router-dom';
import { sections } from '../data/nav';
import { useLang } from '../i18n/context';

const sectionIcons = {
  guides: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  reference: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  recipes: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  blog: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
};

const sectionColors = {
  guides: '#f89b3f',
  reference: '#1d2d6b',
  recipes: '#d8423a',
  blog: '#bfe0ed',
};

export default function HomePage() {
  const { t, lang } = useLang();

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 400,
            fontFamily: 'var(--font-serif)',
            color: '#1d2d6b',
            marginBottom: '0.5rem',
          }}
        >
          {t('home.title')}
        </h1>
        <p style={{ color: 'rgba(29,45,107,.58)', fontSize: '1.1rem', maxWidth: 600, margin: '0 auto' }}>
          {t('home.subtitle')}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {sections.map((sec) => {
          const firstDoc = sec.docs[0];
          const color = sectionColors[sec.id] || '#8b949e';
          const icon = sectionIcons[sec.id];

          return (
            <Link
              key={sec.id}
              to={`/${sec.id}/${firstDoc.slug}`}
              style={{
                display: 'block',
                background: '#ffffff',
                border: '1px solid rgba(29,45,107,.15)',
                borderRadius: 16,
                padding: '1.5rem',
                textDecoration: 'none',
                transition: 'border-color 0.2s, transform 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = color;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(29,45,107,.15)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={icon} />
                </svg>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1d2d6b', fontFamily: 'var(--font-serif)' }}>
                  {sec.label[lang] || sec.label.en}
                </h2>
              </div>

              <p style={{ color: 'rgba(29,45,107,.58)', margin: 0, fontSize: '0.9rem' }}>
                {sec.docs.length} {t('home.documents')}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
