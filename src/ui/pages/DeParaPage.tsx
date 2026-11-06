import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { categorize, compileBuiltinRules, compileRules } from '../../categorization/categorizer';
import { normalizeText } from '../../categorization/normalize';
import { GROUP_LABELS, GROUP_ORDER } from '../../domain/categories';
import { formatBRL } from '../../domain/money';
import type { RuleMatch, SpendGroup, UserRule } from '../../domain/types';
import {
  MATCH_LABELS,
  mappingsToCSV,
  parseMappingsCSV,
  pendingMerchants,
} from '../../services/mappings';
import { useAppStore, type MappingInput } from '../../store/appStore';
import { saveFile } from '../../utils/saveFile';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategorySelect } from '../components/CategorySelect';
import { ConfirmButton } from '../components/ConfirmButton';
import { MappingRow } from '../components/MappingRow';
import { emptyDraft, type MappingDraft } from '../mappingDraft';
import { useCategories } from '../useDashboard';
import { useUiStore } from '../uiStore';

const PENDING_PAGE = 25;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Estabelecimentos que caíram em "Outros": mapear e aplicar nas próximas faturas. */
function PendingPanel() {
  const transactions = useAppStore((s) => s.transactions);
  const saveMappings = useAppStore((s) => s.saveMappings);
  const { list: categories } = useCategories();
  const toast = useUiStore((s) => s.toast);
  const pending = useMemo(() => pendingMerchants(transactions), [transactions]);
  const [drafts, setDrafts] = useState<Record<string, MappingDraft>>({});
  const [limit, setLimit] = useState(PENDING_PAGE);

  const valueOf = (key: string) => {
    const p = pending.find((x) => x.key === key);
    return drafts[key] ?? (p ? emptyDraft(p) : { pattern: key, categoryId: '', displayName: '' });
  };
  const ready = pending.filter((p) => valueOf(p.key).categoryId && valueOf(p.key).pattern.trim());

  const save = (keys: string[]) => {
    const entries: MappingInput[] = keys.map((k) => {
      const v = valueOf(k);
      return {
        pattern: v.pattern,
        match: 'contem',
        categoryId: v.categoryId,
        displayName: v.displayName,
      };
    });
    const { saved, affected } = saveMappings(entries);
    setDrafts((d) => {
      const next = { ...d };
      for (const k of keys) delete next[k];
      return next;
    });
    toast(
      {
        message: `${plural(saved, 'mapeamento salvo', 'mapeamentos salvos')}: ${plural(affected, 'lançamento reconhecido', 'lançamentos reconhecidos')}. Vale também para as próximas faturas.`,
      },
      5000,
    );
  };

  const total = pending.reduce((a, p) => a + p.totalCents, 0);

  return (
    <section className="panel" aria-labelledby="pendentes-titulo">
      <div className="panel__head">
        <div>
          <h2 id="pendentes-titulo">
            Não reconhecidos{' '}
            {pending.length > 0 && <span className="count-badge">{pending.length}</span>}
          </h2>
          <p>
            {pending.length > 0
              ? `${plural(pending.length, 'estabelecimento', 'estabelecimentos')} em "Outros", somando ${formatBRL(total)}`
              : 'Tudo reconhecido por enquanto'}
          </p>
        </div>
        {ready.length > 1 && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => save(ready.map((p) => p.key))}
          >
            Salvar os {ready.length} preenchidos
          </button>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="muted">
          Nenhum lançamento sem categoria. Quando uma fatura nova trouxer um estabelecimento
          desconhecido, ele aparece aqui para você mapear.
        </p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 4 }}>
            Ajuste o texto se quiser algo mais amplo (ex.: só o nome da loja, sem a cidade). Ao
            salvar, os lançamentos atuais são recategorizados e as próximas faturas já chegam
            classificadas.
          </p>
          <ul className="plain maplist">
            {pending.slice(0, limit).map((p) => (
              <MappingRow
                key={p.key}
                idPrefix="pendente"
                pending={p}
                value={valueOf(p.key)}
                categories={categories}
                pool={transactions}
                onChange={(v) => setDrafts((d) => ({ ...d, [p.key]: v }))}
                onSave={() => save([p.key])}
              />
            ))}
          </ul>
          {pending.length > limit && (
            <button
              type="button"
              className="link-btn"
              style={{ marginTop: 12 }}
              onClick={() => setLimit((l) => l + PENDING_PAGE)}
            >
              Mostrar mais {Math.min(PENDING_PAGE, pending.length - limit)} de{' '}
              {pending.length - limit}
            </button>
          )}
        </>
      )}
    </section>
  );
}

