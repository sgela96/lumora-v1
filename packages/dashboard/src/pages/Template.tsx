import {
  blocksFromTemplate,
  cleanupMarkdown,
  collapseTitle,
  DEFAULT_DESCRIPTION_TEMPLATE,
  DEFAULT_TITLE_TEMPLATE,
  fillTemplate,
  newBlockId,
  PIECE_GROUPS,
  sampleTemplateVars,
  templateFromBlocks,
  templatePieces,
  toHtml,
  type FieldType,
  type PieceGroup,
  type TemplateBlock,
  type TemplateField,
  type TemplatePiece,
} from '@lumora/shared';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement } from 'react';
import type { Project } from '../api';
import { Icons, LogoTile } from '../components/icons';
import { Card, SaveBar, SectionIntro, Segmented, TierBadge, UpgradeBadge, useToast } from '../components/ui';
import { useApp, useFeatureLock, useSettingsDraft } from '../state';

const TYPES: { id: FieldType; label: string }[] = [
  { id: 'text', label: 'Short text' },
  { id: 'textarea', label: 'Long text' },
  { id: 'select', label: 'Choice' },
  { id: 'email', label: 'E-mail' },
  { id: 'checkbox', label: 'Checkbox' },
];

const PRESET_ES: TemplateField[] = [
  { id: 'category', label: 'Tipo', type: 'select', required: true, options: ['Error', 'Consulta', 'Idea'] },
  { id: 'description', label: '¿Qué pasó?', type: 'textarea', required: true, placeholder: 'Contanos qué esperabas y qué pasó en su lugar' },
];

const GROUP_ICON: Record<PieceGroup, (p: { size?: number }) => ReactElement> = {
  report: Icons.user,
  technical: Icons.code,
  ai: Icons.sparkle,
  context: Icons.globe,
};

const TITLE_TOKENS = [
  { label: 'Category', token: '{{fields.category}}' },
  { label: 'Summary', token: '{{summary}}' },
  { label: 'Reference', token: '{{reference}}' },
  { label: 'Page', token: '{{page.path}}' },
];

type Look = 'jira' | 'github' | 'zendesk' | 'slack';
const LOOKS: { value: Look; label: string; tool: string; id: string }[] = [
  { value: 'jira', label: 'Jira', tool: 'jira', id: 'SUP-128' },
  { value: 'github', label: 'GitHub', tool: 'github', id: '#318' },
  { value: 'zendesk', label: 'Zendesk', tool: 'zendesk', id: '#4471' },
  { value: 'slack', label: 'Slack', tool: 'slack', id: '#support' },
];

