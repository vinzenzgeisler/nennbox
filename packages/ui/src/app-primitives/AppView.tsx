import {
  useId,
  type ReactNode,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function AppView({ children }: { children: ReactNode }) {
  return <div className="nb-app-view">{children}</div>;
}
export function AppGrid({
  children,
  columns = 'auto',
}: {
  children: ReactNode;
  columns?: 'auto' | 'two';
}) {
  return <div className={`nb-app-grid nb-app-grid-${columns}`}>{children}</div>;
}
export function AppSection({
  title,
  description,
  children,
  role,
}: {
  role?: 'group';
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="nb-app-section" role={role} aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="nb-app-stack">{children}</div>
    </section>
  );
}
export function AppNotice({
  children,
  tone = 'warning',
  title,
}: {
  children: ReactNode;
  tone?: 'warning' | 'error' | 'success';
  title?: string;
}) {
  return (
    <div
      className={`nb-app-notice nb-app-notice-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {title && <strong>{title}</strong>}
      <div className="nb-app-inline">{children}</div>
    </div>
  );
}
export function AppEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="nb-app-empty">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
export function AppValueRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="nb-app-value-row">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}
export function AppChoiceGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="nb-app-choices">
      <legend>{label}</legend>
      <div className="nb-app-inline">{children}</div>
    </fieldset>
  );
}
export function AppTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="nb-app-table-scroll">
      <table className="nb-app-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function AppTextInput({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nb-app-input">
      <span>{label}</span>
      <input {...props} className="nb-app-field" />
    </label>
  );
}
export function AppSelect({
  label,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="nb-app-input">
      <span>{label}</span>
      <span className="nb-app-select-control">
        <select {...props} className="nb-app-field nb-app-select" />
      </span>
    </label>
  );
}
export function AppTextarea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="nb-app-input">
      <span>{label}</span>
      <textarea {...props} className="nb-app-field" />
    </label>
  );
}
