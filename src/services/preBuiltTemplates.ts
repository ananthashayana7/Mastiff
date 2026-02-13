/**
 * Pre-built Template Examples
 * 
 * Common analysis templates for customer segmentation, forecasting, and churn prediction
 */

export const PRE_BUILT_TEMPLATES = [
    {
        id: 'template_segmentation_kmeans',
        name: 'Customer Segmentation (K-Means)',
        category: 'Analytics',
        description: 'Segment customers into K clusters based on behavioral metrics using K-Means clustering algorithm',
        tags: 'clustering,segmentation,customers,unsupervised',
        isPublic: true,
        inputs: [
            {
                name: 'connectorId',
                type: 'string',
                required: true,
                description: 'Data connector ID for customer data source',
            },
            {
                name: 'tableName',
                type: 'string',
                required: true,
                description: 'Table containing customer metrics (lifetime_value, frequency, recency, etc)',
            },
            {
                name: 'numClusters',
                type: 'number',
                required: false,
                description: 'Number of clusters (default: 3)',
                default: 3,
            },
            {
                name: 'features',
                type: 'string',
                required: false,
                description: 'Comma-separated feature columns (e.g., "lifetime_value,frequency,recency")',
                default: 'lifetime_value,frequency,recency',
            },
        ],
        steps: [
            {
                id: 'fetch_data',
                type: 'query',
                description: 'Fetch customer metrics from data source',
                connectorId: '${connectorId}',
                query: 'SELECT ${features} FROM ${tableName} WHERE ${features} IS NOT NULL LIMIT 10000',
                outputs: ['customer_data'],
            },
            {
                id: 'normalize_features',
                type: 'notebook',
                description: 'Normalize features for clustering',
                code: `
import pandas as pd
from sklearn.preprocessing import StandardScaler

df = customer_data
features = ['${features}']
scaler = StandardScaler()
df_scaled = scaler.fit_transform(df[features])
df_normalized = pd.DataFrame(df_scaled, columns=features)
`,
                outputs: ['normalized_data'],
            },
            {
                id: 'kmeans_clustering',
                type: 'transformation',
                description: 'Apply K-Means clustering',
                code: `
from sklearn.cluster import KMeans

kmeans = KMeans(n_clusters=${numClusters}, random_state=42, n_init=10)
clusters = kmeans.fit_predict(normalized_data)

results = df.copy()
results['cluster'] = clusters
results['inertia'] = kmeans.inertia_
results['silhouette_score'] = silhouette_score(normalized_data, clusters)
`,
                outputs: ['clustering_results'],
            },
            {
                id: 'cluster_visualization',
                type: 'visualization',
                description: 'Visualize cluster distribution',
                code: `
{
    "type": "bar",
    "data": {
        "labels": ["Cluster 0", "Cluster 1", "Cluster 2"],
        "datasets": [{
            "label": "Customer Count",
            "data": [100, 150, 120],
            "backgroundColor": "#3498db"
        }]
    }
}
`,
                outputs: ['cluster_chart'],
            },
        ],
        outputs: ['clustering_results', 'cluster_chart'],
    },

    {
        id: 'template_forecasting_arima',
        name: 'Demand Forecasting (ARIMA)',
        category: 'Forecasting',
        description: 'Forecast future demand using ARIMA time series model',
        tags: 'forecasting,timeseries,demand,arima',
        isPublic: true,
        inputs: [
            {
                name: 'connectorId',
                type: 'string',
                required: true,
                description: 'Data connector ID for historical demand data',
            },
            {
                name: 'query',
                type: 'string',
                required: true,
                description: 'SQL query returning date and demand columns',
                default: 'SELECT date, demand FROM sales_history ORDER BY date',
            },
            {
                name: 'forecastPeriods',
                type: 'number',
                required: false,
                description: 'Number of periods to forecast (default: 12)',
                default: 12,
            },
            {
                name: 'seasonalPeriods',
                type: 'number',
                required: false,
                description: 'Seasonal period (12 for monthly, 52 for weekly, default: 12)',
                default: 12,
            },
        ],
        steps: [
            {
                id: 'fetch_timeseries',
                type: 'query',
                description: 'Fetch historical demand data',
                query: '${query}',
                outputs: ['demand_history'],
            },
            {
                id: 'prepare_timeseries',
                type: 'notebook',
                description: 'Prepare and validate time series data',
                code: `
import pandas as pd
import numpy as np

df = demand_history
df['date'] = pd.to_datetime(df['date'])
df = df.sort_values('date')
df = df[df['demand'].notna()]

# Check for stationarity
from statsmodels.tsa.stattools import adfuller
adf_result = adfuller(df['demand'])
is_stationary = adf_result[1] < 0.05

prepared = {
    'data': df.to_dict('records'),
    'is_stationary': is_stationary,
    'observations': len(df)
}
`,
                outputs: ['prepared_data'],
            },
            {
                id: 'fit_arima',
                type: 'transformation',
                description: 'Fit ARIMA model and forecast',
                code: `
from statsmodels.tsa.arima.model import ARIMA
from dateutil.relativedelta import relativedelta

df = pd.DataFrame(prepared_data['data'])
model = ARIMA(df['demand'], order=(1,1,1), seasonal_order=(1,1,1,${seasonalPeriods}))
fitted_model = model.fit()

forecast = fitted_model.get_forecast(steps=${forecastPeriods})
forecast_df = forecast.conf_int()
forecast_df['forecast'] = forecast.predicted_mean

arima_results = {
    'model_summary': str(fitted_model.summary()),
    'forecast': forecast_df.to_dict('records'),
    'aic': fitted_model.aic,
    'bic': fitted_model.bic
}
`,
                outputs: ['forecast_results'],
            },
        ],
        outputs: ['forecast_results'],
    },

    {
        id: 'template_churn_logistic',
        name: 'Churn Prediction (Logistic Regression)',
        category: 'Analytics',
        description: 'Predict customer churn probability using logistic regression',
        tags: 'churn,prediction,classification,retention',
        isPublic: true,
        inputs: [
            {
                name: 'connectorId',
                type: 'string',
                required: true,
                description: 'Data connector ID for customer data',
            },
            {
                name: 'featureQuery',
                type: 'string',
                required: true,
                description: 'SQL query with features and churn label',
                default: `
SELECT 
    customer_id,
    account_age_months,
    monthly_spend,
    support_tickets,
    contract_type,
    churn
FROM customers
`,
            },
            {
                name: 'testSize',
                type: 'number',
                required: false,
                description: 'Test set proportion (0-1, default: 0.3)',
                default: 0.3,
            },
        ],
        steps: [
            {
                id: 'fetch_features',
                type: 'query',
                description: 'Fetch customer features and churn labels',
                query: '${featureQuery}',
                outputs: ['customer_features'],
            },
            {
                id: 'prepare_features',
                type: 'notebook',
                description: 'Prepare features for model training',
                code: `
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

df = pd.DataFrame(customer_features)

# Handle missing values
df = df.fillna(df.mean(numeric_only=True))

# Separate features and target
X = df.drop(['customer_id', 'churn'], axis=1)
y = df['churn']

# Split data
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=${testSize}, random_state=42, stratify=y
)

# Scale features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

prepared = {
    'X_train_shape': X_train_scaled.shape,
    'X_test_shape': X_test_scaled.shape,
    'y_train_churn_rate': float(y_train.mean()),
    'y_test_churn_rate': float(y_test.mean())
}
`,
                outputs: ['prepared_features'],
            },
            {
                id: 'train_model',
                type: 'transformation',
                description: 'Train logistic regression model',
                code: `
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix

# Train model
model = LogisticRegression(max_iter=1000, random_state=42)
model.fit(X_train_scaled, y_train)

# Predictions
y_pred = model.predict(X_test_scaled)
y_pred_proba = model.predict_proba(X_test_scaled)[:, 1]

# Metrics
metrics = {
    'accuracy': float(model.score(X_test_scaled, y_test)),
    'auc_roc': float(roc_auc_score(y_test, y_pred_proba)),
    'confusion_matrix': confusion_matrix(y_test, y_pred).tolist(),
    'classification_report': classification_report(y_test, y_pred, output_dict=True)
}

churn_model = {
    'model_type': 'LogisticRegression',
    'feature_importance': dict(zip(X.columns, model.coef_[0].tolist())),
    'metrics': metrics,
    'predictions': {
        'predicted': y_pred.tolist(),
        'probability': y_pred_proba.tolist()
    }
}
`,
                outputs: ['model_results'],
            },
        ],
        outputs: ['model_results'],
    },

    {
        id: 'template_rft_analysis',
        name: 'RFM Segmentation',
        category: 'Analytics',
        description: 'Analyze customers using Recency, Frequency, Monetary (RFM) segmentation',
        tags: 'rfm,segmentation,customers,value',
        isPublic: true,
        inputs: [
            {
                name: 'connectorId',
                type: 'string',
                required: true,
                description: 'Data connector ID for transaction history',
            },
            {
                name: 'transactionQuery',
                type: 'string',
                required: true,
                description: 'SQL query with customer_id, transaction_date, amount',
                default: 'SELECT customer_id, transaction_date, amount FROM transactions',
            },
        ],
        steps: [
            {
                id: 'fetch_transactions',
                type: 'query',
                description: 'Fetch transaction history',
                query: '${transactionQuery}',
                outputs: ['transactions'],
            },
            {
                id: 'calculate_rfm',
                type: 'notebook',
                description: 'Calculate RFM scores for each customer',
                code: `
import pandas as pd
from datetime import datetime

df = pd.DataFrame(transactions)
df['transaction_date'] = pd.to_datetime(df['transaction_date'])

reference_date = df['transaction_date'].max()

rfm = df.groupby('customer_id').agg({
    'transaction_date': lambda x: (reference_date - x.max()).days,  # Recency
    'customer_id': 'count',  # Frequency
    'amount': 'sum'  # Monetary
}).rename(columns={'transaction_date': 'recency', 'customer_id': 'frequency', 'amount': 'monetary'})

# Calculate percentile scores
rfm['R_score'] = pd.qcut(rfm['recency'], 5, labels=[5,4,3,2,1], duplicates='drop')
rfm['F_score'] = pd.qcut(rfm['frequency'].rank(method='first'), 5, labels=[1,2,3,4,5], duplicates='drop')
rfm['M_score'] = pd.qcut(rfm['monetary'], 5, labels=[1,2,3,4,5], duplicates='drop')

rfm['RFM_Score'] = rfm['R_score'].astype(int) + rfm['F_score'].astype(int) + rfm['M_score'].astype(int)
`,
                outputs: ['rfm_scores'],
            },
        ],
        outputs: ['rfm_scores'],
    },
];

/**
 * Seed pre-built templates to database
 */
export async function seedPreBuiltTemplates(db: any) {
    console.log('Seeding pre-built templates...');

    for (const template of PRE_BUILT_TEMPLATES) {
        try {
            // Check if already exists
            const existing = await db.query.templates.findFirst({
                where: (t) => t.id.equals(template.id),
            });

            if (!existing) {
                // Insert template
                await db.insert(templates).values({
                    id: template.id,
                    userId: 'system',
                    name: template.name,
                    description: template.description,
                    category: template.category,
                    inputs: JSON.stringify(template.inputs),
                    steps: JSON.stringify(template.steps),
                    outputs: JSON.stringify(template.outputs),
                    tags: template.tags,
                    isPublic: template.isPublic,
                    executionCount: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

                // Create v1 version
                await db.insert(templateVersions).values({
                    templateId: template.id,
                    versionNumber: 1,
                    steps: JSON.stringify(template.steps),
                    changelog: 'Initial version - template created',
                    createdAt: new Date(),
                });

                console.log(`✓ Seeded template: ${template.name}`);
            }
        } catch (error) {
            console.error(`Failed to seed template ${template.id}:`, error);
        }
    }

    console.log('Template seeding complete');
}
