import sys
import pandas as pd
import json
import os

def analyze_file(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext == '.csv':
            df = pd.read_csv(file_path)
        elif ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path)
        elif ext == '.json':
            df = pd.read_json(file_path)
        else:
            return {"error": f"Unsupported file extension: {ext}"}

        metadata = {
            "row_count": len(df),
            "column_count": len(df.columns),
            "columns": {},
            "sample": df.head(5).to_dict(orient='records')
        }

        for col in df.columns:
            col_data = df[col]
            col_info = {
                "dtype": str(col_data.dtype),
                "null_count": int(col_data.isnull().sum()),
                "unique_count": int(col_data.nunique()),
                "sample_values": col_data.dropna().head(3).tolist()
            }

            if pd.api.types.is_numeric_dtype(col_data):
                col_info["stats"] = {
                    "min": float(col_data.min()) if not col_data.empty else 0,
                    "max": float(col_data.max()) if not col_data.empty else 0,
                    "mean": float(col_data.mean()) if not col_data.empty else 0,
                    "median": float(col_data.median()) if not col_data.empty else 0
                }
            metadata["columns"][col] = col_info

        return metadata
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = analyze_file(file_path)
    print(json.dumps(result))
    sys.exit(0)
