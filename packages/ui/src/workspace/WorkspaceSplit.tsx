import type { CSSProperties, ReactNode } from 'react';
import { usePreviewResize } from './usePreviewResize.js';
import { useWorkspacePreview } from './useWorkspacePreview.js';
/** The list owns its filters; the preview begins alongside them. */
export function WorkspaceSplit({
  filters,
  children,
  preview,
  previewLabel,
  mobilePreviewOpen = false,
}: {
  filters?: ReactNode;
  children: ReactNode;
  preview?: ReactNode;
  previewLabel?: string;
  mobilePreviewOpen?: boolean | undefined;
}) {
  const previewAvailable = useWorkspacePreview();
  const { ref, width, maximum, resize } = usePreviewResize();
  return (
    <div
      ref={ref}
      style={{ '--workspace-preview-width': `${width}px` } as CSSProperties}
      className={`nb-workspace-split${preview ? ' has-preview' : ''}`}
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
          <div
            className="nb-preview-resize"
            role="separator"
            tabIndex={0}
            aria-label="Vorschaubreite"
            aria-orientation="vertical"
            aria-valuemin={340}
            aria-valuemax={maximum}
            aria-valuenow={width}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                resize(width + (event.key === 'ArrowLeft' ? 20 : -20));
              } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                resize(event.key === 'Home' ? 340 : maximum);
              }
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                resize(
                  width +
                    event.currentTarget.getBoundingClientRect().left -
                    event.clientX,
                );
            }}
            onPointerUp={(event) =>
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          />
          {preview}
        </aside>
      )}
    </div>
  );
}
