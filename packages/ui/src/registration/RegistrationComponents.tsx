import React, { cloneElement, isValidElement, useId, useState } from 'react';

export type RegistrationStep = {
  id: string;
  label: string;
  completed?: boolean;
};
export type RegistrationShellProps = {
  brand: React.ReactNode;
  title?: string;
  headerEnd?: React.ReactNode;
  steps: readonly RegistrationStep[];
  currentStep: string;
  onStepChange?: (id: string) => void;
  stepLabel?: string;
  stepsLabel?: string;
  sidebarNote?: React.ReactNode;
  summary?: React.ReactNode;
  summaryTitle?: string;
  /** Non-monetary count only, e.g. “1 Startmeldung”. */
  summaryCount?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/** Public form frame. Only completed steps navigate; the mobile dock never shows a price. */
// prettier-ignore
export function RegistrationShell({ brand, title = 'Nennformular', headerEnd, steps, currentStep, onStepChange, stepLabel,
  stepsLabel = 'Schritte', sidebarNote, summary, summaryTitle = 'Deine Nennung', summaryCount, actions, footer, className = '', style,
  children, }: RegistrationShellProps) { const [summaryOpen, setSummaryOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false); const id = useId(); const active = Math.max( 0,
  steps.findIndex((step) => step.id === currentStep), ); const position = stepLabel ??
  `Schritt ${active + 1} von ${steps.length} · ${steps[active]?.label ?? ''}`; return ( <div
  className={`nb-reg${summary ? ' has-summary' : ''} ${className}`} style={style} > <header className="nb-reg-top">
  <div className="nb-reg-brand">{brand}</div> <span className="nb-reg-flow-title">{title}</span>
  <div className="nb-reg-header-end">{headerEnd}</div> </header> <div className="nb-reg-mobile-progress"> <div role="progressbar"
  aria-label={position} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={active + 1} > <span style={{
  width: `${((active + 1) / Math.max(1, steps.length)) * 100}%`, }} /> </div> <button type="button" aria-expanded={stepsOpen}
  aria-controls={`${id}-steps`} onClick={() => setStepsOpen(!stepsOpen)} > {position}
  <span aria-hidden="true">{stepsOpen ? '⌃' : '⌄'}</span> </button> </div> <div className="nb-reg-frame"> <aside
  className={`nb-reg-sidebar${stepsOpen ? ' is-open' : ''}`} id={`${id}-steps`} > <nav aria-label={stepsLabel}> <ol>
  {steps.map((step, index) => ( <li key={step.id}> <button type="button"
  className={`nb-reg-step${step.id === currentStep ? ' is-current' : ''}${step.completed ? ' is-complete' : ''}`}
  aria-current={step.id === currentStep ? 'step' : undefined} disabled={ !step.completed || !onStepChange || step.id === currentStep }
  onClick={() => { onStepChange?.(step.id); setStepsOpen(false); }} > <span className="nb-reg-step-number" aria-hidden="true">
  {step.completed ? '✓' : index + 1} </span> <span>{step.label}</span> </button> </li> ))} </ol> </nav> {sidebarNote && (
  <div className="nb-reg-sidebar-note">{sidebarNote}</div> )} </aside> <main className="nb-reg-main">
  <div className="nb-reg-content">{children}</div> <div className="nb-reg-dock"> {summary && ( <button type="button"
  className="nb-reg-summary-toggle" aria-expanded={summaryOpen} aria-controls={`${id}-summary`}
  onClick={() => setSummaryOpen(!summaryOpen)} > <strong>{summaryTitle}</strong> <span>{summaryCount}</span>
  <span aria-hidden="true">{summaryOpen ? '⌄' : '⌃'}</span> </button> )} {actions && <div className="nb-reg-actions">{actions}</div>}
  </div> </main> {summary && ( <aside id={`${id}-summary`} aria-label={summaryTitle}
  className={`nb-reg-summary${summaryOpen ? ' is-open' : ''}`} > <div className="nb-reg-summary-heading"> <h2>{summaryTitle}</h2> <button
  type="button" className="nb-reg-summary-close" aria-label={summaryTitle} onClick={() => setSummaryOpen(false)} > × </button> </div>
  {summary} </aside> )} </div> {footer && <footer className="nb-reg-footer">{footer}</footer>} </div> ); }

export type RegistrationFieldControlProps = {
  id: string;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: true | undefined;
  'aria-required'?: boolean | undefined;
};
export type RegistrationFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'children'
> & {
  label: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  requiredLabel?: string;
  optionalLabel?: string;
  /** An input is supplied by default; render props also support composed controls. */
  children?:
    | React.ReactElement<RegistrationFieldControlProps>
    | ((props: RegistrationFieldControlProps) => React.ReactNode);
};

// prettier-ignore
export function RegistrationField({ label, hint, error, required = false, requiredLabel = 'Erforderlich', optionalLabel = 'Freiwillig',
  id, children, className = '', ...inputProps }: RegistrationFieldProps) { const generated = useId();
  const controlId = id ?? `reg-${generated}`; const control: RegistrationFieldControlProps = { id: controlId, 'aria-describedby': [
  inputProps['aria-describedby'], error ? `${controlId}-error` : hint ? `${controlId}-hint` : '', ] .filter(Boolean)
  .join(' ') || undefined, 'aria-invalid': error ? true : undefined, 'aria-required': required || undefined, }; return (
  <div className={`nb-reg-field${error ? ' has-error' : ''} ${className}`}> <label htmlFor={controlId}> {label}
  <span>{required ? requiredLabel : optionalLabel}</span> </label> {typeof children === 'function' ? ( children(control)
  ) : isValidElement(children) ? ( cloneElement(children, control) ) : ( <input {...inputProps} {...control} required={required} /> )}
  {error ? ( <small className="nb-reg-field-error" id={`${controlId}-error`}> <span aria-hidden="true">ⓘ</span> {error} </small> ) : (
  hint && <small id={`${controlId}-hint`}>{hint}</small> )} </div> ); }

export type RegistrationCardProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
};

