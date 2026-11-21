export default function Button({ variant = 'secondary', type = 'button', ...props }) {
  return <button type={type} className={`button button-${variant}`} {...props} />;
}
