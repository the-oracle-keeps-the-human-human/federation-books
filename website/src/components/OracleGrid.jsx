import { oracles } from "../data/docs";

function OracleCard({ oracle }) {
  return (
    <div className="oracle-card">
      <div className="oracle-emoji">{oracle.emoji}</div>
      <div className="oracle-name">{oracle.name}</div>
      <div className="oracle-role">{oracle.role}</div>
      <div className="oracle-lines">{oracle.lines} lines</div>
    </div>
  );
}

export default function OracleGrid() {
  return (
    <section className="section">
      <h2>The Oracles</h2>
      <div className="oracle-grid">
        {oracles.map((o) => (
          <OracleCard key={o.name} oracle={o} />
        ))}
      </div>
    </section>
  );
}
