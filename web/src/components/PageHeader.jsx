export default function PageHeader({ title, description }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </header>
  );
}
