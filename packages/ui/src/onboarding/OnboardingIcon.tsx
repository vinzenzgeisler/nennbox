/**
 * Plain line icon on a 24 × 24 grid for cards and headings of the guided setup. The
 * caller passes the path data; the drawings themselves are placeholders until the
 * designer delivers real sketches. Decorative: the card title carries the meaning.
 */
export function OnboardingIcon({ path }: { path: string }) {
  return (
    <svg
      className="nb-onb-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}