// prettier-ignore
export function RegistrationCard({ title, description, action, children, className = '', inset, }: RegistrationCardProps) {
  const id = useId(); return ( <section className={`nb-reg-card${inset ? ' is-inset' : ''} ${className}`}
  aria-labelledby={title ? id : undefined} > {(title || action) && ( <header> <div> {title && <h2 id={id}>{title}</h2>}
  {description && <p>{description}</p>} </div> {action} </header> )} <div className="nb-reg-card-body">{children}</div> </section> ); }

export type RegistrationNoticeProps = {
  tone?: 'info' | 'warning' | 'error' | 'success';
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Only dynamically inserted errors should interrupt the screen reader. */
  announce?: boolean;
};

// prettier-ignore
export function RegistrationNotice({ tone = 'info', title, children, className = '', announce, }: RegistrationNoticeProps) { return (
  <div className={`nb-reg-notice is-${tone} ${className}`} role={announce ? (tone === 'error' ? 'alert' : 'status') : undefined} >
  <span className="nb-reg-notice-icon" aria-hidden="true"> {tone === 'success' ? '✓' : tone === 'warning' ? '△' : 'ⓘ'} </span> <div>
  {title && <strong>{title}</strong>} <div>{children}</div> </div> </div> ); }

export type RegistrationUploadProps = {
  label: string;
  state?: 'empty' | 'uploading' | 'success' | 'error';
  detail?: string | undefined;
  error?: string | undefined;
  progress?: number;
  required?: boolean;
  accept?: string;
  disabled?: boolean;
  onSelect?: (file: File) => void;
  onRemove?: () => void;
  onCancel?: () => void;
  onView?: () => void;
  labels?: Partial<
    Record<
      | 'choose'
      | 'camera'
      | 'replace'
      | 'remove'
      | 'cancel'
      | 'view'
      | 'required'
      | 'optional'
      | 'uploading'
      | 'success',
      string
    >
  >;
};

/** State is controlled by the consumer; choosing a file does not pretend to upload it. */
// prettier-ignore
export function RegistrationUpload({ label, state = 'empty', detail, error, progress, required = false, accept = '.pdf,.jpg,.jpeg,.png',
  disabled, onSelect, onRemove, onCancel, onView, labels, }: RegistrationUploadProps) { const id = useId(); const text = {
  choose: 'Datei wählen', camera: 'Foto aufnehmen', replace: 'Andere Datei wählen', remove: 'Entfernen', cancel: 'Abbrechen',
  view: 'Ansehen', required: 'Erforderlich', optional: 'Freiwillig', uploading: 'wird hochgeladen', success: 'hochgeladen', ...labels, };
  const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) onSelect?.(file);
  event.target.value = ''; }; return ( <div className="nb-reg-upload-field"> <div className={`nb-reg-upload is-${state}`}
  aria-busy={state === 'uploading'} aria-labelledby={`${id}-label`} > <span className="nb-reg-upload-icon" aria-hidden="true">
  {state === 'success' ? '✓' : state === 'error' ? 'ⓘ' : state === 'uploading' ? '↑' : '↥'} </span> <div className="nb-reg-upload-copy">
  <strong id={`${id}-label`}>{label}</strong> <small id={`${id}-detail`}> {detail ??
  `${required ? text.required : text.optional} · PDF, JPG, PNG · max. 10 MB`} </small> {state === 'uploading' && ( <>
  <span className="nb-reg-upload-status" role="status"> {text.uploading} </span> <progress aria-label={`${label}: ${text.uploading}`}
  max={100} value={progress} /> </> )} {state === 'success' && ( <span className="nb-reg-upload-status">{text.success}</span> )} </div>
  <div className="nb-reg-upload-actions"> {(state === 'empty' || state === 'error') && onSelect && ( <>
  <label className="nb-reg-file-action"> <input type="file" accept={accept} disabled={disabled}
  aria-label={`${label}: ${state === 'error' ? text.replace : text.choose}`}
  aria-describedby={`${id}-detail${error ? ` ${id}-error` : ''}`} onChange={selectFile} />
  {state === 'error' ? text.replace : text.choose} </label> <label className="nb-reg-camera-action"> <input type="file" accept="image/*"
  capture="environment" disabled={disabled} aria-label={`${label}: ${text.camera}`} onChange={selectFile} /> {text.camera} </label> </> )}
  {state === 'success' && onView && ( <button type="button" disabled={disabled} onClick={onView}> {text.view} </button> )}
  {state === 'success' && onRemove && ( <button type="button" disabled={disabled} onClick={onRemove}> {text.remove} </button> )}
  {state === 'uploading' && onCancel && ( <button type="button" disabled={disabled} onClick={onCancel}> {text.cancel} </button> )} </div>
  </div> {error && ( <small id={`${id}-error`} className="nb-reg-field-error"> <span aria-hidden="true">ⓘ</span> {error} </small> )}
  </div> ); }
