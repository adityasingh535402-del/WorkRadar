import { useEffect, useState } from 'react';
import type { AiMode, FactorKey, Source } from '../lib/types';
import { DEFAULT_WEIGHTS, FACTOR_LABELS } from '../lib/scoring';
import { rankedOpen, resetDemo, setDemo, toast, updateSettings, useStore } from '../lib/store';
import { generateBrief, testWebhook } from '../lib/ai';
import { type Route } from '../lib/router';
import { ago } from '../lib/time';
import { ScoreBadge, SOURCE_META, SourceGlyph } from '../components/bits';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/Layout';

const MODES: { id: AiMode; label: string; text: string }[] = [
  { id: 'auto', label: 'Automatic', text: 'Use n8n if a webhook is set, then the hosted Gemini route, then the on-device summary. The brief never comes up empty.' },
  { id: 'n8n', label: 'n8n only', text: 'Always use your n8n workflow. Shows an error if n8n isn’t reachable, which is useful when testing the workflow.' },
  { id: 'local', label: 'On-device', text: 'Rule-based summary computed in the browser. No data leaves the page.' },
];

export function Settings({ route }: { route: Route }) {
  const state = useStore((s) => s);
  const { settings } = state;
  const [digestUrl, setDigestUrl] = useState(settings.n8nDigestUrl);
  const [actionUrl, setActionUrl] = useState(settings.n8nActionUrl);
  const [test, setTest] = useState<{ status: 'idle' | 'running' | 'ok' | 'fail'; text?: string }>({ status: 'idle' });
  const top = rankedOpen(state).slice(0, 5);

  useEffect(() => {
    const section = route.query.get('section');
    if (section) document.getElementById(section)?.scrollIntoView({ block: 'start' });
  }, [route.query]);

  const saveUrls = () => {
    updateSettings({ n8nDigestUrl: digestUrl.trim(), n8nActionUrl: actionUrl.trim() });
    toast({ text: 'n8n settings saved' });
    generateBrief({ force: true });
  };

  const runTest = async () => {
    if (!digestUrl.trim()) return;
    setTest({ status: 'running' });
    try {
      const r = await testWebhook(digestUrl.trim());
      setTest(r.ok ? { status: 'ok', text: `Connected. The workflow answered in ${(r.ms / 1000).toFixed(1)} s${r.model ? ` using ${r.model}` : ''}.` } : { status: 'fail', text: 'n8n answered, but the response wasn’t a WorkRadar brief. Check the “Respond to Webhook” node.' });
    } catch (e) {
      setTest({ status: 'fail', text: `Couldn’t reach the webhook: ${(e as Error).message} Check that n8n is running, the workflow is active, and the URL is the Production URL.` });
    }
  };

  const keys = Object.keys(DEFAULT_WEIGHTS) as FactorKey[];
  const sources: Source[] = ['slack', 'jira', 'github', 'email'];

  return (
    <div className="page page-settings">
      <PageHeader title="Settings" sub="Choose how the AI brief is generated, tune the ranking, and preview states." />

      <section className="panel settings-section" id="ai" aria-labelledby="ai-title">
        <h2 id="ai-title">AI brief</h2>
        <div className="radio-cards" role="radiogroup" aria-label="AI engine">
          {MODES.map((m) => (
            <label key={m.id} className={`radio-card${settings.aiMode === m.id ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="mode"
                value={m.id}
                checked={settings.aiMode === m.id}
                onChange={() => {
                  updateSettings({ aiMode: m.id });
                  generateBrief({ force: true });
                }}
              />
              <span className="radio-title">{m.label}</span>
              <span className="radio-text">{m.text}</span>
            </label>
          ))}
        </div>

        <div className="field">
          <label htmlFor="digest">n8n digest webhook</label>
          <p className="field-help">The Production URL of the “WorkRadar · Daily digest” workflow, for example https://your-tunnel.trycloudflare.com/webhook/workradar/digest</p>
          <div className="field-row">
            <input id="digest" type="url" value={digestUrl} onChange={(e) => setDigestUrl(e.target.value)} placeholder="https://…/webhook/workradar/digest" spellCheck={false} />
            <button className="btn" onClick={runTest} disabled={!digestUrl.trim() || test.status === 'running'}>
              {test.status === 'running' ? 'Testing…' : 'Test'}
            </button>
          </div>
          {test.text && (
            <p className={`field-result ${test.status === 'ok' ? 'is-ok' : 'is-fail'}`} role="status">
              <Icon name={test.status === 'ok' ? 'check-circle' : 'alert'} size={15} />
              {test.text}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="actions">n8n actions webhook</label>
          <p className="field-help">Optional. Assign, Mark done and Snooze are sent here so n8n can update Jira, GitHub or Slack.</p>
          <input id="actions" type="url" value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="https://…/webhook/workradar/action" spellCheck={false} />
        </div>
        <div className="field-actions">
          <button className="btn btn-primary" onClick={saveUrls}>
            Save n8n settings
          </button>
        </div>
      </section>

      <section className="panel settings-section" id="weights" aria-labelledby="w-title">
        <h2 id="w-title">Ranking</h2>
        <p className="field-help">Each item gets a score from these signals. Change the weights and watch the top five re-rank.</p>
        <div className="weights">
          <div className="sliders">
            {keys.map((k) => (
              <label key={k} className="slider">
                <span className="slider-head">
                  <span>{FACTOR_LABELS[k].label}</span>
                  <span className="slider-value">{settings.weights[k]}</span>
                </span>
                <input type="range" min={0} max={40} step={1} value={settings.weights[k]} onChange={(e) => updateSettings({ weights: { ...settings.weights, [k]: Number(e.target.value) } })} aria-describedby={`help-${k}`} />
                <span className="field-help" id={`help-${k}`}>
                  {FACTOR_LABELS[k].help}
                </span>
              </label>
            ))}
            <button className="btn btn-quiet btn-sm" onClick={() => updateSettings({ weights: { ...DEFAULT_WEIGHTS } })}>
              <Icon name="undo" size={14} />
              Reset to defaults
            </button>
          </div>
          <div className="preview">
            <h3 className="sub-h">Top five with these weights</h3>
            <ol className="preview-list">
              {top.map((s) => (
                <li key={s.item.id}>
                  <ScoreBadge s={s} size="sm" />
                  <span className="preview-ref">{s.item.ref}</span>
                  <span className="preview-title">{s.item.title}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="panel settings-section" id="sources" aria-labelledby="src-title">
        <h2 id="src-title">Sources</h2>
        <p className="field-help">This demo uses mock data shaped like each tool’s API. In production, n8n’s ingestion workflow pulls these on a schedule.</p>
        <ul className="source-settings">
          {sources.map((s) => {
            const down = settings.outage === s;
            return (
              <li key={s}>
                <SourceGlyph source={s} size={16} />
                <span className="source-settings-name">
                  <strong>{SOURCE_META[s].app}</strong>
                  <span className="muted">{down ? 'Not responding (simulated)' : `Connected with demo data, synced ${ago(new Date(state.lastSync[s]).toISOString(), state.now)}`}</span>
                </span>
                <button className={`btn btn-sm${down ? ' btn-primary' : ''}`} onClick={() => updateSettings({ outage: down ? null : s })}>
                  {down ? 'Restore' : 'Simulate outage'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel settings-section" id="appearance" aria-labelledby="ap-title">
        <h2 id="ap-title">Appearance</h2>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={settings.theme === t} className={`seg${settings.theme === t ? ' is-on' : ''}`} onClick={() => updateSettings({ theme: t })}>
              <Icon name={t === 'system' ? 'monitor' : t === 'light' ? 'sun' : 'moon'} size={15} />
              {t === 'system' ? 'Match system' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </section>

      <section className="panel settings-section" id="demo" aria-labelledby="demo-title">
        <h2 id="demo-title">Demo controls</h2>
        <div className="demo-actions">
          <div>
            <p>
              <strong>First-run empty state</strong>
            </p>
            <p className="field-help">See WorkRadar before any source is connected.</p>
            <button className="btn btn-sm" onClick={() => setDemo(state.demo === 'empty' ? 'live' : 'empty')}>
              {state.demo === 'empty' ? 'Load demo workspace' : 'Show empty workspace'}
            </button>
          </div>
          <div>
            <p>
              <strong>Reset demo data</strong>
            </p>
            <p className="field-help">Undo every assign, done and snooze, and restore all sources.</p>
            <button className="btn btn-sm" onClick={resetDemo}>
              Reset
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
