type RecoveryFile = {
    filename: string;
    filePath: string;
};

function toJsonStringLiteral(value: string): string {
    return JSON.stringify(value);
}

export function buildRecoverySnippet(file: RecoveryFile): string {
    const fileNameLiteral = toJsonStringLiteral(file.filename);
    const filePathLiteral = toJsonStringLiteral(file.filePath.replace(/\\/g, '/'));
    const ext = file.filename.split('.').pop()?.toLowerCase() || '';

    if (['xlsx', 'xls'].includes(ext)) {
        return [
            `# Auto-recovery: metadata reported 0 rows for ${fileNameLiteral}`,
            `try:`,
            `    _rdf = pd.read_excel(${filePathLiteral})`,
            `    _rdf = _rdf.dropna(how='all').dropna(axis=1, how='all')`,
            `    if len(_rdf) == 0:`,
            `        _rdf = pd.read_excel(${filePathLiteral}, header=None)`,
            `        _rdf = _rdf.dropna(how='all').dropna(axis=1, how='all')`,
            `        if len(_rdf) > 0:`,
            `            _rdf.columns = [str(c).strip() for c in _rdf.iloc[0]]`,
            `            _rdf = _rdf.iloc[1:].reset_index(drop=True)`,
            `    if len(_rdf) > 0:`,
            `        dfs[${fileNameLiteral}] = _rdf`,
            `        df = _rdf`,
            `        print("Recovered " + str(len(_rdf)) + " rows from " + ${fileNameLiteral})`,
            `except Exception as _e:`,
            `    print("Recovery failed for " + ${fileNameLiteral} + ": " + str(_e))`,
        ].join('\n');
    }

    if (['csv', 'tsv', 'txt'].includes(ext)) {
        return [
            `# Auto-recovery: metadata reported 0 rows for ${fileNameLiteral}`,
            `try:`,
            `    for _enc in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']:`,
            `        try:`,
            `            _rdf = pd.read_csv(${filePathLiteral}, encoding=_enc)`,
            `            _rdf = _rdf.dropna(how='all')`,
            `            if len(_rdf) > 0:`,
            `                dfs[${fileNameLiteral}] = _rdf`,
            `                df = _rdf`,
            `                print("Recovered " + str(len(_rdf)) + " rows from " + ${fileNameLiteral})`,
            `                break`,
            `        except Exception:`,
            `            continue`,
            `except Exception as _e:`,
            `    print("Recovery failed for " + ${fileNameLiteral} + ": " + str(_e))`,
        ].join('\n');
    }

    return '';
}
