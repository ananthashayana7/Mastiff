const PRELUDE = String.raw`import json
import os
import re
import warnings
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

SIGNAL_MARKER = "__SPARTA_SIGNAL__="
result = None


def _safe_to_numeric(arg, errors='coerce'):
    if arg is None:
        return np.nan
    if isinstance(arg, (int, float, np.integer, np.floating)):
        return arg
    if isinstance(arg, pd.DataFrame):
        return arg.apply(lambda c: pd.to_numeric(c, errors=errors))
    if isinstance(arg, (pd.Series, pd.Index, np.ndarray, list, tuple)):
        return pd.to_numeric(arg, errors=errors)
    try:
        return float(str(arg).replace(',', '').strip())
    except (ValueError, TypeError):
        return np.nan if errors == 'coerce' else arg


def _dedup_columns(frame):
    cols = list(frame.columns)
    seen, new_cols = {}, []
    for col in cols:
        key = str(col).strip() or 'column'
        seen[key] = seen.get(key, 0) + 1
        new_cols.append(f'{key}_{seen[key]}' if seen[key] > 1 else key)
    frame.columns = new_cols
    return frame


def _is_usable(candidate):
    return isinstance(candidate, pd.DataFrame) and not candidate.empty and list(candidate.columns) != ['load_error']


def _emit_signal(payload):
    try:
        print(SIGNAL_MARKER + json.dumps(payload, default=float, separators=(',', ':')))
    except Exception:
        pass


def _collect_usable_dfs():
    _deduped = {}
    _seen_source_keys = set()
    _seen_object_ids = set()
    _file_sources = globals().get('file_sources', {}) or {}

    if 'dfs' not in globals() or not isinstance(dfs, dict):
        return _deduped

    for _name, _candidate in dfs.items():
        if not _is_usable(_candidate):
            continue

        _source_path = str(_file_sources.get(_name) or '').strip()
        _source_key = _source_path.lower() if _source_path else f'object:{id(_candidate)}'

        if _source_key in _seen_source_keys or id(_candidate) in _seen_object_ids:
            continue

        _seen_source_keys.add(_source_key)
        _seen_object_ids.add(id(_candidate))
        _display_name = os.path.basename(_source_path) if _source_path else str(_name)
        _deduped[_display_name] = _dedup_columns(_candidate.copy())

    return _deduped


def _read_file_fallback():
    _reloaded = {}
    _file_sources = globals().get('file_sources', {}) or {}
    _seen_paths = set()

    for _name, _path in _file_sources.items():
        if not _path or not os.path.isfile(_path):
            continue

        _norm_path = str(_path).strip().lower()
        if _norm_path in _seen_paths:
            continue

        try:
            _ext = os.path.splitext(_path)[1].lower()
            if _ext == '.csv':
                _rdf = pd.read_csv(_path, low_memory=False)
            elif _ext in ('.xlsx', '.xls'):
                _rdf = pd.read_excel(_path)
                _rdf = _rdf.dropna(how='all').dropna(axis=1, how='all')
                if len(_rdf) == 0:
                    _rdf = pd.read_excel(_path, header=None)
                    _rdf = _rdf.dropna(how='all').dropna(axis=1, how='all')
            elif _ext == '.json':
                _rdf = pd.read_json(_path)
            elif _ext == '.parquet':
                _rdf = pd.read_parquet(_path)
            elif _ext == '.tsv':
                _rdf = pd.read_csv(_path, sep='\t', low_memory=False)
            else:
                continue

            if _is_usable(_rdf):
                _seen_paths.add(_norm_path)
                _reloaded[os.path.basename(_path)] = _dedup_columns(_rdf.copy())
        except Exception:
            continue

    return _reloaded


def _looks_like_note_column(series):
    _numeric = _safe_to_numeric(series, errors='coerce')
    if hasattr(_numeric, 'notna') and _numeric.notna().sum() >= max(3, int(len(series) * 0.6)):
        _clean = _numeric.dropna()
        if len(_clean) > 0 and _clean.abs().max() <= 999 and _clean.nunique() <= min(20, len(_clean)):
            return True
    return False


def _find_label_column(frame):
    _explicit_candidates = []
    for _col in frame.columns:
        _col_name = str(_col).strip().lower()
        if re.search(r'particular|description|line item|account|metric|category|item', _col_name):
            _explicit_candidates.append(_col)

    for _candidate in _explicit_candidates:
        _series = frame[_candidate]
        if isinstance(_series, pd.DataFrame):
            _series = _series.iloc[:, 0]
        _text = _series.astype(str).str.strip()
        _non_empty = _text[_text.ne('') & _text.ne('nan') & _text.ne('None')]
        if len(_non_empty) >= 4:
            return _candidate

    _best_col = None
    _best_score = -1

    for _col in frame.columns:
        _series = frame[_col]
        if isinstance(_series, pd.DataFrame):
            _series = _series.iloc[:, 0]

        if _looks_like_note_column(_series):
            continue

        _text = _series.astype(str).str.strip()
        _non_empty = _text[_text.ne('') & _text.ne('nan') & _text.ne('None')]
        if len(_non_empty) < 4:
            continue

        _unique_ratio = float(_non_empty.nunique()) / float(len(_non_empty)) if len(_non_empty) else 0.0
        _statement_hits = int(_non_empty.str.contains(
            r'revenue|income|expense|profit|margin|tax|inventory|employee|depreciation|finance',
            case=False,
            na=False,
        ).sum())
        _score = (_unique_ratio * 10.0) + min(_statement_hits, 8)

        if _score > _best_score:
            _best_col = _col
            _best_score = _score

    return _best_col


def _normalize_metric_label(value):
    _label = str(value or '').strip().lower()
    _label = re.sub(r'[^a-z0-9]+', ' ', _label)
    return re.sub(r'\s+', ' ', _label).strip()


def _month_label_from_column(col, fallback_index):
    _source = str(col or '').strip()
    _match = re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\'-]*(\d{2,4})?', _source, flags=re.I)
    if _match:
        _month = _match.group(1).title()
        _year = (_match.group(2) or '').strip()
        if len(_year) == 4:
            _year = _year[2:]
        return f"{_month}'{_year}" if _year else _month
    return f"P{fallback_index + 1}"


def _find_metric_row(frame, label_col, aliases):
    _labels = frame[label_col].astype(str).apply(_normalize_metric_label)
    for _alias in aliases:
        _alias_norm = _normalize_metric_label(_alias)
        _mask = _labels.eq(_alias_norm)
        if _mask.any():
            return frame[_mask].iloc[0]
    for _alias in aliases:
        _alias_norm = _normalize_metric_label(_alias)
        _mask = _labels.str.contains(re.escape(_alias_norm), na=False)
        if _mask.any():
            return frame[_mask].iloc[0]
    return None


def _series_from_row(row, cols):
    if row is None:
        return [0.0 for _ in cols]

    _values = []
    for _col in cols:
        _raw = row[_col]
        if isinstance(_raw, pd.Series):
            _raw = _raw.iloc[0]
        _numeric = _safe_to_numeric(_raw, errors='coerce')
        if isinstance(_numeric, pd.Series):
            _numeric = _numeric.iloc[0] if len(_numeric) else np.nan
        _values.append(float(0.0 if pd.isna(_numeric) else _numeric))
    return _values


def _maybe_promote_statement_header(frame):
    if frame.empty or len(frame) < 2:
        return frame

    _first_row = frame.iloc[0].tolist()
    _first_row_text = [str(value).strip() for value in _first_row]
    _month_hits = sum(
        1 for value in _first_row_text
        if re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\'-]*(\d{2,4})?', value, flags=re.I)
    )
    _has_particulars = any(re.search(r'particular|description|line item', value, flags=re.I) for value in _first_row_text)

    if not _has_particulars or _month_hits < 4:
        return frame

    _promoted_headers = []
    _seen = {}
    for idx, raw in enumerate(_first_row_text):
        _base = raw or f'column_{idx + 1}'
        _seen[_base] = _seen.get(_base, 0) + 1
        _header = _base if _seen[_base] == 1 else f'{_base}_{_seen[_base]}'
        _promoted_headers.append(_header)

    _promoted = frame.iloc[1:].copy().reset_index(drop=True)
    _promoted.columns = _promoted_headers
    return _promoted


def _extract_financial_statement(frame):
    if frame.empty:
        return None

    _work = _dedup_columns(_maybe_promote_statement_header(frame.copy()))
    _label_col = _find_label_column(_work)
    if not _label_col:
        return None

    _column_names = [str(_col).strip() for _col in _work.columns]
    _month_like_columns = [
        _col for _col in _work.columns
        if re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\'-]*(\d{2,4})?', str(_col), flags=re.I)
    ]

    _label_text = _work[_label_col].astype(str).apply(_normalize_metric_label)
    _finance_hits = int(_label_text.str.contains(
        r'revenue from operations|total income|total expenses|profit before tax|profit for the year|pat|inventory|employee benefits|other income|depreciation',
        case=False,
        na=False,
    ).sum())

    _structure_looks_financial = (
        len(_month_like_columns) >= 6
        and _finance_hits >= 4
    )

    _numeric_cols = []
    for _col in _work.columns:
        if _col == _label_col:
            continue
        _series = _work[_col]
        if isinstance(_series, pd.DataFrame):
            _series = _series.iloc[:, 0]
        if _looks_like_note_column(_series):
            continue
        _numeric = _safe_to_numeric(_series, errors='coerce')
        if hasattr(_numeric, 'notna') and _numeric.notna().sum() >= max(3, int(len(_work) * 0.35)):
            _numeric_cols.append(_col)

    if len(_numeric_cols) < 6 and not _structure_looks_financial:
        return None

    if _finance_hits < 4:
        return None

    if len(_numeric_cols) < 6 and _structure_looks_financial:
        _numeric_cols = _month_like_columns

    _month_like_numeric_cols = [
        _col for _col in _numeric_cols
        if re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\'-]*(\d{2,4})?', str(_col), flags=re.I)
    ]
    if len(_month_like_numeric_cols) >= 6:
        _numeric_cols = _month_like_numeric_cols

    if len(_numeric_cols) >= 12:
        _monthly_cols = _numeric_cols[:6]
        _ytd_cols = _numeric_cols[-6:]
    else:
        _monthly_cols = _numeric_cols[:min(6, len(_numeric_cols))]
        _ytd_cols = [col for col in _numeric_cols if re.search(r'^ytd', str(col).strip(), flags=re.I)][:len(_monthly_cols)]

    if len(_ytd_cols) == 0 and len(_numeric_cols) >= 12:
        _ytd_cols = _numeric_cols[6:12]

    if len(_monthly_cols) < 4:
        return None

    _months = [_month_label_from_column(col, idx) for idx, col in enumerate(_monthly_cols)]
    _ytd_months = [_month_label_from_column(col, idx) for idx, col in enumerate(_ytd_cols)] if _ytd_cols else []

    _revenue_row = _find_metric_row(_work, _label_col, ['Revenue from operations', 'Revenue'])
    _total_income_row = _find_metric_row(_work, _label_col, ['Total Income'])
    _total_expenses_row = _find_metric_row(_work, _label_col, ['Total expenses', 'Total Expenses'])
    _pbt_row = _find_metric_row(_work, _label_col, ['Profit before tax (EBIT)', 'Profit before tax', 'EBIT'])
    _pat_row = _find_metric_row(_work, _label_col, ['Profit for the year (PAT)', 'PAT', 'Profit for the year'])

    if _total_income_row is None or _pat_row is None:
        return None

    return {
        'label_col': _label_col,
        'months': _months,
        'ytd_months': _ytd_months,
        'monthly_cols': _monthly_cols,
        'ytd_cols': _ytd_cols,
        'revenue': _series_from_row(_revenue_row, _monthly_cols),
        'total_income': _series_from_row(_total_income_row, _monthly_cols),
        'total_expenses': _series_from_row(_total_expenses_row, _monthly_cols),
        'pbt': _series_from_row(_pbt_row, _monthly_cols),
        'pat': _series_from_row(_pat_row, _monthly_cols),
        'other_income': _series_from_row(_find_metric_row(_work, _label_col, ['Other income']), _monthly_cols),
        'inventory': _series_from_row(_find_metric_row(_work, _label_col, ['Changes in inventories of finished goods and work-in-progress', 'Changes in inventories']), _monthly_cols),
        'raw_material': _series_from_row(_find_metric_row(_work, _label_col, ['Cost of raw material consumed', 'Raw material']), _monthly_cols),
        'employee_benefits': _series_from_row(_find_metric_row(_work, _label_col, ['Employee benefits expense', 'Employee benefit expense']), _monthly_cols),
        'other_expenses': _series_from_row(_find_metric_row(_work, _label_col, ['Other expenses']), _monthly_cols),
        'depreciation': _series_from_row(_find_metric_row(_work, _label_col, ['Depreciation and amortisation expenses', 'Depreciation']), _monthly_cols),
        'revenue_ytd': _series_from_row(_revenue_row, _ytd_cols),
        'total_income_ytd': _series_from_row(_total_income_row, _ytd_cols),
        'total_expenses_ytd': _series_from_row(_total_expenses_row, _ytd_cols),
        'pat_ytd': _series_from_row(_pat_row, _ytd_cols),
    }


_usable_dfs = _collect_usable_dfs()
if not _usable_dfs:
    _usable_dfs = _read_file_fallback()

if not _usable_dfs and _is_usable(df):
    _usable_dfs['active_df'] = _dedup_columns(df.copy())

if not _is_usable(df) and _usable_dfs:
    df = next(iter(_usable_dfs.values())).copy()
elif _is_usable(df):
    df = _dedup_columns(df.copy())

`;
const MULTI_DATASET_BLOCK = String.raw`
def _build_multi_dataset_signal(usable_dfs):
    _profile_rows = []
    _normalized_sets = []
    _shared_numeric = []

    for _source_name, _source_df in usable_dfs.items():
        _normalized_map = {str(_col).strip().lower(): _col for _col in _source_df.columns}
        _normalized_sets.append(set(_normalized_map.keys()))
        _numeric_hits = 0
        for _col in _source_df.columns:
            _col_data = _source_df[_col]
            if isinstance(_col_data, pd.DataFrame):
                _col_data = _col_data.iloc[:, 0]
            if _safe_to_numeric(_col_data, errors='coerce').notna().sum() > 0:
                _numeric_hits += 1
        _profile_rows.append({
            'source_file': str(_source_name),
            'rows': int(len(_source_df)),
            'columns': int(len(_source_df.columns)),
            'numeric_columns': int(_numeric_hits),
        })

    _shared_columns = set.intersection(*_normalized_sets) if _normalized_sets else set()
    for _shared_key in sorted(_shared_columns):
        _numeric_ok = True
        for _source_name, _source_df in usable_dfs.items():
            _source_map = {str(_col).strip().lower(): _col for _col in _source_df.columns}
            _raw = _source_df[_source_map[_shared_key]]
            if isinstance(_raw, pd.DataFrame):
                _raw = _raw.iloc[:, 0]
            _series = _safe_to_numeric(_raw, errors='coerce')
            if _series.notna().sum() == 0:
                _numeric_ok = False
                break
        if _numeric_ok:
            _shared_numeric.append(_shared_key)

    _profile_df = pd.DataFrame(_profile_rows)
    _primary_metric_key = _shared_numeric[0] if _shared_numeric else None
    _compare_rows = []
    _distribution_frames = []

    if _primary_metric_key:
        for _source_name, _source_df in usable_dfs.items():
            _source_map = {str(_col).strip().lower(): _col for _col in _source_df.columns}
            _metric_col = _source_map[_primary_metric_key]
            _raw_metric = _source_df[_metric_col]
            if isinstance(_raw_metric, pd.DataFrame):
                _raw_metric = _raw_metric.iloc[:, 0]
            _metric = _safe_to_numeric(_raw_metric, errors='coerce')
            _compare_rows.append({
                'source_file': str(_source_name),
                'metric_sum': float(_metric.fillna(0).sum()),
                'metric_mean': float(_metric.mean()) if _metric.notna().sum() > 0 else 0.0,
            })
            _dist = pd.DataFrame({
                'source_file': str(_source_name),
                'metric_value': _metric.dropna().head(250),
            })
            if not _dist.empty:
                _distribution_frames.append(_dist)

    _compare_df = pd.DataFrame(_compare_rows)
    _distribution_df = pd.concat(_distribution_frames, ignore_index=True) if _distribution_frames else pd.DataFrame()
    _top_dataset = None
    _top_metric_sum = 0.0

    if not _compare_df.empty:
        _top_row = _compare_df.sort_values('metric_sum', ascending=False).iloc[0]
        _top_dataset = str(_top_row['source_file'])
        _top_metric_sum = float(_top_row['metric_sum'])

    _signal = {
        'kind': 'multi_dataset_overview',
        'datasetCount': int(len(usable_dfs)),
        'datasetNames': [str(name) for name in list(usable_dfs.keys())[:8]],
        'sharedColumnsCount': int(len(_shared_columns)),
        'primaryMetric': _primary_metric_key,
        'topDataset': _top_dataset,
        'topDatasetMetricSum': _top_metric_sum,
        'totalRows': int(_profile_df['rows'].sum()) if not _profile_df.empty else 0,
        'coverageNote': f"Cross-file fallback compared {len(usable_dfs)} unique datasets after removing alias duplicates.",
        'dataQuality': 'Cross-file result is reproducible, but shared-schema strength limits causal claims.',
    }

    print(f"Datasets analyzed: {len(usable_dfs)}")
    print(f"Dataset names: {', '.join(list(usable_dfs.keys())[:8])}")
    print(f"Shared columns: {len(_shared_columns)}")
    print(f"Primary shared metric for comparison: {_primary_metric_key or 'none detected'}")
    _emit_signal(_signal)

    fig = make_subplots(
        rows=2,
        cols=2,
        specs=[[{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'table'}]],
        subplot_titles=(
            'Rows by dataset',
            'Cross-file KPI comparison',
            'Distribution by dataset',
            'Multi-file summary',
        ),
        vertical_spacing=0.14,
        horizontal_spacing=0.1,
    )

    fig.add_trace(
        go.Bar(
            x=_profile_df['source_file'],
            y=_profile_df['rows'],
            marker=dict(color='#38BDF8'),
            name='Rows',
            text=_profile_df['rows'],
            textposition='auto',
            hovertemplate='<b>%{x}</b><br>Rows: %{y:,}<extra></extra>',
        ),
        row=1,
        col=1,
    )

    if not _compare_df.empty and _primary_metric_key:
        fig.add_trace(
            go.Bar(
                x=_compare_df['source_file'],
                y=_compare_df['metric_sum'],
                marker=dict(color='#2DD4BF'),
                name=f'{_primary_metric_key} sum',
                text=_compare_df['metric_sum'].round(2),
                textposition='auto',
                hovertemplate='<b>%{x}</b><br>Total: %{y:,.2f}<extra></extra>',
            ),
            row=1,
            col=2,
        )
    else:
        fig.add_trace(
            go.Bar(
                x=_profile_df['source_file'],
                y=_profile_df['columns'],
                marker=dict(color='#F59E0B'),
                name='Columns',
                text=_profile_df['columns'],
                textposition='auto',
                hovertemplate='<b>%{x}</b><br>Columns: %{y}<extra></extra>',
            ),
            row=1,
            col=2,
        )

    if not _distribution_df.empty and _primary_metric_key:
        fig.add_trace(
            go.Box(
                x=_distribution_df['source_file'],
                y=_distribution_df['metric_value'],
                marker=dict(color='#818CF8'),
                name=f'{_primary_metric_key} spread',
                boxmean=True,
                hovertemplate='<b>%{x}</b><br>Value: %{y:,.2f}<extra></extra>',
            ),
            row=2,
            col=1,
        )
    else:
        fig.add_trace(
            go.Bar(
                x=_profile_df['source_file'],
                y=_profile_df['numeric_columns'],
                marker=dict(color='#F59E0B'),
                name='Numeric columns',
                text=_profile_df['numeric_columns'],
                textposition='auto',
                hovertemplate='<b>%{x}</b><br>Numeric columns: %{y}<extra></extra>',
            ),
            row=2,
            col=1,
        )

    _summary_metrics = pd.DataFrame({
        'metric': ['datasets', 'total_rows', 'shared_columns', 'primary_metric'],
        'value': [
            int(len(usable_dfs)),
            int(_profile_df['rows'].sum()),
            int(len(_shared_columns)),
            _primary_metric_key or 'none',
        ],
    })

    fig.add_trace(
        go.Table(
            header=dict(values=['Metric', 'Value'], fill_color='#0f172a', font=dict(color='white')),
            cells=dict(values=[_summary_metrics['metric'], _summary_metrics['value']], fill_color='#111827'),
            name='Summary',
        ),
        row=2,
        col=2,
    )

    fig.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(15,23,42,0.6)',
        font=dict(family='system-ui,sans-serif', color='#e2e8f0'),
        title=dict(text='Deterministic fallback dashboard: multi-dataset comparison and schema coverage', font=dict(size=18, color='#f8fafc')),
        margin=dict(l=50, r=30, t=90, b=40),
        height=780,
        legend=dict(orientation='h', title=dict(text='Series'), yanchor='bottom', y=1.02, xanchor='right', x=1, font=dict(color='#cbd5e1')),
        barmode='group',
        hoverlabel=dict(bgcolor='#1e293b', font_size=12),
    )
    fig.update_xaxes(title_text='Dataset', row=1, col=1)
    fig.update_yaxes(title_text='Rows analyzed', row=1, col=1)
    fig.update_xaxes(title_text='Dataset', row=1, col=2)
    fig.update_yaxes(title_text='KPI value' if _primary_metric_key else 'Columns analyzed', row=1, col=2)
    fig.update_xaxes(title_text='Dataset', row=2, col=1)
    fig.update_yaxes(title_text='Distribution value' if _primary_metric_key else 'Numeric columns', row=2, col=1)
    return fig
`;
const FINANCIAL_BLOCK = String.raw`


def _build_financial_statement_output(frame, source_name):
    _finance = _extract_financial_statement(frame)
    if not _finance:
        return None

    _months = _finance['months']
    _revenue = np.array(_finance['revenue'], dtype=float)
    _income = np.array(_finance['total_income'], dtype=float)
    _expenses = np.array(_finance['total_expenses'], dtype=float)
    _pat = np.array(_finance['pat'], dtype=float)
    _pbt = np.array(_finance['pbt'], dtype=float)
    _inventory = np.array(_finance['inventory'], dtype=float)
    _raw_material = np.array(_finance['raw_material'], dtype=float)
    _employee = np.array(_finance['employee_benefits'], dtype=float)
    _other_expenses = np.array(_finance['other_expenses'], dtype=float)
    _other_income = np.array(_finance['other_income'], dtype=float)
    _depreciation = np.array(_finance['depreciation'], dtype=float)

    if len(_months) < 4 or len(_income) < len(_months) or len(_pat) < len(_months):
        return None

    _income_safe = np.where(_income == 0, np.nan, _income)
    _pat_margin = np.nan_to_num((_pat / _income_safe) * 100.0)
    _pbt_margin = np.nan_to_num((_pbt / _income_safe) * 100.0)
    _worst_idx = int(np.argmin(_pat))
    _prior_idx = max(_worst_idx - 1, 0)
    _best_revenue_idx = int(np.argmax(_revenue)) if len(_revenue) else 0

    _prior_pat = float(_pat[_prior_idx]) if len(_pat) > 0 else 0.0
    _worst_pat = float(_pat[_worst_idx]) if len(_pat) > 0 else 0.0
    _pat_drop_pct = ((abs(_prior_pat - _worst_pat) / abs(_prior_pat)) * 100.0) if _worst_idx > 0 and _prior_pat != 0 else 0.0

    _driver_changes = {
        'Inventory swing': float(_inventory[_worst_idx] - _inventory[_prior_idx]) if len(_inventory) > _worst_idx else 0.0,
        'Raw material': float(_raw_material[_worst_idx] - _raw_material[_prior_idx]) if len(_raw_material) > _worst_idx else 0.0,
        'Employee cost': float(_employee[_worst_idx] - _employee[_prior_idx]) if len(_employee) > _worst_idx else 0.0,
        'Other expenses': float(_other_expenses[_worst_idx] - _other_expenses[_prior_idx]) if len(_other_expenses) > _worst_idx else 0.0,
        'Other income': float(_other_income[_worst_idx] - _other_income[_prior_idx]) if len(_other_income) > _worst_idx else 0.0,
        'Depreciation': float(_depreciation[_worst_idx] - _depreciation[_prior_idx]) if len(_depreciation) > _worst_idx else 0.0,
    }
    _primary_driver_name, _primary_driver_delta = min(_driver_changes.items(), key=lambda item: item[1])

    _other_income_spike_idx = int(np.argmax(_other_income)) if len(_other_income) else -1
    _other_income_spike_value = float(_other_income[_other_income_spike_idx]) if _other_income_spike_idx >= 0 else 0.0
    _other_income_recurring = bool(len(_other_income) >= 2 and np.any(_other_income[-2:] > 0))

    _dep_positive_indexes = np.where(_depreciation > 0)[0].tolist() if len(_depreciation) else []
    _dep_positive_idx = int(_dep_positive_indexes[0]) if _dep_positive_indexes else -1
    _dep_positive_value = float(_depreciation[_dep_positive_idx]) if _dep_positive_idx >= 0 else 0.0

    _x = np.arange(len(_pat), dtype=float)
    if len(_pat) >= 2:
        _pat_slope, _pat_intercept = np.polyfit(_x, _pat, 1)
        _forecast_pat = float(_pat_intercept + (_pat_slope * len(_pat)))
    else:
        _forecast_pat = float(_pat[-1]) if len(_pat) else 0.0
    _forecast_band = float(np.std(_pat, ddof=1)) if len(_pat) >= 3 else 0.0
    _next_period_label = f"P{len(_months) + 1}"

    _ytd_income = np.array(_finance['total_income_ytd'], dtype=float) if _finance['total_income_ytd'] else np.array([])
    _ytd_pat = np.array(_finance['pat_ytd'], dtype=float) if _finance['pat_ytd'] else np.array([])
    _ytd_income_last = float(_ytd_income[-1]) if len(_ytd_income) else float(np.nansum(_income))
    _ytd_pat_last = float(_ytd_pat[-1]) if len(_ytd_pat) else float(np.nansum(_pat))
    _ytd_pat_margin = (_ytd_pat_last / _ytd_income_last * 100.0) if _ytd_income_last else 0.0

    _revenue_cv_pct = float((np.std(_revenue, ddof=1) / np.mean(_revenue)) * 100.0) if len(_revenue) >= 2 and np.mean(_revenue) != 0 else 0.0
    _pat_cv_pct = float((np.std(_pat, ddof=1) / np.mean(np.abs(_pat))) * 100.0) if len(_pat) >= 2 and np.mean(np.abs(_pat)) != 0 else 0.0
    _remaining_periods = max(0, 12 - len(_months))
    _normalized_pat_source = [float(value) for idx, value in enumerate(_pat.tolist()) if idx != _worst_idx] if len(_pat) > 1 else [float(_pat[-1]) if len(_pat) else 0.0]
    _normalized_pat_monthly = float(np.mean(_normalized_pat_source)) if len(_normalized_pat_source) > 0 else float(_forecast_pat)
    _recent_pat_window = _pat[-3:] if len(_pat) >= 3 else _pat
    _stabilized_pat_monthly = float(np.mean(_recent_pat_window)) if len(_recent_pat_window) > 0 else float(_forecast_pat)
    _stress_pat_monthly = float(min(_worst_pat, float(_pat[-1]) if len(_pat) else _worst_pat))
    _base_annual_pat = float(_ytd_pat_last + (_forecast_pat * _remaining_periods))
    _stabilized_annual_pat = float(_ytd_pat_last + (_stabilized_pat_monthly * _remaining_periods))
    _recovery_annual_pat = float(_ytd_pat_last + (_normalized_pat_monthly * _remaining_periods))
    _stress_annual_pat = float(_ytd_pat_last + (_stress_pat_monthly * _remaining_periods))
    _pat_change_total = float(_worst_pat - _prior_pat)
    _bridge_components = [
        ('Inventory', float(_inventory[_worst_idx] - _inventory[_prior_idx]) if len(_inventory) > _worst_idx else 0.0),
        ('Raw material', float(_raw_material[_worst_idx] - _raw_material[_prior_idx]) if len(_raw_material) > _worst_idx else 0.0),
        ('Employee cost', float(_employee[_worst_idx] - _employee[_prior_idx]) if len(_employee) > _worst_idx else 0.0),
        ('Other expenses', float(_other_expenses[_worst_idx] - _other_expenses[_prior_idx]) if len(_other_expenses) > _worst_idx else 0.0),
        ('Other income', float(_other_income[_worst_idx] - _other_income[_prior_idx]) if len(_other_income) > _worst_idx else 0.0),
        ('Depreciation', float(_depreciation[_worst_idx] - _depreciation[_prior_idx]) if len(_depreciation) > _worst_idx else 0.0),
    ]
    _bridge_known_total = float(sum(value for _, value in _bridge_components))
    _bridge_residual = float(_pat_change_total - _bridge_known_total)
    _margin_compression = float(_pat_margin[_prior_idx] - _pat_margin[_worst_idx]) if len(_pat_margin) > _worst_idx else 0.0
    _pat_delta = np.diff(_pat, prepend=_pat[0]) if len(_pat) else np.array([])
    _hidden_risk_text = f"PAT volatility ({_pat_cv_pct:.1f}%) is running far above revenue volatility ({_revenue_cv_pct:.1f}%), which implies accounting or cost-timing risk is dominating commercial demand."

    _signal = {
        'kind': 'financial_statement',
        'datasetName': str(source_name),
        'coverageNote': f"Single workbook financial statement parsed across {len(_months)} monthly periods with YTD totals where available.",
        'months': [str(month) for month in _months],
        'ytdPat': _ytd_pat_last,
        'ytdTotalIncome': _ytd_income_last,
        'ytdPatMarginPct': _ytd_pat_margin,
        'worstMonthLabel': str(_months[_worst_idx]),
        'worstMonthPat': _worst_pat,
        'priorMonthLabel': str(_months[_prior_idx]),
        'priorMonthPat': _prior_pat,
        'patDropPct': _pat_drop_pct,
        'worstMonthRevenue': float(_revenue[_worst_idx]) if len(_revenue) > _worst_idx else 0.0,
        'highestRevenueMonthLabel': str(_months[_best_revenue_idx]),
        'highestRevenueValue': float(_revenue[_best_revenue_idx]) if len(_revenue) > _best_revenue_idx else 0.0,
        'primaryObservedDriver': _primary_driver_name,
        'primaryObservedDriverDelta': float(_primary_driver_delta),
        'inventoryCurrent': float(_inventory[_worst_idx]) if len(_inventory) > _worst_idx else 0.0,
        'inventoryPrior': float(_inventory[_prior_idx]) if len(_inventory) > _prior_idx else 0.0,
        'otherIncomeSpikeLabel': str(_months[_other_income_spike_idx]) if _other_income_spike_idx >= 0 else None,
        'otherIncomeSpikeValue': _other_income_spike_value,
        'otherIncomeRecurring': _other_income_recurring,
        'depreciationAnomalyLabel': str(_months[_dep_positive_idx]) if _dep_positive_idx >= 0 else None,
        'depreciationAnomalyValue': _dep_positive_value,
        'nextPeriodLabel': _next_period_label,
        'forecastPat': _forecast_pat,
        'forecastBandStd': _forecast_band,
        'revenueCvPct': _revenue_cv_pct,
        'patCvPct': _pat_cv_pct,
        'monthlyCount': int(len(_months)),
        'dataQuality': 'Directional finance read with strong monthly coverage, but accounting-style line items still need validation before policy changes.',
    }

    print(f"Coverage note: {_signal['coverageNote']}")
    print(f"YTD PAT: {_ytd_pat_last:,.2f}")
    print(f"YTD total income: {_ytd_income_last:,.2f}")
    print(f"YTD PAT margin: {_ytd_pat_margin:,.2f}%")
    print(f"Worst month: {_months[_worst_idx]} PAT {_worst_pat:,.2f} ({_pat_drop_pct:,.1f}% below {_months[_prior_idx]})")
    print(f"Primary observed driver: {_primary_driver_name} ({_primary_driver_delta:,.2f})")
    print(f"Hidden risk: {_hidden_risk_text}")
    _emit_signal(_signal)

    _next_month_axis = list(_months) + [_next_period_label]

    fig = make_subplots(
        rows=4,
        cols=2,
        specs=[[{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'xy'}]],
        subplot_titles=(
            'Revenue, expenses, and PAT',
            'PBT and PAT margins',
            f'PAT bridge: {_months[_prior_idx]} to {_months[_worst_idx]}',
            'Inventory and other income anomalies',
            'PAT trend and low-confidence forecast',
            'Forecast scenario comparison',
            'YTD income and PAT',
            'Margin compression vs earnings shock',
        ),
        vertical_spacing=0.12,
        horizontal_spacing=0.1,
    )

    fig.add_trace(
        go.Scatter(
            x=_months,
            y=_revenue,
            mode='lines+markers',
            name='Revenue',
            line=dict(color='#00D4AA', width=3),
            hovertemplate='<b>%{x}</b><br>Revenue: %{y:,.2f}<extra></extra>',
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=_months,
            y=np.abs(_expenses),
            mode='lines+markers',
            name='Total expenses',
            line=dict(color='#FF6B6B', width=3),
            hovertemplate='<b>%{x}</b><br>Total expenses: %{y:,.2f}<extra></extra>',
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=_months,
            y=_pat,
            mode='lines+markers',
            name='PAT',
            line=dict(color='#54A0FF', width=3),
            hovertemplate='<b>%{x}</b><br>PAT: %{y:,.2f}<extra></extra>',
        ),
        row=1,
        col=1,
    )

    fig.add_trace(
        go.Scatter(
            x=_months,
            y=_pbt_margin,
            mode='lines+markers',
            name='PBT margin %',
            line=dict(color='#A8EDEA', width=3),
            hovertemplate='<b>%{x}</b><br>PBT margin: %{y:.2f}%<extra></extra>',
        ),
        row=1,
        col=2,
    )
    fig.add_trace(
        go.Scatter(
            x=_months,
            y=_pat_margin,
            mode='lines+markers',
            name='PAT margin %',
            line=dict(color='#FFE66D', width=3),
            hovertemplate='<b>%{x}</b><br>PAT margin: %{y:.2f}%<extra></extra>',
        ),
        row=1,
        col=2,
    )

    _bridge_x = [f'{_months[_prior_idx]} PAT'] + [label for label, _ in _bridge_components] + ['Tax and residual', f'{_months[_worst_idx]} PAT']
    _bridge_y = [float(_prior_pat)] + [value for _, value in _bridge_components] + [_bridge_residual] + [float(_worst_pat)]
    _bridge_measure = ['absolute'] + ['relative'] * len(_bridge_components) + ['relative', 'total']
    _bridge_text = [f'{_prior_pat:,.0f}'] + [f'{value:,.0f}' for _, value in _bridge_components] + [f'{_bridge_residual:,.0f}', f'{_worst_pat:,.0f}']
    fig.add_trace(
        go.Waterfall(
            x=_bridge_x,
            y=_bridge_y,
            measure=_bridge_measure,
            text=_bridge_text,
            textposition='outside',
            name='PAT bridge',
            connector=dict(line=dict(color='rgba(226,232,240,0.35)', width=1.5)),
            increasing=dict(marker=dict(color='#00D4AA')),
            decreasing=dict(marker=dict(color='#FF6B6B')),
            totals=dict(marker=dict(color='#FFE66D')),
            hovertemplate='<b>%{x}</b><br>Impact: %{y:,.2f}<extra></extra>',
        ),
        row=2,
        col=1,
    )

    fig.add_trace(
        go.Bar(
            x=_months,
            y=_inventory,
            name='Inventory changes',
            marker=dict(color=['#EE5A24' if idx == _worst_idx else '#C3F584' for idx in range(len(_months))]),
            hovertemplate='<b>%{x}</b><br>Inventory changes: %{y:,.2f}<extra></extra>',
        ),
        row=2,
        col=2,
    )
    fig.add_trace(
        go.Scatter(
            x=_months,
            y=_other_income,
            mode='lines+markers',
            name='Other income',
            line=dict(color='#54A0FF', width=3),
            hovertemplate='<b>%{x}</b><br>Other income: %{y:,.2f}<extra></extra>',
        ),
        row=2,
        col=2,
    )

    fig.add_trace(
        go.Scatter(
            x=_months,
            y=_pat,
            mode='lines+markers',
            name='Observed PAT',
            line=dict(color='#00D4AA', width=3),
            hovertemplate='<b>%{x}</b><br>Observed PAT: %{y:,.2f}<extra></extra>',
        ),
        row=3,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=_next_month_axis[-2:],
            y=[float(_pat[-1]), _forecast_pat],
            mode='lines+markers',
            name='Forecast',
            line=dict(color='#54A0FF', width=3, dash='dash'),
            hovertemplate='<b>%{x}</b><br>Forecast PAT: %{y:,.2f}<extra></extra>',
        ),
        row=3,
        col=1,
    )
    if _forecast_band > 0:
        fig.add_trace(
            go.Scatter(
                x=[_months[-1], _next_period_label, _next_period_label, _months[-1]],
                y=[float(_pat[-1] + _forecast_band), _forecast_pat + _forecast_band, _forecast_pat - _forecast_band, float(_pat[-1] - _forecast_band)],
                fill='toself',
                fillcolor='rgba(84,160,255,0.15)',
                line=dict(color='rgba(0,0,0,0)'),
                name='Confidence band',
                hoverinfo='skip',
                showlegend=True,
            ),
            row=3,
            col=1,
        )

    fig.add_trace(
        go.Bar(
            x=['Stress case', 'Base case', 'Stabilized case', 'Recovery case'],
            y=[_stress_annual_pat, _base_annual_pat, _stabilized_annual_pat, _recovery_annual_pat],
            marker=dict(color=['#FF6B6B', '#54A0FF', '#A8EDEA', '#00D4AA']),
            text=[f'{value:,.0f}' for value in [_stress_annual_pat, _base_annual_pat, _stabilized_annual_pat, _recovery_annual_pat]],
            textposition='auto',
            name='FY PAT scenarios',
            hovertemplate='<b>%{x}</b><br>Projected FY PAT: %{y:,.2f}<extra></extra>',
        ),
        row=3,
        col=2,
    )

    _ytd_axis = _finance['ytd_months'] if _finance['ytd_months'] else _months
    _ytd_income_plot = _ytd_income if len(_ytd_income) else np.cumsum(_income)
    _ytd_pat_plot = _ytd_pat if len(_ytd_pat) else np.cumsum(_pat)

    fig.add_trace(
        go.Scatter(
            x=_ytd_axis,
            y=_ytd_income_plot,
            mode='lines+markers',
            name='YTD total income',
            line=dict(color='#A8EDEA', width=3),
            hovertemplate='<b>%{x}</b><br>YTD total income: %{y:,.2f}<extra></extra>',
        ),
        row=4,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=_ytd_axis,
            y=_ytd_pat_plot,
            mode='lines+markers',
            name='YTD PAT',
            line=dict(color='#FFE66D', width=3),
            hovertemplate='<b>%{x}</b><br>YTD PAT: %{y:,.2f}<extra></extra>',
        ),
        row=4,
        col=1,
    )

    fig.add_trace(
        go.Bar(
            x=_months,
            y=_pat_delta,
            name='PAT delta',
            marker=dict(color=['#54A0FF' if value >= 0 else '#FF6B6B' for value in _pat_delta]),
            hovertemplate='<b>%{x}</b><br>PAT delta: %{y:,.2f}<extra></extra>',
        ),
        row=4,
        col=2,
    )
    fig.add_trace(
        go.Scatter(
            x=_months,
            y=_inventory,
            mode='lines+markers',
            name='Inventory movement',
            line=dict(color='#C3F584', width=3),
            hovertemplate='<b>%{x}</b><br>Inventory movement: %{y:,.2f}<extra></extra>',
        ),
        row=4,
        col=2,
    )
    fig.add_trace(
        go.Scatter(
            x=_months,
            y=[_margin_compression if idx == _worst_idx else 0.0 for idx in range(len(_months))],
            mode='markers+text',
            text=[f'{_margin_compression:,.1f} pts' if idx == _worst_idx else '' for idx in range(len(_months))],
            textposition='top center',
            marker=dict(size=11, color='#FFE66D'),
            name='Margin compression marker',
            hovertemplate='<b>%{x}</b><br>Margin compression marker: %{y:,.2f}<extra></extra>',
        ),
        row=4,
        col=2,
    )

    fig.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(15,23,42,0.6)',
        font=dict(family='system-ui,sans-serif', color='#e2e8f0'),
        title=dict(text=f'Financial statement dashboard: {source_name}', font=dict(size=18, color='#f8fafc')),
        margin=dict(l=50, r=30, t=90, b=40),
        height=1460,
        legend=dict(orientation='h', title=dict(text='Series'), yanchor='bottom', y=1.02, xanchor='right', x=1, font=dict(color='#cbd5e1')),
        barmode='group',
        hoverlabel=dict(bgcolor='#1e293b', font_size=12),
        annotations=[
            dict(
                text=_hidden_risk_text,
                x=0.5,
                xref='paper',
                y=-0.08,
                yref='paper',
                showarrow=False,
                font=dict(size=12, color='#f8fafc'),
                align='center',
                bgcolor='rgba(148,163,184,0.10)',
                bordercolor='rgba(148,163,184,0.18)',
                borderpad=8,
            )
        ],
    )
    fig.update_xaxes(title_text='Month', row=1, col=1)
    fig.update_yaxes(title_text='Amount (T INR)', row=1, col=1)
    fig.update_xaxes(title_text='Month', row=1, col=2)
    fig.update_yaxes(title_text='Margin (%)', row=1, col=2)
    fig.update_xaxes(title_text='Bridge component', row=2, col=1)
    fig.update_yaxes(title_text='Impact on PAT (T INR)', row=2, col=1)
    fig.update_xaxes(title_text='Month', row=2, col=2)
    fig.update_yaxes(title_text='Amount (T INR)', row=2, col=2)
    fig.update_xaxes(title_text='Month / forecast period', row=3, col=1)
    fig.update_yaxes(title_text='PAT (T INR)', row=3, col=1)
    fig.update_xaxes(title_text='Scenario', row=3, col=2)
    fig.update_yaxes(title_text='Projected FY PAT (T INR)', row=3, col=2)
    fig.update_xaxes(title_text='YTD month', row=4, col=1)
    fig.update_yaxes(title_text='Cumulative amount (T INR)', row=4, col=1)
    fig.update_xaxes(title_text='Month', row=4, col=2)
    fig.update_yaxes(title_text='Diagnostic value', row=4, col=2)
    return fig
`;
const SINGLE_DATASET_BLOCK = String.raw`


def _coerce_datetime_series(series):
    _candidate = pd.Series(series).copy()
    _candidate = _candidate.replace({'': np.nan, 'nan': np.nan, 'None': np.nan})

    if hasattr(_candidate, 'dropna'):
        _non_null = _candidate.dropna()
    else:
        _non_null = _candidate

    if len(_non_null) == 0:
        return pd.to_datetime(_candidate, errors='coerce')

    _stringy = _non_null.astype(str).str.strip()
    _formats = [
        '%d/%m/%Y %I:%M %p',
        '%m/%d/%Y %I:%M %p',
        '%d/%m/%Y',
        '%m/%d/%Y',
        '%Y-%m-%d',
        '%d-%m-%Y',
        '%d %b %Y',
        '%d %b %Y %I:%M %p',
        '%Y-%m-%d %H:%M:%S',
        '%d/%m/%Y %H:%M:%S',
        '%m/%d/%Y %H:%M:%S',
    ]

    _best_parsed = None
    _best_valid = -1

    for _format in _formats:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            _parsed = pd.to_datetime(_candidate, format=_format, errors='coerce')
        _valid = int(_parsed.notna().sum()) if hasattr(_parsed, 'notna') else 0
        if _valid > _best_valid:
            _best_parsed = _parsed
            _best_valid = _valid
        if _valid == len(_non_null):
            return _parsed

    for _kwargs in ({'dayfirst': True}, {'dayfirst': False}, {'format': 'mixed'}):
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                _parsed = pd.to_datetime(_candidate, errors='coerce', **_kwargs)
        except TypeError:
            continue
        _valid = int(_parsed.notna().sum()) if hasattr(_parsed, 'notna') else 0
        if _valid > _best_valid:
            _best_parsed = _parsed
            _best_valid = _valid

    return _best_parsed if _best_parsed is not None else pd.to_datetime(_candidate, errors='coerce')


def _pick_datetime_axis(frame, candidate_cols):
    _scored = []
    for _col in candidate_cols:
        _series = frame[_col]
        if isinstance(_series, pd.DataFrame):
            _series = _series.iloc[:, 0]
        _parsed = _coerce_datetime_series(_series)
        _valid = int(_parsed.notna().sum()) if hasattr(_parsed, 'notna') else 0
        if _valid < max(5, int(len(frame) * 0.35)):
            continue
        _name = str(_col).strip().lower()
        _score = _valid
        if re.search(r'date|time|timestamp|day|week|month|hour|shift start', _name):
            _score += 30
        _score += min(15, int(_parsed.nunique()))
        _scored.append((_score, _col))
    _scored.sort(key=lambda item: item[0], reverse=True)
    return _scored[0][1] if _scored else None


def _infer_time_grain(series):
    _clean = pd.Series(series).dropna().sort_values().drop_duplicates()
    if len(_clean) < 3:
        return ('H', 'Hourly')
    _diffs = _clean.diff().dropna()
    if len(_diffs) == 0:
        return ('H', 'Hourly')
    _median_seconds = float(_diffs.dt.total_seconds().median())
    if _median_seconds <= 7200:
        return ('H', 'Hourly')
    if _median_seconds <= 172800:
        return ('D', 'Daily')
    if _median_seconds <= 1209600:
        return ('W-MON', 'Weekly')
    return ('MS', 'Monthly')


def _pick_driver_dimension(frame, candidate_cols, excluded=None):
    _scored = []
    for _col in candidate_cols:
        if _col == excluded:
            continue
        _series = frame[_col]
        if isinstance(_series, pd.DataFrame):
            _series = _series.iloc[:, 0]
        _text = _series.astype(str).str.strip()
        _clean = _text[_text.ne('') & _text.ne('nan') & _text.ne('None')]
        _nunique = int(_clean.nunique()) if len(_clean) else 0
        if _nunique < 2 or _nunique > min(24, max(8, int(len(frame) * 0.3))):
            continue
        _name = str(_col).strip().lower()
        _score = max(0, 18 - _nunique)
        if re.search(r'shift|item|type|path|qa|line|station|reason|remark|status|operator|machine', _name):
            _score += 24
        _score += min(8, int(len(_clean) / max(1, _nunique)))
        _scored.append((_score, _col))
    _scored.sort(key=lambda item: item[0], reverse=True)
    return _scored[0][1] if _scored else None


def _format_period_label(value, grain_label):
    if pd.isna(value):
        return 'n/a'
    _timestamp = pd.Timestamp(value)
    if grain_label == 'Monthly':
        return _timestamp.strftime('%b %Y')
    if grain_label == 'Weekly':
        return _timestamp.strftime('Week of %d %b %Y')
    if grain_label == 'Daily':
        return _timestamp.strftime('%d %b %Y')
    return _timestamp.strftime('%d %b %Y %I:%M %p')


def _pick_primary_metric(frame, numeric_cols):
    _scores = []
    for _col in numeric_cols:
        _name = str(_col).strip().lower()
        _score = 0
        if re.search(r'totalcount|count|volume|throughput|reject|rework|defect|downtime|yield|rate|units|qty|quantity|revenue|sales|profit|margin|cost|expense|value|amount|total', _name):
            _score += 8
        if re.search(r'id|code|notes|number|index|serial', _name):
            _score -= 6
        _series = frame[_col]
        if isinstance(_series, pd.DataFrame):
            _series = _series.iloc[:, 0]
        _clean = _safe_to_numeric(_series, errors='coerce').dropna()
        if len(_clean) >= 3:
            _score += min(5, int(_clean.nunique()))
            if _clean.abs().max() > 100:
                _score += 2
        _scores.append((_score, _col))
    _scores.sort(key=lambda item: item[0], reverse=True)
    return _scores[0][1] if _scores else numeric_cols[0]


if df.empty:
    result = "No usable rows were loaded, so the actionable pass is limited to schema recovery and source checks."
else:
    _multi_file_ready = len(_usable_dfs) > 1

    if not _multi_file_ready:
        _single_name = next(iter(_usable_dfs.keys())) if _usable_dfs else 'active_df'
        _finance_fig = _build_financial_statement_output(df, _single_name)
        if _finance_fig is not None:
            result = _finance_fig if __WANTS_VISUALIZATION__ else "Financial statement parsed successfully."

    if _multi_file_ready:
        result = _build_multi_dataset_signal(_usable_dfs)
    elif result is None or isinstance(result, str):
        numeric_cols = []
        for col in df.columns:
            _raw_col = df[col]
            if isinstance(_raw_col, pd.DataFrame):
                _raw_col = _raw_col.iloc[:, 0]
            _series = _safe_to_numeric(_raw_col, errors='coerce')
            if hasattr(_series, 'notna') and _series.notna().sum() > 0:
                numeric_cols.append(col)
                df[col] = _series

        if numeric_cols:
            value_col = _pick_primary_metric(df, numeric_cols)
            category_candidates = [c for c in df.columns if c not in numeric_cols]
            secondary_value_col = next((c for c in numeric_cols if c != value_col), None)
            time_col = _pick_datetime_axis(df, category_candidates)
            driver_col = _pick_driver_dimension(df, category_candidates, excluded=time_col)

            series_df = df[[value_col]].copy().reset_index(drop=True)
            series_df['row_id'] = np.arange(len(series_df))
            valid_series = series_df.dropna(subset=[value_col]).copy()
            if valid_series.empty:
                valid_series = pd.DataFrame({'row_id': [0], value_col: [0.0]})

            time_freq = None
            time_grain_label = None
            time_chart_df = None
            forecast_basis = 'row-order proxy because no reliable time axis was available'
            if time_col:
                _time_df = df[[time_col, value_col]].copy()
                _time_df[time_col] = _coerce_datetime_series(_time_df[time_col])
                _time_df = _time_df.dropna(subset=[time_col, value_col]).copy()
                if len(_time_df) >= 3:
                    time_freq, time_grain_label = _infer_time_grain(_time_df[time_col])
                    if time_freq in ('H', 'D'):
                        _time_df['period'] = _time_df[time_col].dt.floor(time_freq)
                    elif time_freq == 'W-MON':
                        _time_df['period'] = _time_df[time_col].dt.to_period('W').dt.start_time
                    else:
                        _time_df['period'] = _time_df[time_col].dt.to_period('M').dt.start_time
                    time_chart_df = _time_df.groupby('period', as_index=False)[value_col].sum().sort_values('period').reset_index(drop=True)
                    if len(time_chart_df) < 3:
                        time_chart_df = None

            if time_chart_df is not None:
                time_chart_df['row_id'] = np.arange(len(time_chart_df))
                coeffs = np.polyfit(time_chart_df['row_id'], time_chart_df[value_col], 1) if len(time_chart_df) >= 2 else [0.0, float(time_chart_df[value_col].iloc[-1])]
                future_steps = min(max(3, int(len(time_chart_df) * 0.25)), 6)
                future_index = np.arange(len(time_chart_df), len(time_chart_df) + future_steps)
                future_values = np.clip(coeffs[0] * future_index + coeffs[1], a_min=0.0, a_max=None)
                future_periods = pd.date_range(start=pd.Timestamp(time_chart_df['period'].iloc[-1]), periods=future_steps + 1, freq=time_freq)[1:]
                forecast_df = pd.DataFrame({'period': future_periods, 'row_id': future_index, value_col: future_values})
                forecast_basis = f'{time_grain_label} sequence aligned on {time_col}'
            else:
                if len(valid_series) >= 2:
                    coeffs = np.polyfit(valid_series['row_id'], valid_series[value_col], 1)
                    future_steps = min(max(3, int(len(valid_series) * 0.2)), 12)
                    future_index = np.arange(len(valid_series), len(valid_series) + future_steps)
                    future_values = np.clip(coeffs[0] * future_index + coeffs[1], a_min=0.0, a_max=None)
                    forecast_df = pd.DataFrame({'row_id': future_index, value_col: future_values})
                else:
                    forecast_df = pd.DataFrame({'row_id': [len(valid_series)], value_col: [float(valid_series[value_col].iloc[-1]) if not valid_series.empty else 0.0]})

            cat_col = driver_col or (category_candidates[0] if category_candidates else None)
            if cat_col:
                chart_df = df[[cat_col, value_col]].dropna().copy()
                if chart_df.empty:
                    chart_df = pd.DataFrame({cat_col: ["All Rows"], value_col: [float(df[value_col].fillna(0).sum())]})
                else:
                    chart_df = chart_df.groupby(cat_col, as_index=False)[value_col].sum().sort_values(value_col, ascending=False).head(8)
            else:
                chart_df = pd.DataFrame({'label': [f'Row {idx + 1}' for idx in range(min(len(valid_series), 10))], value_col: valid_series[value_col].head(10).tolist()})
                cat_col = 'label'

            if time_chart_df is not None:
                _peak_index = int(time_chart_df[value_col].idxmax())
                _low_index = int(time_chart_df[value_col].idxmin())
                peak_period_label = _format_period_label(time_chart_df.loc[_peak_index, 'period'], time_grain_label)
                peak_period_value = float(time_chart_df.loc[_peak_index, value_col])
                latest_period_label = _format_period_label(time_chart_df['period'].iloc[-1], time_grain_label)
                latest_period_value = float(time_chart_df[value_col].iloc[-1])
                lowest_period_label = _format_period_label(time_chart_df.loc[_low_index, 'period'], time_grain_label)
                lowest_period_value = float(time_chart_df.loc[_low_index, value_col])
                baseline_value = float(time_chart_df[value_col].median()) if len(time_chart_df) > 0 else latest_period_value
                period_count = int(len(time_chart_df))
                volatility_pct = float((time_chart_df[value_col].std(ddof=1) / abs(time_chart_df[value_col].mean())) * 100.0) if len(time_chart_df) >= 2 and abs(float(time_chart_df[value_col].mean())) > 1e-9 else 0.0
            else:
                peak_period_label = str(chart_df[cat_col].iloc[0]) if len(chart_df) > 0 else 'n/a'
                peak_period_value = float(chart_df[value_col].iloc[0]) if len(chart_df) > 0 else 0.0
                latest_period_label = f'Row {int(valid_series["row_id"].iloc[-1]) + 1}' if len(valid_series) > 0 else 'Latest row'
                latest_period_value = float(valid_series[value_col].iloc[-1]) if len(valid_series) > 0 else 0.0
                lowest_period_label = str(chart_df[cat_col].iloc[-1]) if len(chart_df) > 0 else 'n/a'
                lowest_period_value = float(chart_df[value_col].iloc[-1]) if len(chart_df) > 0 else 0.0
                baseline_value = float(valid_series[value_col].median()) if len(valid_series) > 0 else latest_period_value
                period_count = int(len(valid_series))
                volatility_pct = float((valid_series[value_col].std(ddof=1) / abs(valid_series[value_col].mean())) * 100.0) if len(valid_series) >= 2 and abs(float(valid_series[value_col].mean())) > 1e-9 else 0.0

            change_vs_baseline_pct = ((latest_period_value - baseline_value) / abs(baseline_value) * 100.0) if abs(baseline_value) > 1e-9 else 0.0
            driver_label = str(chart_df[cat_col].iloc[0]) if len(chart_df) > 0 else 'n/a'
            driver_value = float(chart_df[value_col].iloc[0]) if len(chart_df) > 0 else 0.0
            total_metric_value = float(df[value_col].fillna(0).sum())
            driver_share_pct = (driver_value / total_metric_value * 100.0) if total_metric_value else 0.0
            forecast_last_value = float(forecast_df[value_col].iloc[-1]) if len(forecast_df) > 0 else 0.0
            forecast_change_pct = ((forecast_last_value - latest_period_value) / abs(latest_period_value) * 100.0) if abs(latest_period_value) > 1e-9 else 0.0

            summary_metrics = pd.DataFrame({
                'metric': [
                    'rows',
                    'columns',
                    'time_axis',
                    'periods_analyzed',
                    f'sum_{value_col}',
                    f'mean_{value_col}',
                    'peak_period',
                    'lowest_period',
                    'latest_period',
                    'baseline_value',
                    'delta_vs_baseline_pct',
                    'forecast_next',
                    'forecast_change_pct',
                    'volatility_pct',
                    'top_driver',
                    'top_driver_share_pct',
                ],
                'value': [
                    int(len(df)),
                    int(len(df.columns)),
                    str(time_col) if time_col else 'row-order proxy',
                    period_count,
                    total_metric_value,
                    float(df[value_col].fillna(0).mean()),
                    peak_period_label,
                    f'{lowest_period_label} ({lowest_period_value:,.2f})',
                    f'{latest_period_label} ({latest_period_value:,.2f})',
                    baseline_value,
                    change_vs_baseline_pct,
                    forecast_last_value,
                    forecast_change_pct,
                    volatility_pct,
                    f'{cat_col}: {driver_label}',
                    driver_share_pct,
                ],
            })

            print(f"Rows analyzed: {len(df)}")
            print(f"Primary metric: {value_col}")
            if time_chart_df is not None:
                print(f"Peak {time_grain_label.lower()} period: {peak_period_label} = {peak_period_value:,.2f}")
                print(f"Latest {time_grain_label.lower()} period: {latest_period_label} = {latest_period_value:,.2f}")
            print(f"Top driver: {cat_col} = {driver_label} ({driver_value:,.2f}, {driver_share_pct:,.1f}% share)")
            print(f"Run-rate forecast ({value_col}): {forecast_last_value:,.2f}")
            _emit_signal({
                'kind': 'single_dataset_numeric',
                'rows': int(len(df)),
                'columns': int(len(df.columns)),
                'primaryMetric': str(value_col),
                'topSegmentLabel': peak_period_label,
                'topSegmentValue': peak_period_value,
                'forecastValue': forecast_last_value,
                'timeAxis': str(time_col) if time_col else None,
                'timeGrain': time_grain_label,
                'periodCount': period_count,
                'latestPeriodLabel': latest_period_label,
                'latestPeriodValue': latest_period_value,
                'lowestPeriodLabel': lowest_period_label,
                'lowestPeriodValue': lowest_period_value,
                'baselineValue': baseline_value,
                'changeVsBaselinePct': change_vs_baseline_pct,
                'volatilityPct': volatility_pct,
                'forecastChangePct': forecast_change_pct,
                'driverDimension': str(cat_col) if cat_col else None,
                'driverLabel': driver_label,
                'driverValue': driver_value,
                'driverSharePct': driver_share_pct,
                'forecastBasis': forecast_basis,
                'coverageNote': f"Single dataset fallback ran on {len(df)} rows and {len(df.columns)} columns" + (f", aligned on {time_col} at {time_grain_label.lower()} grain" if time_col and time_grain_label else '') + (f", and ranked {cat_col} as the main categorical driver." if cat_col else '.'),
                'dataQuality': (f'Fallback result is reproducible and time-aligned on {time_col} at {time_grain_label.lower()} grain, but causal diagnosis still depends on operational driver fields.' if time_col and time_grain_label else 'Fallback result is reproducible, but row-order forecasts only hold when row order approximates time.'),
            })

            fig = make_subplots(
                rows=2,
                cols=2,
                specs=[[{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'table'}]],
                subplot_titles=(
                    f'{value_col} trend by {time_col or "sequence"}',
                    f'{value_col} by {cat_col}',
                    f'{value_col} deviation from baseline',
                    'Fallback summary',
                ),
                vertical_spacing=0.14,
                horizontal_spacing=0.1,
            )

            if time_chart_df is not None:
                fig.add_trace(
                    go.Scatter(
                        x=time_chart_df['period'],
                        y=time_chart_df[value_col],
                        mode='lines+markers',
                        name=f'Observed {time_grain_label}',
                        line=dict(color='#19D3F3', width=3),
                        hovertemplate='<b>%{x}</b><br>Value: %{y:,.2f}<extra></extra>',
                    ),
                    row=1,
                    col=1,
                )
                fig.add_trace(
                    go.Scatter(
                        x=forecast_df['period'],
                        y=forecast_df[value_col],
                        mode='lines+markers',
                        name='Forecast',
                        line=dict(color='#EF553B', width=3, dash='dash'),
                        hovertemplate='<b>%{x}</b><br>Forecast: %{y:,.2f}<extra></extra>',
                    ),
                    row=1,
                    col=1,
                )
                if len(time_chart_df) >= 3:
                    _std_val = float(time_chart_df[value_col].std())
                    _upper = forecast_df[value_col] + _std_val
                    _lower = np.clip(forecast_df[value_col] - _std_val, a_min=0.0, a_max=None)
                    fig.add_trace(
                        go.Scatter(
                            x=list(forecast_df['period']) + list(forecast_df['period'][::-1]),
                            y=list(_upper) + list(_lower[::-1]),
                            fill='toself',
                            fillcolor='rgba(239,85,59,0.12)',
                            line=dict(color='rgba(0,0,0,0)'),
                            name='Confidence band',
                            showlegend=True,
                            hoverinfo='skip',
                        ),
                        row=1,
                        col=1,
                    )
            else:
                fig.add_trace(
                    go.Scatter(
                        x=valid_series['row_id'],
                        y=valid_series[value_col],
                        mode='lines+markers',
                        name='Observed',
                        line=dict(color='#19D3F3', width=3),
                        hovertemplate='<b>Row %{x}</b><br>Value: %{y:,.2f}<extra></extra>',
                    ),
                    row=1,
                    col=1,
                )
                fig.add_trace(
                    go.Scatter(
                        x=forecast_df['row_id'],
                        y=forecast_df[value_col],
                        mode='lines+markers',
                        name='Forecast',
                        line=dict(color='#EF553B', width=3, dash='dash'),
                        hovertemplate='<b>Forecast %{x}</b><br>Value: %{y:,.2f}<extra></extra>',
                    ),
                    row=1,
                    col=1,
                )

            fig.add_trace(
                go.Bar(
                    x=chart_df[cat_col],
                    y=chart_df[value_col],
                    marker=dict(color=chart_df[value_col], colorscale='Viridis'),
                    name='Top driver slices',
                    hovertemplate='<b>%{x}</b><br>Value: %{y:,.2f}<extra></extra>',
                ),
                row=1,
                col=2,
            )

            if time_chart_df is not None and len(time_chart_df) >= 2:
                _deviation_df = time_chart_df.copy()
                _rolling = _deviation_df[value_col].rolling(window=min(5, len(_deviation_df)), min_periods=1).median()
                _deviation_df['deviation'] = _deviation_df[value_col] - _rolling
                fig.add_trace(
                    go.Bar(
                        x=_deviation_df['period'],
                        y=_deviation_df['deviation'],
                        marker=dict(color=['#00CC96' if _value >= 0 else '#EF553B' for _value in _deviation_df['deviation']]),
                        name='Deviation vs rolling median',
                        hovertemplate='<b>%{x}</b><br>Deviation: %{y:,.2f}<extra></extra>',
                    ),
                    row=2,
                    col=1,
                )
            else:
                fig.add_trace(
                    go.Histogram(
                        x=valid_series[value_col],
                        nbinsx=min(20, max(5, len(valid_series))),
                        marker=dict(color='#AB63FA'),
                        name='Distribution',
                        hovertemplate='Value: %{x:,.2f}<br>Count: %{y}<extra></extra>',
                    ),
                    row=2,
                    col=1,
                )

            fig.add_trace(
                go.Table(
                    header=dict(values=['Metric', 'Value'], fill_color='#1f2937', font=dict(color='white')),
                    cells=dict(values=[summary_metrics['metric'], summary_metrics['value']], fill_color='#111827'),
                    name='Summary',
                ),
                row=2,
                col=2,
            )

            if secondary_value_col and time_chart_df is None:
                paired = df[[value_col, secondary_value_col]].dropna().copy()
                if not paired.empty:
                    fig.add_trace(
                        go.Scatter(
                            x=paired[value_col],
                            y=paired[secondary_value_col],
                            mode='markers',
                            marker=dict(color='#00CC96', size=9, opacity=0.75),
                            name=f'{secondary_value_col} vs {value_col}',
                            hovertemplate='<b>%{x:,.2f}</b><br>Peer metric: %{y:,.2f}<extra></extra>',
                        ),
                        row=2,
                        col=1,
                    )

            fig.update_layout(
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(15,23,42,0.6)',
                font=dict(family='system-ui,sans-serif', color='#e2e8f0'),
                title=dict(text=f'Deterministic fallback dashboard: {value_col} operating analysis', font=dict(size=18, color='#f8fafc')),
                margin=dict(l=50, r=30, t=90, b=40),
                height=780,
                legend=dict(orientation='h', title=dict(text='Series'), yanchor='bottom', y=1.02, xanchor='right', x=1, font=dict(color='#cbd5e1')),
                barmode='group',
                hoverlabel=dict(bgcolor='#1e293b', font_size=12),
            )
            fig.update_xaxes(title_text=time_col or 'Row order / period proxy', row=1, col=1)
            fig.update_yaxes(title_text=f'{value_col} value', row=1, col=1)
            fig.update_xaxes(title_text=cat_col, row=1, col=2)
            fig.update_yaxes(title_text=f'{value_col} value', row=1, col=2)
            fig.update_xaxes(title_text=(time_col or f'{value_col} bucket'), row=2, col=1)
            fig.update_yaxes(title_text='Deviation / frequency', row=2, col=1)
            result = fig
        else:
            preview = df.head(10).astype(str)
            fig = go.Figure(
                data=[go.Table(
                    header=dict(values=list(preview.columns)),
                    cells=dict(values=[preview[col].tolist() for col in preview.columns]),
                )]
            )
            fig.update_layout(title='Deterministic fallback dashboard: data preview', height=520)
            result = fig if __WANTS_VISUALIZATION__ else "Qualitative preview completed; no numeric KPI column was detected for quantitative ranking."
`;

export function buildDeterministicAnalysisFallbackPython(wantsVisualization: boolean): string {
  const visualizationLiteral = wantsVisualization ? 'True' : 'False';

  return [
    PRELUDE,
    MULTI_DATASET_BLOCK,
    FINANCIAL_BLOCK,
    SINGLE_DATASET_BLOCK.replaceAll('__WANTS_VISUALIZATION__', visualizationLiteral),
  ].join('\n');
}
