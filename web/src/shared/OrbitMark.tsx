/** The Orbit mark in one colour (brand/logo-mark-mono.svg geometry, currentColor): for quiet places like empty states. */
export function OrbitMark({ size = 48, className = '', title }: { size?: number; className?: string; title?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
    {title && <title>{title}</title>}
    <g fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round"><path d="M32.89 11.3A15.5 15.5 0 0 1 38.05 30.55" /><path d="M30.55 38.05A15.5 15.5 0 0 1 11.3 32.89" /><path d="M8.56 22.65A15.5 15.5 0 0 1 22.65 8.56" /></g>
    <circle cx="24" cy="24" r="6" fill="currentColor" />
  </svg>;
}
