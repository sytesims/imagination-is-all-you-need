/**
 * Open city minimap (2026-10-26): the whole map from above (districts in colour, streets, the sea, the pier, the park's pond, landmarks),
 * where you are (camera dot and the way it looks; the person when you play them), the chosen take's camera path, buttons that teleport you
 * to each district, the graphics quality (Low / Medium / High / Ultra, previz/quality.ts), and the Crowd: Off / Some / Busy setting (people on the pavements, 2026-10-27). Takes the place of the small path map (FlyUi.PathMap) in the open city's presets.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { openCityWorld } from '../../../../../server/src/shared/world/openCity';
import { cameraPath as samplePath, chosenTake, type CameraPose, type PlanShot, type Vec3 } from '../../../../../server/src/shared/previzTemplates';
import { tip } from '../../Tooltip';
import { cityCrowd, setCityCrowd, onCityCrowd, type CrowdLevel } from './assemble';
import { QUALITIES, QUALITY_LABEL, QUALITY_HINT, previzQuality, setPrevizQuality, onPrevizQuality, type Quality } from '../quality';
import './cityMap.css';

const CROWD_OPTS: { id: CrowdLevel; label: string; tip: string }[] = [{ id: 'off', label: 'Off', tip: 'No people on the pavements' }, { id: 'some', label: 'Some', tip: 'A few people walking the pavements' }, { id: 'busy', label: 'Busy', tip: 'Busy pavements, with families and dogs' }];
const SIZE = 168; const HALF = 420; const P = (x: number) => ((x + HALF) / (2 * HALF)) * SIZE;

/** the map's still part, drawn once */
const Base = memo(function Base() {
  const spec = openCityWorld().spec; const T = spec.tile; const s = (T / (2 * HALF)) * SIZE;
  const roads = useMemo(() => spec.pieces.filter((p) => p.k.startsWith('kk.road')).map((p) => `M${(P(p.x) - s / 2).toFixed(1)} ${(P(p.z) - s / 2).toFixed(1)}h${s.toFixed(2)}v${s.toFixed(2)}h${(-s).toFixed(2)}z`).join(''), [spec, s]);
  const tall = useMemo(() => spec.pieces.filter((p) => p.k.startsWith('kc.building-sky')).map((p) => `M${(P(p.x) - 1.3).toFixed(1)} ${(P(p.z) - 1.3).toFixed(1)}h2.6v2.6h-2.6z`).join(''), [spec]);
  const shore = P(spec.terrain.shoreZ);
  return <g>
    <rect x={0} y={0} width={SIZE} height={SIZE} className="cm-land" />
    {spec.districts.map((d) => d.rects.map(([x0, x1, z0, z1], i) => <rect key={`${d.id}${i}`} x={P(x0)} y={P(z0)} width={P(x1) - P(x0)} height={P(z1) - P(z0)} fill={d.colour} className="cm-dist" />))}
    <rect x={0} y={shore} width={SIZE} height={SIZE - shore} className="cm-sea" />
    {spec.surfaces.map((sf) => <rect key={sf.id} x={P(sf.rect[0])} y={P(sf.rect[2])} width={Math.max(1.2, P(sf.rect[1]) - P(sf.rect[0]))} height={P(sf.rect[3]) - P(sf.rect[2])} className="cm-pier" />)}
    {spec.ponds.map(([x, z, r]) => <circle key={`${x},${z}`} cx={P(x)} cy={P(z)} r={(r / (2 * HALF)) * SIZE} className="cm-sea" />)}
    <path d={roads} className="cm-road" /><path d={tall} className="cm-tall" />
    {spec.landmarks.map((l) => <circle key={l.id} cx={P(l.pos[0])} cy={P(l.pos[1])} r={1.8} className="cm-mark" />)}
  </g>;
});

/** a placed thing on a map (Add props): where it stands, selected, or the ghost you are placing (ok = it can go there) */
export interface MapMark { x: number; z: number; on?: boolean; ghost?: boolean; ok?: boolean }
export function CityMap({ shot, live, liveActor, onTeleport, marks }: { shot: PlanShot; live: CameraPose | null; liveActor: Vec3 | null; onTeleport: (district: string) => void; marks?: MapMark[] }) {
  const spec = openCityWorld().spec; const [q, setQ] = useState<Quality>(previzQuality()); useEffect(() => onPrevizQuality(setQ), []); const nextQ = QUALITIES[(QUALITIES.indexOf(q) + 1) % QUALITIES.length];
  const [crowd, setCrowd] = useState<CrowdLevel>(cityCrowd()); useEffect(() => onCityCrowd(setCrowd), []);
  const take = chosenTake(shot); const path = useMemo(() => samplePath(shot, 60), [shot]);
  const cam = live?.pos ?? path[0]; const yaw = live?.yaw ?? null;
  const d = path.map((p, i) => `${i ? 'L' : 'M'}${P(p[0]).toFixed(1)} ${P(p[2]).toFixed(1)}`).join('');
  const here = spec.districts.find((x) => cam && x.rects.some(([x0, x1, z0, z1]) => cam[0] >= x0 && cam[0] <= x1 && cam[2] >= z0 && cam[2] <= z1));
  return <div className="cm" data-nofly="" data-testid="city-map">
    <div className="cm-head"><b>{here?.name ?? 'Open city'}</b>
      <button type="button" className={`cm-q${q === 'low' ? ' on' : ''}`} onClick={() => setPrevizQuality(nextQ)} data-testid="city-quality"
        {...tip(`Graphics: ${QUALITY_LABEL[q]}. ${QUALITY_HINT[q]} Click for ${QUALITY_LABEL[nextQ]}.`)}>{QUALITY_LABEL[q]}</button></div>
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="cm-svg" role="img" aria-label="Map of the open city">
      <Base />
      {(take || !live) && <path d={d} className="cm-path" />}
      {marks?.map((m, i) => <circle key={i} cx={P(m.x)} cy={P(m.z)} r={m.on || m.ghost ? 2.6 : 1.7} className={`cm-mark-prop${m.on ? ' on' : ''}${m.ghost ? (m.ok === false ? ' ghost bad' : ' ghost') : ''}`} data-testid={m.ghost ? 'city-map-ghost' : 'city-map-prop'} />)}
      {liveActor && <circle cx={P(liveActor[0])} cy={P(liveActor[2])} r={3.2} className="cm-actor" data-testid="city-map-actor" />}
      {cam && <g transform={`translate(${P(cam[0]).toFixed(1)} ${P(cam[2]).toFixed(1)})`} data-testid="city-map-cam">
        {yaw != null && <path d="M0 0 L-6 -13 L6 -13 Z" className="cm-cone" transform={`rotate(${(-yaw * 180) / Math.PI})`} />}<circle r={3.4} className="cm-cam" /></g>}
    </svg>
    <div className="cm-crowd" role="radiogroup" aria-label="Crowd" data-testid="city-crowd"><span>Crowd</span>
      {CROWD_OPTS.map((o) => <button key={o.id} type="button" role="radio" aria-checked={crowd === o.id} className={crowd === o.id ? 'on' : ''} onClick={() => setCityCrowd(o.id)} data-testid={`city-crowd-${o.id}`} {...tip(o.tip)}>{o.label}</button>)}</div>
    <div className="cm-go" role="group" aria-label="Teleport to a district">{spec.districts.map((x) => <button key={x.id} type="button" onClick={() => onTeleport(x.id)} data-testid={`city-go-${x.id}`} className={here?.id === x.id ? 'on' : ''}
      {...tip(`Teleport to ${x.name}`)}><i style={{ background: x.colour }} />{x.name}</button>)}</div>
  </div>;
}
