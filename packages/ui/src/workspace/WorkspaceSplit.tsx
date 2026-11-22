import type { ReactNode } from 'react';
import { useWorkspacePreview } from './useWorkspacePreview.js';
/** The list owns its filters; the preview begins alongside them. */
export function WorkspaceSplit({
  filters,
  children,
  preview,
  previewLabel,
  mobilePreviewOpen = false,
  wide = false,
}: {
  filters?: ReactNode;
  children: ReactNode;
  preview?: ReactNode;
  previewLabel?: string;
  mobilePreviewOpen?: boolean | undefined;
  wide?: boolean | undefined;
}) {
  const previewAvailable = useWorkspacePreview();
  return (
    <div
      className={`nb-workspace-split${preview ? ' has-preview' : ''}${wide ? ' is-wide' : ''}`}
      data-preview-available={previewAvailable ? 'true' : 'false'}
    >
      <div className="nb-workspace-split-content">
        {filters && <div className="nb-workspace-split-filters">{filters}</div>}
        {children}
      </div>
      {preview && (
        <aside
          className={`nb-workspace-split-preview${mobilePreviewOpen ? ' is-mobile-open' : ''}`}
          aria-label={previewLabel}
        >
          {preview}
        </aside>
      )}
    </div>
  );
}
