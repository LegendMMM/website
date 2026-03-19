export function ProductImage(props: { imageUrl: string | null; alt: string }): JSX.Element {
  const { imageUrl, alt } = props;
  if (!imageUrl) {
    return <div className="h-36 w-full rounded-xl bg-slate-100" aria-label="no-image" />;
  }
  return <img className="h-36 w-full rounded-xl object-cover" src={imageUrl} alt={alt} loading="lazy" />;
}
