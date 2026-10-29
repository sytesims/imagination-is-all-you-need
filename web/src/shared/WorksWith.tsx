/**
 * "Opens in …" (2026-10-28): one tiny, quiet line next to a download that names the apps the file really opens in today. The one shared line for
 * every download that has one (Image to layers' PSD, the 3D viewer's GLB, the Brands Export menu). Only list apps we know open the file.
 */
import './worksWith.css';

export function WorksWith({ children, testId, className = '' }: { children: React.ReactNode; testId?: string; className?: string }) {
  return <p className={`works-with ${className}`.trim()} data-testid={testId}>{children}</p>;
}
