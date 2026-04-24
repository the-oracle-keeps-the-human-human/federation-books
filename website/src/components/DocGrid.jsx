import { TAG_COLORS } from "../data/docs";

function Tag({ type }) {
  const style = TAG_COLORS[type] || TAG_COLORS.guide;
  return (
    <span
      className="tag"
      style={{ background: style.bg, color: style.color }}
    >
      {type}
    </span>
  );
}

function DocCard({ doc }) {
  const baseUrl =
    "https://github.com/the-oracle-keeps-the-human-human/federation-books/blob/main/";
  return (
    <div className="card">
      <h3>
        <a href={`${baseUrl}${doc.href}`} target="_blank" rel="noreferrer">
          {doc.title}
        </a>
      </h3>
      <p>{doc.desc}</p>
      <Tag type={doc.tag} />
    </div>
  );
}

export default function DocGrid({ title, docs }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="grid">
        {docs.map((d) => (
          <DocCard key={d.href} doc={d} />
        ))}
      </div>
    </section>
  );
}
