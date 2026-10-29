/** Existing portrait-and-speech example; no generation starts from this showcase. */
import { ShowcaseFilm } from '../../shared/ShowcaseFilm';
import { featuredByKey, featuredRecreateHref, placeOfRoute } from '../../../../server/src/shared/featured';
import { videoWorkflowHref } from '../../../../server/src/shared/videoWorkflows';
import { ChapterText } from './ExploreShowcase';
import { AvatarAudioScene } from './AvatarAudioScene';
import './explorePresenter.css';

export function XpPresenter() {
  const f = featuredByKey('presenter-talk');
  if (!f?.before || !f.input.speechUrl) return null;
  const href = featuredRecreateHref(f.key);
  if (!href) return null;
  return <section className="xv-sec xps xpa" id="xp-presenter" data-testid="xp-presenter" aria-labelledby="xp-h-presenter">
    <ChapterText id="presenter" title={['Give a character', 'a voice.']}
      line="A portrait and a speech clip become a talking video. Your character, with something to say."
      steps={[
        { n: 1, name: 'Portrait', line: 'Start with a character or a face' },
        { n: 2, name: 'Voice', line: 'Add the speech you want them to say' },
        { n: 3, name: 'Talking avatar', line: `${f.model} · ${placeOfRoute(f.route)}` },
      ]}
      cta={{ label: 'Make it talk', href: `${videoWorkflowHref('lip-sync')}&model=${encodeURIComponent(f.modelKey)}` }}
      rec={href} recLabel="Recreate this one" />
    <figure className="xpa-result">
      <AvatarAudioScene portrait={f.before.url} speech={String(f.input.speechUrl)}>{manual => <ShowcaseFilm className="xpa-film" testId="xp-presenter-film" label={`Talking avatar · ${f.model}`}
        takes={[{ key: 'result', url: f.out.url, poster: f.out.poster, label: 'Talking avatar', sec: f.out.sec, sound: f.out.sound === true }]}
        take="result" onTake={() => 0} controls hoverSound restartOnSound manual={manual} />}</AvatarAudioScene>
      <figcaption><span>{f.model}</span><span>{placeOfRoute(f.route)} · {f.out.sec} s</span></figcaption>
      <div className="xpa-input"><img src={f.before.url} alt="The presenter portrait used to make this clip" loading="lazy" decoding="async" /><span>Portrait input · speech included</span></div>
    </figure>
  </section>;
}
