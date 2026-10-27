import { useState, type ReactNode } from 'react';
import type { Project } from '../api';
import { LogoTile } from '../components/icons';
import { Card, CopyButton, SectionIntro, Segmented } from '../components/ui';
import { useApp } from '../state';

type Platform = 'web' | 'gtm' | 'experience' | 'lightning';

function Code({ children }: { children: string }) {
  return (
    <div className="code-block">
      {children}
      <CopyButton text={children} />
    </div>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="install-steps">{children}</ol>;
}

export function InstallPage({ project }: { project: Project }) {
  const { me } = useApp();
  const [platform, setPlatform] = useState<Platform>('web');
  const base = me.server.publicUrl;
  const key = project.publicKey;
  const snippet = `<script src="${base}/lumora.js" data-key="${key}" async></script>`;
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
Lumora('show');
Lumora('error', 'Payment failed');  // tell Lumora something went wrong`;
  const gtm = `<script>
  (function () {
    var s = document.createElement('script');
    s.src = '${base}/lumora.js';
    s.async = true;
    s.dataset.key = '${key}';
    document.head.appendChild(s);
  })();
</script>`;
  const lwcJs = `import { LightningElement, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import NAME from '@salesforce/schema/User.Name';
import EMAIL from '@salesforce/schema/User.Email';
import LUMORA from '@salesforce/resourceUrl/lumora';

export default class LumoraWidget extends LightningElement {
  started = false;

  connectedCallback() {
    if (this.started) return;
    this.started = true;
    window.LumoraConfig = { key: '${key}', api: '${base}' };
    window.Lumora = window.Lumora || function () { (window.Lumora.q = window.Lumora.q || []).push(arguments); };
    loadScript(this, LUMORA);
  }

  // Reports arrive with the Salesforce user who sent them.
  @wire(getRecord, { recordId: USER_ID, fields: [NAME, EMAIL] })
  user({ data }) {
    if (!data) return;
    window.Lumora('identify', {
      id: USER_ID,
      name: getFieldValue(data, NAME),
      email: getFieldValue(data, EMAIL),
    });
  }
}`;
  const lwcHtml = `<template></template>`;
  const lwcMeta = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>62.0</apiVersion>
  <isExposed>true</isExposed>
  <masterLabel>Lumora</masterLabel>
  <targets>
    <target>lightning__UtilityBar</target>
    <target>lightning__AppPage</target>
    <target>lightning__RecordPage</target>
    <target>lightning__HomePage</target>
  </targets>
</LightningComponentBundle>`;
  const demoUrl = `${base}/demo/?key=${encodeURIComponent(key)}`;
  const settingsLink = <a href={`#/p/${project.id}/settings/general`}>Settings → App</a>;

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

      <Card title="1 · Add Lumora to your app">
        <div className="stack">
          <div className="install-tabs">
            <Segmented
              label="Where your app runs"
              value={platform}
              onChange={setPlatform}
              options={[
                { value: 'web', label: 'Any website' },
                { value: 'gtm', label: 'Google Tag Manager' },
                { value: 'experience', label: <><LogoTile type="salesforce" /> Experience Cloud</> },
                { value: 'lightning', label: <><LogoTile type="salesforce" /> Lightning Experience</> },
              ]}
            />
          </div>

          {platform === 'web' && (
            <>
              <p className="muted">Paste one line before <code>&lt;/body&gt;</code>. Works with any stack: plain HTML, React, Vue, Angular, WordPress, Shopify, Webflow…</p>
              <Code>{snippet}</Code>
            </>
          )}

          {platform === 'gtm' && (
            <>
              <p className="muted">Add a “Custom HTML” tag that fires on all pages:</p>
              <Code>{gtm}</Code>
            </>
          )}

          {platform === 'experience' && (
            <>
              <p className="muted">For customer and partner portals built with Experience Builder (Aura and LWR sites).</p>
              <Steps>
                <li>
                  In Experience Builder, open <strong>Settings → Security &amp; Privacy</strong> and add <code>{base}</code> as a trusted site for scripts (on Aura sites, also allow it under
                  Content Security Policy).
                </li>
                <li>
                  Open <strong>Settings → Advanced → Edit Head Markup</strong> and paste:
                  <Code>{snippet}</Code>
                </li>
                <li>
                  Add your site’s domain (for example <code>https://yourcompany.my.site.com</code>) to the allowed domains in {settingsLink}, then <strong>Publish</strong>.
                </li>
              </Steps>
            </>
          )}

          {platform === 'lightning' && (
            <>
              <p className="muted">For your team inside Salesforce. A small Lightning Web Component loads Lumora in the background of any Lightning app.</p>
              <Steps>
                <li>
                  Download{' '}
                  <a href={`${base}/lumora.js`} download="lumora.js">
                    lumora.js
                  </a>{' '}
                  and upload it in <strong>Setup → Static Resources</strong> with the name <code>lumora</code> (Cache Control: Public).
                </li>
                <li>
                  In <strong>Setup → Trusted URLs</strong>, add <code>{base}</code> with the <em>connect-src</em> and <em>img-src</em> directives.
                </li>
                <li>
                  Create a Lightning Web Component called <code>lumoraWidget</code> with these three files and deploy it (Salesforce CLI or VS Code):
                  <div className="install-files">
                    <span className="label mono">lumoraWidget.js</span>
                    <Code>{lwcJs}</Code>
                    <span className="label mono">lumoraWidget.html</span>
                    <Code>{lwcHtml}</Code>
                    <span className="label mono">lumoraWidget.js-meta.xml</span>
                    <Code>{lwcMeta}</Code>
                  </div>
                </li>
                <li>
                  In <strong>Setup → App Manager</strong>, edit your app, go to <strong>Utility Items</strong>, add <strong>Lumora</strong> and tick <em>Start automatically</em>. The
                  utility item can stay closed: the nebula appears over the app.
                </li>
                <li>
                  Add <code>https://yourcompany.lightning.force.com</code> to the allowed domains in {settingsLink}.
                </li>
              </Steps>
            </>
          )}

          {(platform === 'experience' || platform === 'lightning') && (
            <div className="notice">
              On Salesforce, reports include the object, record and page the person was on, and Lightning error toasts (and the “Sorry to interrupt” dialog) count as something
              going wrong, so the nebula can offer help right when it happens. Turn that on in <a href={`#/p/${project.id}/settings/widget`}>Settings → Widget</a>.
            </div>
          )}

          {project.allowedOrigins.length === 0 && platform !== 'experience' && platform !== 'lightning' && (
            <p className="muted small">
              <strong>Tip:</strong> restrict which domains can use this key in {settingsLink}.
            </p>
          )}
        </div>
      </Card>

      <Card title="2 · Tell Lumora who the user is (optional)">
        <div className="stack">
          <p className="muted">
            Reports from signed-in users arrive with their id, e-mail and anything else you pass, so nobody has to type it.
            {platform === 'lightning' && ' The Lightning component above already does this with the Salesforce user.'}
          </p>
          <Code>{identify}</Code>
        </div>
      </Card>

      <Card title="JavaScript API">
        <Code>{api}</Code>
      </Card>
    </div>
  );
}