interface EditState {
  pattern: string;
  match: RuleMatch;
  categoryId: string;
  displayName: string;
}

function isValid(e: EditState): boolean {
  if (!e.pattern.trim() || !e.categoryId) return false;
  if (e.match !== 'regex') return true;
  try {
    new RegExp(e.pattern);
    return true;
  } catch {
    return false;
  }
}

function MappingEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  idPrefix,
}: {
  value: EditState;
  onChange: (v: EditState) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  idPrefix: string;
}) {
  const { list: categories } = useCategories();
  const regexInvalid =
    value.match === 'regex' &&
    value.pattern.trim() !== '' &&
    !isValid({ ...value, categoryId: 'x' });
  return (
    <form
      className="toolbar"
      onSubmit={(e) => {
        e.preventDefault();
        if (isValid(value)) onSubmit();
      }}
    >
      <label className="field field--wide">
        <span>De (texto na fatura)</span>
        <input
          id={`${idPrefix}-de`}
          className="input"
          value={value.pattern}
          placeholder="ex.: PADARIA REALE"
          aria-invalid={regexInvalid}
          onChange={(e) => onChange({ ...value, pattern: e.target.value })}
        />
      </label>
      <label className="field" style={{ flex: '1 1 130px' }}>
        <span>Tipo</span>
        <select
          id={`${idPrefix}-tipo`}
          className="select"
          value={value.match}
          onChange={(e) => onChange({ ...value, match: e.target.value as RuleMatch })}
        >
          {(Object.keys(MATCH_LABELS) as RuleMatch[]).map((m) => (
            <option key={m} value={m}>
              {MATCH_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Para a categoria</span>
        <CategorySelect
          id={`${idPrefix}-para`}
          label="Categoria do mapeamento"
          value={value.categoryId}
          categories={categories.filter((c) => c.id !== 'outros')}
          placeholder="Escolha…"
          onChange={(categoryId) => onChange({ ...value, categoryId })}
        />
      </label>
      <label className="field">
        <span>Nome (opcional)</span>
        <input
          id={`${idPrefix}-nome`}
          className="input"
          maxLength={60}
          value={value.displayName}
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
        />
      </label>
      <div className="row-actions">
        <button type="submit" className="btn btn--primary" disabled={!isValid(value)}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      {regexInvalid && (
        <p style={{ color: 'var(--bad)', fontSize: 'var(--text-xs)', flexBasis: '100%' }}>
          Expressão regular inválida.
        </p>
      )}
    </form>
  );
}

const EMPTY_EDIT: EditState = { pattern: '', match: 'contem', categoryId: '', displayName: '' };

function toEdit(r: UserRule): EditState {
  return {
    pattern: r.pattern,
    match: r.match,
    categoryId: r.categoryId,
    displayName: r.displayName ?? '',
  };
}

function SavedMappings() {
  const rules = useAppStore((s) => s.rules);
  const transactions = useAppStore((s) => s.transactions);
  const saveMappings = useAppStore((s) => s.saveMappings);
  const deleteRule = useAppStore((s) => s.deleteRule);
  const { index } = useCategories();
  const toast = useUiStore((s) => s.toast);
  const [creating, setCreating] = useState<EditState>(EMPTY_EDIT);
  const [editing, setEditing] = useState<{ id: string; value: EditState } | null>(null);
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) if (t.ruleId) m.set(t.ruleId, (m.get(t.ruleId) ?? 0) + 1);
    return m;
  }, [transactions]);

  const q = normalizeText(query);
  const visible = [...rules]
    .reverse()
    .filter(
      (r) =>
        !q ||
        normalizeText(
          `${r.pattern} ${r.displayName ?? ''} ${index.get(r.categoryId)?.name ?? ''}`,
        ).includes(q),
    );

  const submit = (entry: MappingInput, verb: string) => {
    const { affected } = saveMappings([entry]);
    toast(
      {
        message: `${verb}: ${plural(affected, 'lançamento reconhecido', 'lançamentos reconhecidos')}.`,
      },
      4000,
    );
  };

  const exportCSV = async () => {
    const outcome = await saveFile(
      'de-para-raio-x-fatura.csv',
      mappingsToCSV(rules, index),
      'text/csv;charset=utf-8',
    );
    if (outcome === 'indisponivel')
      toast({ message: 'Este ambiente não permite baixar arquivos.', tone: 'erro' });
  };

  const importCSV = async (file: File | undefined) => {
    if (!file) return;
    const { entries, errors } = parseMappingsCSV(await file.text(), index);
    if (entries.length === 0) {
      toast(
        { message: errors[0] ?? 'Nenhum mapeamento encontrado no arquivo.', tone: 'erro' },
        6000,
      );
      return;
    }
    const { saved, affected } = saveMappings(entries);
    toast(
      {
        message: `${plural(saved, 'mapeamento importado', 'mapeamentos importados')} (${plural(affected, 'lançamento', 'lançamentos')})${errors.length ? `; ${plural(errors.length, 'linha ignorada', 'linhas ignoradas')}` : ''}.`,
      },
      6000,
    );
  };

  return (
    <section className="panel" aria-labelledby="mapeamentos-titulo">
      <div className="panel__head">
        <div>
          <h2 id="mapeamentos-titulo">Seus mapeamentos</h2>
          <p>
            {plural(rules.length, 'mapeamento', 'mapeamentos')} · têm prioridade sobre a base
            embutida e valem para todas as faturas
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => void exportCSV()}
            disabled={rules.length === 0}
          >
            <Download size={14} aria-hidden="true" /> Exportar CSV
          </button>
          <label className="btn btn--sm">
            <Upload size={14} aria-hidden="true" /> Importar CSV
            <input
              id="importar-de-para"
              type="file"
              accept=".csv,text/csv"
              className="visually-hidden"
              onChange={(e) => {
                void importCSV(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      <MappingEditor
        idPrefix="novo"
        value={creating}
        onChange={setCreating}
        submitLabel="Adicionar"
        onSubmit={() => {
          submit(creating, 'Mapeamento criado');
          setCreating(EMPTY_EDIT);
        }}
      />
      {rules.length > 8 && (
        <label className="field" style={{ marginTop: 16, maxWidth: 320 }}>
          <span>Filtrar mapeamentos</span>
          <input
            id="filtro-mapeamentos"
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div style={{ marginTop: 12 }}>
        {rules.length === 0 ? (
          <p className="muted">
            Nenhum mapeamento ainda. Mapeie os não reconhecidos acima, crie um aqui ou corrija a
            categoria de um lançamento e escolha "Salvar no de/para".
          </p>
        ) : (
          <ul className="plain">
            {visible.map((r) => {
              const cat = index.get(r.categoryId);
              const isEditing = editing?.id === r.id;
              return (
                <li key={r.id} className="mapping">
                  <span className="mapping__desc">
                    <span className="muted">{MATCH_LABELS[r.match]}</span>
                    <code>{r.pattern}</code>
                    <span aria-hidden="true">→</span>
                    <CategoryIcon icon={cat?.icon} size="sm" />
                    <strong style={{ fontWeight: 500 }}>{cat?.name ?? r.categoryId}</strong>
                    {r.displayName && <span className="chip chip--carbon">"{r.displayName}"</span>}
                    <span className="chip">
                      {plural(counts.get(r.id) ?? 0, 'lançamento', 'lançamentos')}
                    </span>
                  </span>
                  <span className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Editar mapeamento ${r.pattern}`}
                      aria-expanded={isEditing}
                      onClick={() => setEditing(isEditing ? null : { id: r.id, value: toEdit(r) })}
                    >
                      <Pencil size={16} />
                    </button>
                    <ConfirmButton
                      className="icon-btn"
                      ariaLabel={`Apagar mapeamento ${r.pattern}`}
                      confirmLabel="Apagar"
                      onConfirm={() => deleteRule(r.id)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </ConfirmButton>
                  </span>
                  {isEditing && editing && (
                    <div className="mapping__edit">
                      <MappingEditor
                        idPrefix={`editar-${r.id}`}
                        value={editing.value}
                        onChange={(value) => setEditing({ id: r.id, value })}
                        submitLabel="Salvar alterações"
                        onCancel={() => setEditing(null)}
                        onSubmit={() => {
                          submit({ id: r.id, ...editing.value }, 'Mapeamento atualizado');
                          setEditing(null);
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function RuleTester() {
  const rules = useAppStore((s) => s.rules);
  const { index } = useCategories();
  const [text, setText] = useState('IFD*PIZZARIA BELLA');
  const compiled = useMemo(() => compileRules(rules), [rules]);
  const result = text.trim() ? categorize(text, 'compra', compiled) : null;
  const cat = result ? index.get(result.categoryId) : undefined;
  return (
    <section className="panel" aria-labelledby="teste-titulo">
      <div className="panel__head">
        <h2 id="teste-titulo">Testar uma descrição</h2>
        <p>Em que categoria uma linha da fatura cairia</p>
      </div>
      <label className="field">
        <span>Descrição como aparece na fatura</span>
        <input
          id="teste-descricao"
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {result && (
        <p
          style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <CategoryIcon icon={cat?.icon} size="sm" />
          <strong>{cat?.name}</strong>
          <span className="chip">
            {result.source === 'regra'
              ? 'pelo seu de/para'
              : result.source === 'sistema'
                ? 'pela base embutida'
                : 'não reconhecido'}
          </span>
          {result.brand && <span className="chip chip--carbon">{result.brand}</span>}
        </p>
      )}
    </section>
  );
}

function CategoriesPanel() {
  const transactions = useAppStore((s) => s.transactions);
  const addCategory = useAppStore((s) => s.addCategory);
  const deleteCategory = useAppStore((s) => s.deleteCategory);
  const { list: categories } = useCategories();
  const toast = useUiStore((s) => s.toast);
  const [catName, setCatName] = useState('');
  const [catGroup, setCatGroup] = useState<SpendGroup>('estilo');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [transactions]);

  return (
    <section className="panel" aria-labelledby="cats-titulo">
      <div className="panel__head">
        <h2 id="cats-titulo">Categorias</h2>
        <p>Crie categorias próprias, como "Filhos" ou "Presentes", e use-as no de/para</p>
      </div>
      <form
        className="toolbar"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          const c = addCategory(catName, catGroup);
          if (c) {
            setCatName('');
            toast({ message: `Categoria "${c.name}" criada.` }, 4000);
          }
        }}
      >
        <label className="field field--wide">
          <span>Nome da nova categoria</span>
          <input
            id="categoria-nome"
            className="input"
            maxLength={40}
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Perfil</span>
          <select
            id="categoria-grupo"
            className="select"
            value={catGroup}
            onChange={(e) => setCatGroup(e.target.value as SpendGroup)}
          >
            {GROUP_ORDER.filter((g) => g !== 'outros').map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn" disabled={!catName.trim()}>
          <Plus size={16} aria-hidden="true" /> Criar categoria
        </button>
      </form>
      <ul className="plain cat-grid">
        {categories.map((c) => (
          <li key={c.id} className="cat-card">
            <CategoryIcon icon={c.icon} size="sm" />
            <div>
              <strong>{c.name}</strong>
              <small>
                {GROUP_LABELS[c.group]} · {counts.get(c.id) ?? 0} lanç.
              </small>
            </div>
            {!c.builtIn && (
              <ConfirmButton
                className="icon-btn"
                confirmLabel="Apagar"
                ariaLabel={`Apagar categoria ${c.name}`}
                onConfirm={() => deleteCategory(c.id)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DeParaPage() {
  const builtinCount = useMemo(() => compileBuiltinRules().length, []);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>De/para</h1>
          <p>
            Ensine o app a reconhecer seus estabelecimentos: de "como aparece na fatura" para a
            categoria (e um nome amigável). O mapeamento vale para o que já foi importado e é
            aplicado sozinho nas próximas faturas. A base embutida já reconhece{' '}
            {builtinCount.toLocaleString('pt-BR')} palavras-chave.
          </p>
        </div>
      </div>
      <PendingPanel />
      <SavedMappings />
      <RuleTester />
      <CategoriesPanel />
    </>
  );
}
