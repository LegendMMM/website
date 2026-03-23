import { useState } from "react";

function classNames(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export function ProductImageLightbox(props: {
  imageUrl: string | null;
  alt: string;
  frameClassName?: string;
  thumbClassName?: string;
  emptyClassName?: string;
  zoomButtonClassName?: string;
}): JSX.Element {
  const {
    imageUrl,
    alt,
    frameClassName,
    thumbClassName,
    emptyClassName,
    zoomButtonClassName,
  } = props;
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  if (!imageUrl) {
    return <div className={classNames("product-lightbox-empty rounded-xl bg-slate-100", emptyClassName)} aria-label="no-image" />;
  }

  return (
    <>
      <div
        className={classNames("product-lightbox-frame relative w-full cursor-zoom-in overflow-hidden rounded-xl bg-white/80", frameClassName)}
        onClick={() => setIsZoomOpen(true)}
      >
        <img className={classNames("product-lightbox-thumb w-full rounded-xl object-contain", thumbClassName)} src={imageUrl} alt={alt} loading="lazy" />
        <button
          type="button"
          className={classNames(
            "absolute bottom-2 right-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-800 backdrop-blur",
            zoomButtonClassName,
          )}
          onClick={(event) => {
            event.stopPropagation();
            setIsZoomOpen(true);
          }}
        >
          放大
        </button>
      </div>
      {isZoomOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/92 p-2 sm:p-4"
          onClick={() => setIsZoomOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setIsZoomOpen(false)}
          >
            關閉
          </button>
          <div className="flex h-full w-full items-center justify-center">
            <img
              className="product-lightbox-modal-image max-h-[96vh] max-w-[96vw] cursor-zoom-out object-contain"
              src={imageUrl}
              alt={alt}
              onClick={() => setIsZoomOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
