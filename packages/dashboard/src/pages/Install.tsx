import type { Project } from '../api';
import { Card, CopyButton, SectionIntro } from '../components/ui';
import { useApp } from '../state';

export function InstallPage({ project }: { project: Project }) {
  const { me } = useApp();
  const base = me.server.publicUrl;
  const snippet = `<script src="${base}/lumora.js" data-key="${project.publicKey}" async></script>`;
  const identify = `<script>
  window.Lumora = window.Lumora || function () { (Lumora.q = Lumora.q || []).push(arguments) };
  // After your user signs in:
  Lumora('identify', { id: user.id, email: user.email, name: user.name, plan: user.plan });
  // Anything that helps support (release, tenant, feature flags…):
  Lumora('metadata', { release: '2.4.1', tenant: 'acme' });
</script>`;
  const api = `Lumora('open');        // open the panel
Lumora('screenshot');  // jump straight to a screenshot
Lumora('record');      // start a screen recording
Lumora('hide');        // hide the nebula (e.g. on checkout)
Lumora('show');`;
  const gtm = `<script>
  (function () {
    var s = document.createElement('script');
    s.src = '${base}/lumora.js';
    s.async = true;
    s.dataset.key = '${project.publicKey}';
    document.head.appendChild(s);
  })();
</script>`;
  const demoUrl = `${base}/demo/?key=${encodeURIComponent(project.publicKey)}`;

  return (
    <div className="stack">
      <SectionIntro
        actions={
          <a className="btn" href={demoUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            Try it on a demo page
          </a>
        }
      >
        Add Lumora to {project.name} in under a minute.
      </SectionIntro>

      <Card title="1 · Paste one line before </body>">
        <div className="stack">
          <div className="code-block">
            {snippet}
            <CopyButton text={snippet} />
          </div>
          <p className="muted small">
            Works with any stack: plain HTML, React, Vue, Angular, WordPress, Shopify, Webflow, Salesforce Experience Cloud (as a head markup script)…
            {project.allowedOrigins.length === 0 && (
              <>
                {' '}
                <strong>Tip:</strong> restrict which domains can use this key in <a href={`#/p/${project.id}/settings/general`}>Settings → App</a>.
              </>
            )}
          </p>
        </div>
      </Card>

      <Card title="2 · Tell Lumora who the user is (optional)">
        <div className="stack">
          <p className="muted">Reports from signed-in users arrive with their id, e-mail and anything else you pass, so nobody has to type it.</p>
          <div className="code-block">
            {identify}
            <CopyButton text={identify} />
          </div>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="JavaScript API">
          <div className="code-block">
            {api}
            <CopyButton text={api} />
          </div>
        </Card>
        <Card title="Google Tag Manager">
          <div className="stack-sm">
            <p className="muted small">Add a “Custom HTML” tag that fires on all pages:</p>
            <div className="code-block">
              {gtm}
              <CopyButton text={gtm} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
