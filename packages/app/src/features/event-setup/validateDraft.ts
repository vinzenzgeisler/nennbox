export function validateDraft(
  form: HTMLFormElement,
  setMessage: (message: string) => void,
): boolean {
  const data = new FormData(form);
  const name = String(data.get('event-name') ?? '').trim();
  const slug = String(data.get('event-slug') ?? '').trim();
  const startsOn = String(data.get('starts-on') ?? '');
  const endsOn = String(data.get('ends-on') ?? '');
  if (!form.reportValidity()) return false;
  if (!name || !slug || !startsOn || !endsOn) return false;
  if (endsOn < startsOn) {
    setMessage('Das Ende muss am oder nach dem Beginn liegen.');
    const endDate = form.elements.namedItem('ends-on');
    if (endDate instanceof HTMLElement) endDate.focus();
    return false;
  }
  for (const input of form.querySelectorAll<HTMLInputElement>(
    'input[data-fee]',
  )) {
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(input.value.trim())) {
      input.setCustomValidity('Betrag wie 25,00 oder 25.00 eingeben.');
      input.reportValidity();
      input.setCustomValidity('');
      return false;
    }
    if (!Number.isFinite(Number(input.value.trim().replace(',', '.')))) {
      input.reportValidity();
      return false;
    }
  }
  for (const input of form.querySelectorAll<HTMLInputElement>(
    'input[required]',
  )) {
    if (input.value.trim() === '') {
      input.setCustomValidity('Dieses Feld darf nicht leer sein.');
      input.reportValidity();
      input.setCustomValidity('');
      return false;
    }
  }
  return form.reportValidity();
}
