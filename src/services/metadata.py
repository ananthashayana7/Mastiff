#!/usr/bin/env python3
"""
Mastiff AI - Metadata Extraction Script
Extracts schema, statistics, and sample data from uploaded files.
Supports: CSV, Excel, JSON, Parquet, TSV, and plain text files.
"""

import sys
import pandas as pd
import numpy as np
import json
import os
from datetime import date, datetime, time

SUPPORTED_EXTENSIONS = {'.csv', '.xlsx', '.xls', '.json', '.parquet', '.tsv', '.txt'}
MAX_SAMPLE_ROWS = 10
MAX_TOP_CATEGORIES = 10


def read_csv_flexible(file_path, forced_sep=None):
    """Read CSV-like files with delimiter and encoding fallbacks."""
    encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']
    separators = [forced_sep] if forced_sep else [None, ',', ';', '\t', '|']
    last_error = None

    for encoding in encodings:
        for sep in separators:
            kwargs = {
                'low_memory': False,
                'encoding': encoding,
            }

            if sep is None:
                kwargs['sep'] = None
                kwargs['engine'] = 'python'
            else:
                kwargs['sep'] = sep

            try:
                df = pd.read_csv(file_path, **kwargs)

                # Keep probing if we clearly parsed into a single malformed column.
                if not forced_sep and df.shape[1] <= 1 and len(df.columns) > 0:
                    header_text = str(df.columns[0])
                    if any(sym in header_text for sym in [',', ';', '\t', '|'] if sym != sep):
                        continue

                return df
            except Exception as exc:
                last_error = exc

    if last_error:
        raise last_error

    return pd.read_csv(file_path, low_memory=False)


def read_json_flexible(file_path):
    """Read JSON arrays, objects, and line-delimited JSON."""
    try:
        return pd.read_json(file_path)
    except ValueError:
        return pd.read_json(file_path, lines=True)


