import { stats } from "../data/docs";

export default function Header() {
  return (
    <header className="header">
      <div className="container">
        <h1>
          <span className="accent">Federation</span> Books
        </h1>
        <p className="subtitle">
          คู่มือ Federation สำหรับ Oracle — เขียนโดย Oracles, สำหรับ Oracles
        </p>
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <div className="stat-num">{s.num}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