export function TemplatePage({ project }: { project: Project }) {
  const { me, updateProject } = useApp();
  const toast = useToast();
  const locked = useFeatureLock()('customTemplate');
  const { draft, update, dirty, saving, save, reset } = useSettingsDraft(project, updateProject);
  const t = draft.template;

  // The layout is edited as pieces; the stored template is the Markdown they compile to.
  const [blocks, setBlocks] = useState<TemplateBlock[]>(() => blocksFromTemplate(t.descriptionTemplate));
  const [raw, setRaw] = useState(false);
  const [look, setLook] = useState<Look>('jira');
  const lastCompiled = useRef(t.descriptionTemplate);
  useEffect(() => {
    // Draft replaced from outside (reset, reload, restore defaults): rebuild the pieces.
    if (t.descriptionTemplate !== lastCompiled.current) {
      lastCompiled.current = t.descriptionTemplate;
      setBlocks(blocksFromTemplate(t.descriptionTemplate));
    }
  }, [t.descriptionTemplate]);

  const commit = (next: TemplateBlock[]) => {
    setBlocks(next);
    const md = templateFromBlocks(next);
    lastCompiled.current = md;
    update((s) => void (s.template.descriptionTemplate = md));
  };

  const pieces = useMemo(() => templatePieces(t.fields), [t.fields]);
  const pieceOf = (name: string): TemplatePiece | undefined => pieces.find((p) => p.name === name);
  const used = new Set(blocks.flatMap((b) => (b.kind === 'var' ? [b.name] : [])));

  const addPiece = (piece: TemplatePiece, at = blocks.length) => {
    if (used.has(piece.name)) return;
    const next = [...blocks];
    next.splice(at, 0, { id: newBlockId(), kind: 'var', name: piece.name, heading: piece.heading });
    commit(next);
  };
  const addText = (at = blocks.length) => {
    const next = [...blocks];
    next.splice(at, 0, { id: newBlockId(), kind: 'text', text: '## A section\nYour text here.' });
    commit(next);
  };

  // ---- Drag and drop: pieces from the tray, blocks within the layout.
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dragging = useRef<{ type: 'block'; index: number } | { type: 'piece'; name: string } | { type: 'text' } | null>(null);
  const onDragOverBlock = (e: DragEvent, index: number) => {
    if (!dragging.current) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropAt(e.clientY < r.top + r.height / 2 ? index : index + 1);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const d = dragging.current;
    const at = dropAt ?? blocks.length;
    dragging.current = null;
    setDropAt(null);
    if (!d) return;
    if (d.type === 'piece') {
      const piece = pieceOf(d.name);
      if (piece) addPiece(piece, at);
    } else if (d.type === 'text') addText(at);
    else {
      const next = [...blocks];
      const [moved] = next.splice(d.index, 1);
      next.splice(at > d.index ? at - 1 : at, 0, moved);
      commit(next);
    }
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const patch = (i: number, p: Partial<TemplateBlock>) => commit(blocks.map((b, k) => (k === i ? ({ ...b, ...p } as TemplateBlock) : b)));

  // ---- Preview with example data, exactly as the server renders it.
  const vars = useMemo(() => sampleTemplateVars(t.fields), [t.fields]);
  const title = collapseTitle(fillTemplate(t.titleTemplate, vars)) || 'Report SAN-42';
  const html = toHtml(cleanupMarkdown(fillTemplate(t.descriptionTemplate, vars)));
  const lookMeta = LOOKS.find((l) => l.value === look)!;

  const titleInput = useRef<HTMLInputElement>(null);
  const insertToken = (token: string) => {
    const el = titleInput.current;
    const start = el?.selectionStart ?? t.titleTemplate.length;
    const end = el?.selectionEnd ?? start;
    const next = t.titleTemplate.slice(0, start) + token + t.titleTemplate.slice(end);
    update((s) => void (s.template.titleTemplate = next));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const setField = (i: number, p: Partial<TemplateField>) => update((s) => void Object.assign(s.template.fields[i], p));
  const moveField = (i: number, dir: -1 | 1) =>
    update((s) => {
      const f = s.template.fields;
      const j = i + dir;
      if (j < 0 || j >= f.length) return;
      [f[i], f[j]] = [f[j], f[i]];
    });

  const onSave = async () => {
    try {
      await save();
      toast('Template saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };

  return (
    <div className="stack">
      <SectionIntro actions={locked ? <UpgradeBadge plan={locked} /> : <TierBadge plan="pro" />}>
        The form people fill in, and how each ticket reads in your tool. Build it from pieces; the preview shows a real example.
      </SectionIntro>
      {locked && <div className="notice notice-accent">Free uses the default template. Pro lets you build your own: try it below, then upgrade to save it.</div>}

      <div className="tpl-grid">
        <div className="stack" style={{ minWidth: 0 }}>
          <Card title="Title">
            <div className="stack-sm">
              <input ref={titleInput} className="input mono" value={t.titleTemplate} onChange={(e) => update((s) => void (s.template.titleTemplate = e.target.value))} aria-label="Title template" />
              <div className="row" style={{ gap: 6 }}>
                <span className="muted small">Insert</span>
                {TITLE_TOKENS.map((tk) => (
                  <button key={tk.token} type="button" className="token-chip" onClick={() => insertToken(tk.token)}>
                    <Icons.plus size={12} /> {tk.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card
            title="Ticket layout"
            actions={
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRaw(!raw)}>
                  <Icons.code size={14} /> {raw ? 'Use pieces' : 'Edit as Markdown'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    update((s) => {
                      s.template.titleTemplate = DEFAULT_TITLE_TEMPLATE;
                      s.template.descriptionTemplate = DEFAULT_DESCRIPTION_TEMPLATE;
                    })
                  }
                >
                  Restore default
                </button>
              </div>
            }
          >
            {raw ? (
              <div className="stack-sm">
                <textarea className="textarea mono" rows={18} value={t.descriptionTemplate} onChange={(e) => update((s) => void (s.template.descriptionTemplate = e.target.value))} aria-label="Template as Markdown" />
                <p className="hint">Markdown with {'{{variables}}'}. Lumora converts it for Jira, Zendesk, Slack… and drops sections that end up empty.</p>
              </div>
            ) : (
              <div className="stack">
                <div className="tray" aria-label="Pieces you can add">
                  {(Object.keys(PIECE_GROUPS) as PieceGroup[]).map((g) => {
                    const GroupIcon = GROUP_ICON[g];
                    const list = pieces.filter((p) => p.group === g);
                    if (!list.length) return null;
                    return (
                      <div key={g} className="tray-group">
                        <span className="tray-label">
                          <GroupIcon size={13} /> {PIECE_GROUPS[g]}
                        </span>
                        <div className="tray-pieces">
                          {list.map((p) => {
                            const off = used.has(p.name);
                            const needs = p.feature && !me.limits.features[p.feature];
                            return (
                              <button
                                key={p.name}
                                type="button"
                                className={`piece piece-${g}`}
                                disabled={off}
                                draggable={!off}
                                title={off ? 'Already in the ticket' : needs ? `${p.description}. Needs a higher plan to have content.` : p.description}
                                onDragStart={(e) => {
                                  dragging.current = { type: 'piece', name: p.name };
                                  e.dataTransfer.effectAllowed = 'copy';
                                }}
                                onDragEnd={() => {
                                  dragging.current = null;
                                  setDropAt(null);
                                }}
                                onClick={() => addPiece(p)}
                              >
                                {off ? <Icons.check size={12} /> : <Icons.plus size={12} />}
                                {p.label}
                                {needs && <Icons.lock size={11} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="tray-group">
                    <span className="tray-label">
                      <Icons.text size={13} /> Your own words
                    </span>
                    <div className="tray-pieces">
                      <button
                        type="button"
                        className="piece piece-text"
                        draggable
                        onDragStart={() => (dragging.current = { type: 'text' })}
                        onDragEnd={() => {
                          dragging.current = null;
                          setDropAt(null);
                        }}
                        onClick={() => addText()}
                      >
                        <Icons.plus size={12} /> Text block
                      </button>
                    </div>
                  </div>
                </div>

                <ol className="layout" onDragOver={(e) => dragging.current && e.preventDefault()} onDrop={onDrop} onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}>
                  {blocks.length === 0 && <li className="layout-empty">Drag pieces here, or click them above.</li>}
                  {blocks.map((b, i) => {
                    const piece = b.kind === 'var' ? pieceOf(b.name) : undefined;
                    const group: PieceGroup | 'text' = b.kind === 'text' ? 'text' : piece?.group ?? 'context';
                    return (
                      <li
                        key={b.id}
                        className={`block block-${group}${dropAt === i ? ' drop-before' : ''}${dropAt === i + 1 && i === blocks.length - 1 ? ' drop-after' : ''}`}
                        draggable
                        onDragStart={(e) => {
                          dragging.current = { type: 'block', index: i };
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          dragging.current = null;
                          setDropAt(null);
                        }}
                        onDragOver={(e) => onDragOverBlock(e, i)}
                      >
                        <span className="block-grip" aria-hidden>
                          <Icons.grip size={16} />
                        </span>
                        <div className="block-body">
                          {b.kind === 'var' ? (
                            <>
                              <div className="block-head">
                                <span className="block-name">{piece?.label ?? b.name}</span>
                                {piece?.feature && !me.limits.features[piece.feature] && <span className="badge badge-warn">Empty on your plan</span>}
                              </div>
                              <input
                                className="input input-sm"
                                value={b.heading}
                                placeholder="No section title"
                                aria-label={`Section title for ${piece?.label ?? b.name}`}
                                onChange={(e) => patch(i, { heading: e.target.value })}
                              />
                            </>
                          ) : (
                            <>
                              <div className="block-head">
                                <span className="block-name">Text block</span>
                              </div>
                              <textarea className="textarea input-sm" rows={3} value={b.text} aria-label="Text block" onChange={(e) => patch(i, { text: e.target.value })} />
                            </>
                          )}
                        </div>
                        <div className="block-actions">
                          <button type="button" className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                            <Icons.chevronUp size={15} />
                          </button>
                          <button type="button" className="icon-btn sm" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                            <Icons.chevronDown size={15} />
                          </button>
                          <button type="button" className="icon-btn sm danger" aria-label="Remove" onClick={() => commit(blocks.filter((_, k) => k !== i))}>
                            <Icons.x size={15} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </Card>

          <Card
            title="Form fields"
            actions={
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-ghost" type="button" onClick={() => update((s) => void (s.template.fields = structuredClone(PRESET_ES)))}>
                  Spanish preset
                </button>
                <button className="btn btn-sm" type="button" onClick={() => update((s) => void s.template.fields.push({ id: `field${s.template.fields.length + 1}`, label: 'New field', type: 'text', required: false }))}>
                  <Icons.plus size={13} /> Add field
                </button>
              </div>
            }
          >
            <div className="stack-sm">
              <p className="hint">What people fill in when they report. Each field also becomes a piece for the ticket.</p>
              {t.fields.map((f, i) => (
                <div key={i} className="field-row">
                  <div className="field-editor">
                    <input className="input" aria-label="Label" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
                    <select className="select" aria-label="Type" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType, options: e.target.value === 'select' ? f.options ?? ['Option 1'] : undefined })}>
                      {TYPES.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                    <label className="row small" style={{ flexWrap: 'nowrap', gap: 6 }}>
                      <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Required
                    </label>
                    <div className="row" style={{ flexWrap: 'nowrap', gap: 2 }}>
                      <button className="icon-btn sm" type="button" onClick={() => moveField(i, -1)} aria-label="Move up" disabled={i === 0}>
                        <Icons.chevronUp size={15} />
                      </button>
                      <button className="icon-btn sm" type="button" onClick={() => moveField(i, 1)} aria-label="Move down" disabled={i === t.fields.length - 1}>
                        <Icons.chevronDown size={15} />
                      </button>
                      <button className="icon-btn sm danger" type="button" onClick={() => update((s) => void s.template.fields.splice(i, 1))} aria-label="Remove field">
                        <Icons.x size={15} />
                      </button>
                    </div>
                  </div>
                  {(f.type === 'select' || f.type === 'text' || f.type === 'textarea') && (
                    <div className="field-extra">
                      {f.type === 'select' ? (
                        <input
                          className="input input-sm"
                          placeholder="Options, comma separated"
                          value={(f.options ?? []).join(', ')}
                          onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
                          onBlur={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                        />
                      ) : (
                        <input className="input input-sm" placeholder="Placeholder (optional)" value={f.placeholder ?? ''} onChange={(e) => setField(i, { placeholder: e.target.value })} />
                      )}
                      <span className="hint mono" title="Use it in the title as {{fields.id}}">
                        id: {f.id}
                      </span>
                    </div>
                  )}
                </div>
              ))}
              <p className="hint">A choice field with id “category” is used in the default title and can route tickets to different destinations (Business).</p>
            </div>
          </Card>
        </div>

        <div className="tpl-preview">
          <div className="spread" style={{ marginBottom: 10 }}>
            <strong>Live preview</strong>
            <Segmented label="Preview as" value={look} onChange={setLook} options={LOOKS.map((l) => ({ value: l.value, label: l.label }))} />
          </div>
          <div className={`ticket-mock look-${look}`}>
            <div className="mock-bar">
              <LogoTile type={lookMeta.tool} size={20} />
              <span className="mono">{lookMeta.id}</span>
              <span className="mock-status">Open</span>
            </div>
            <h3 className="mock-title">{title}</h3>
            <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Example data. Sections with nothing to show are removed from real tickets.
          </p>
        </div>
      </div>
      {!locked && <SaveBar dirty={dirty} saving={saving} onSave={onSave} onReset={reset} />}
    </div>
  );
}