def analyze_file(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    
    try:
        # Load file based on extension
        if ext == '.csv':
            df = read_csv_flexible(file_path)
        elif ext in ['.xlsx', '.xls']:
            # Advanced Sheet Discovery: Scan all sheets and pick the richest one
            xl = pd.ExcelFile(file_path)
            sheet_scores = []
            
            for sheet_name in xl.sheet_names:
                temp_df = pd.read_excel(file_path, sheet_name=sheet_name)
                # Cleaning to get honest count
                temp_df = temp_df.dropna(how='all').dropna(axis=1, how='all')
                score = len(temp_df) * len(temp_df.columns)
                sheet_scores.append((score, sheet_name, temp_df))
            
            # Sort by score descending and take the winner
            sheet_scores.sort(key=lambda x: x[0], reverse=True)
            df = sheet_scores[0][2] if sheet_scores else pd.DataFrame()
            best_sheet = sheet_scores[0][1] if sheet_scores else "Sheet1"
            
            # Robust cleaning for financial files (which often have empty header rows/titles)
            df = df.dropna(how='all').dropna(axis=1, how='all')
            
            # Only search for a header row if columns look auto-generated (e.g. 'Unnamed: 0')
            unnamed_count = sum(1 for c in df.columns if 'unnamed' in str(c).lower())
            if unnamed_count > len(df.columns) * 0.5 and len(df.columns) > 0:
                header_found = False
                for i in range(min(15, len(df))):
                    row = df.iloc[i]
                    non_null_count = row.notnull().sum()
                    
                    if non_null_count >= 2 and row.nunique() >= non_null_count * 0.8:
                        new_header = df.iloc[i]
                        # Clean the header names (remove \n and excess spaces)
                        new_header = [str(h).replace('\n', ' ').strip() for h in new_header]
                        candidate_df = df.iloc[i+1:].copy()
                        candidate_df.columns = new_header
                        candidate_df = candidate_df.dropna(how='all').dropna(axis=1, how='all')
                        # Only accept the new header if it leaves data rows
                        if len(candidate_df) > 0:
                            df = candidate_df
                            header_found = True
                        break
                
                # If no header found and current df has data, keep it as-is (better than 0 rows)
                if not header_found and len(df) > 0:
                    # Assign generic column names instead of "Unnamed: X"
                    df.columns = [f'Column_{i+1}' for i in range(len(df.columns))]
            
            # Fallback: if cleaning left 0 rows, re-read the best sheet with header=None
            if len(df) == 0 and sheet_scores:
                raw_df = pd.read_excel(file_path, sheet_name=sheet_scores[0][1], header=None)
                raw_df = raw_df.dropna(how='all').dropna(axis=1, how='all')
                if len(raw_df) > 0:
                    # Use first row as header
                    new_header = [str(h).replace('\n', ' ').strip() for h in raw_df.iloc[0]]
                    df = raw_df.iloc[1:]
                    df.columns = new_header
                    df = df.dropna(how='all').dropna(axis=1, how='all')
                    # If still empty, just use the raw data
                    if len(df) == 0:
                        df = raw_df.reset_index(drop=True)
            
            # Final safety: reset the index
            if len(df) > 0:
                df = df.reset_index(drop=True)
        elif ext == '.json':
            df = read_json_flexible(file_path)
        elif ext == '.parquet':
            df = pd.read_parquet(file_path)
        elif ext == '.tsv':
            df = read_csv_flexible(file_path, forced_sep='\t')
        elif ext == '.txt':
            # Try CSV first (common for .txt data files)
            try:
                df = read_csv_flexible(file_path)
                if len(df.columns) < 2:
                    raise ValueError("single column")
            except Exception:
                # Fall back to line-based text
                with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                    lines = f.readlines()
                df = pd.DataFrame({
                    'line_number': range(1, len(lines) + 1),
                    'text': [line.strip() for line in lines]
                })
        else:
            return {"error": f"Unsupported file type: {ext}. Supported: {', '.join(SUPPORTED_EXTENSIONS)}"}

        # Clean up
        df = df.dropna(how='all')
        
        # Memory estimate
        memory_mb = round(df.memory_usage(deep=True).sum() / (1024 * 1024), 2)

        metadata = {
            "row_count": len(df),
            "column_count": len(df.columns),
            "memory_mb": memory_mb,
            "columns": {},
            "sample": df.head(MAX_SAMPLE_ROWS).replace({np.nan: None}).to_dict(orient='records'),
            "dtypes_summary": df.dtypes.astype(str).value_counts().to_dict()
        }

        for col in df.columns:
            col_data = df[col]
            null_count = int(col_data.isnull().sum())
            total = len(df)
            
            col_info = {
                "dtype": str(col_data.dtype),
                "null_count": null_count,
                "null_percentage": round((null_count / total) * 100, 2) if total > 0 else 0,
                "unique_count": int(col_data.nunique()),
                "sample_values": [],
            }

            # Sample values (safe serialization)
            try:
                samples = col_data.dropna().head(5).tolist()
                col_info["sample_values"] = [safe_value(v) for v in samples]
            except Exception:
                col_info["sample_values"] = []

            # Numeric statistics
            if pd.api.types.is_numeric_dtype(col_data):
                non_null = col_data.dropna()
                if not non_null.empty:
                    col_info["stats"] = {
                        "min": safe_float(non_null.min()),
                        "max": safe_float(non_null.max()),
                        "mean": safe_float(non_null.mean()),
                        "median": safe_float(non_null.median()),
                        "std": safe_float(non_null.std()),
                        "q1": safe_float(non_null.quantile(0.25)),
                        "q3": safe_float(non_null.quantile(0.75)),
                        "skew": safe_float(non_null.skew()),
                        "kurtosis": safe_float(non_null.kurtosis())
                    }

            # Categorical statistics
            elif pd.api.types.is_object_dtype(col_data) or str(col_data.dtype) == 'category':
                top_values = col_data.value_counts().head(MAX_TOP_CATEGORIES).to_dict()
                col_info["top_categories"] = [
                    {"value": str(k), "count": int(v)} for k, v in top_values.items()
                ]
                # Detect potential date columns
                if col_data.nunique() > 5:
                    try:
                        pd.to_datetime(col_data.dropna().head(20))
                        col_info["potential_date"] = True
                    except (ValueError, TypeError):
                        pass

            # DateTime statistics
            elif pd.api.types.is_datetime64_any_dtype(col_data):
                non_null = col_data.dropna()
                if not non_null.empty:
                    col_info["date_range"] = {
                        "min": str(non_null.min()),
                        "max": str(non_null.max()),
                        "span_days": int((non_null.max() - non_null.min()).days)
                    }

            metadata["columns"][col] = col_info

        return sanitize(metadata)
    
    except Exception as e:
        return {"error": str(e)}


def safe_float(v):
    """Convert to float, handling NaN/Inf."""
    try:
        f = float(v)
        if f != f or f == float('inf') or f == float('-inf'):
            return None
        return round(f, 4)
    except (TypeError, ValueError):
        return None


def safe_value(v):
    """Convert value to JSON-safe type."""
    if isinstance(v, (np.integer,)):
        return int(v)
    elif isinstance(v, (np.floating,)):
        f = float(v)
        return None if (f != f or f == float('inf') or f == float('-inf')) else round(f, 4)
    elif isinstance(v, (np.bool_,)):
        return bool(v)
    elif v is pd.NaT:
        return None
    elif isinstance(v, (pd.Timestamp, np.datetime64)):
        return str(v)
    elif isinstance(v, (datetime, date, time)):
        return v.isoformat()
    elif isinstance(v, (np.ndarray,)):
        return v.tolist()
    return v


def sanitize(obj):
    """Recursively sanitize a dictionary for JSON compliance."""
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize(i) for i in obj]
    elif obj is pd.NaT:
        return None
    elif isinstance(obj, float):
        if obj != obj or obj == float('inf') or obj == float('-inf'):
            return None
        return obj
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        f = float(obj)
        return None if (f != f) else f
    elif isinstance(obj, (np.bool_,)):
        return bool(obj)
    elif isinstance(obj, (pd.Timestamp, np.datetime64)):
        return str(obj)
    elif isinstance(obj, (datetime, date, time)):
        return obj.isoformat()
    elif isinstance(obj, pd.Timedelta):
        return str(obj)
    return obj


if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "No file path provided"}))
            sys.exit(1)
        
        file_path = sys.argv[1]
        if not os.path.exists(file_path):
            print(json.dumps({"error": f"File not found: {file_path}"}))
            sys.exit(1)
            
        result = analyze_file(file_path)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": f"Metadata extraction failed: {str(e)}"}))
        sys.exit(1)
    sys.exit(0)
