import { ReactNode } from 'react';
/** #12 Explore sections: horizontal effects row and a public project gallery. */
export function Row({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="xrow"><header><h2>{title}</h2>{action}</header><div className="xrow-track">{children}</div></section>;
}
export function Gallery({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return <section className="xgal"><header><h2>{title}</h2>{sub && <p>{sub}</p>}</header><div className="masonry">{children}</div></section>;
}
