import { skills } from "../data/docs";

function SkillCard({ skill }) {
  return (
    <div className="card">
      <h3 className="skill-name">{skill.name}</h3>
      <p>{skill.desc}</p>
      <span
        className="tag"
        style={{ background: "#3d1f2a", color: "#f85149" }}
      >
        skill
      </span>
    </div>
  );
}

export default function SkillGrid() {
  return (
    <section className="section">
      <h2>Skills</h2>
      <div className="grid">
        {skills.map((s) => (
          <SkillCard key={s.name} skill={s} />
        ))}
      </div>
    </section>
  );
}
