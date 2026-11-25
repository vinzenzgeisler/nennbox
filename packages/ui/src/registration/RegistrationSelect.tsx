import type { SelectHTMLAttributes } from 'react';

/** Native select of the public form: 40 px with the form's own chevron, labelled by `RegistrationField`. */
export function RegistrationSelect({
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>) {
  return <select {...props}>{children}</select>;
}
