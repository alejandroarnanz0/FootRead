export default function MediaCredit({ asset, className }) {
  if (!asset) return null;
  return (
    <p className={className}>
      <a href={asset.source}>{asset.author}</a>{asset.date && ` · ${asset.date}`}
      {' · '}<a href={asset.terms}>{asset.license}</a>
      {asset.edits && ` · ${asset.edits}`}
    </p>
  );
}
