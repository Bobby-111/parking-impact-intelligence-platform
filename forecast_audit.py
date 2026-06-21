import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, mean_absolute_percentage_error, r2_score
from sklearn.model_selection import train_test_split
import h3

def main():
    print("Loading datasets and reconstructing test set...")
    df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/cleaned_parking_violations.csv')
    chi_df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/chi_hotspots_v2.csv')
    
    df['h3_cell'] = df.apply(lambda row: h3.latlng_to_cell(row['latitude'], row['longitude'], 9), axis=1)
    df['hotspot_id'] = 'HS_' + df['h3_cell']
    valid_hotspots = set(chi_df['hotspot_id'])
    df = df[df['hotspot_id'].isin(valid_hotspots)]
    
    df['created_datetime'] = pd.to_datetime(df['created_datetime'])
    df['date_hour'] = df['created_datetime'].dt.floor('h')
    
    hourly = df.groupby(['hotspot_id', 'date_hour']).size().reset_index(name='violation_count')
    
    top_100 = chi_df.head(100)['hotspot_id'].tolist()
    min_date = hourly['date_hour'].min()
    max_date = hourly['date_hour'].max()
    all_hours = pd.date_range(start=min_date, end=max_date, freq='h')
    
    idx = pd.MultiIndex.from_product([top_100, all_hours], names=['hotspot_id', 'date_hour'])
    hourly_full = hourly[hourly['hotspot_id'].isin(top_100)].set_index(['hotspot_id', 'date_hour']).reindex(idx, fill_value=0).reset_index()
    
    hourly_full['hour'] = hourly_full['date_hour'].dt.hour
    hourly_full['day_of_week'] = hourly_full['date_hour'].dt.dayofweek
    hourly_full['month'] = hourly_full['date_hour'].dt.month
    hourly_full['is_weekend'] = (hourly_full['day_of_week'] >= 5).astype(int)
    
    def assign_temporal(h):
        if 7 <= h < 10: return 1
        elif 10 <= h < 16: return 2
        elif 16 <= h < 21: return 3
        else: return 0
    hourly_full['temporal_block_idx'] = hourly_full['hour'].apply(assign_temporal)
    
    static_features = chi_df[['hotspot_id', 'CHI', 'dominant_junction', 'dominant_police_station']].copy()
    static_features.rename(columns={'CHI': 'historical_CHI'}, inplace=True)
    hourly_full = hourly_full.merge(static_features, on='hotspot_id', how='left')
    
    hourly_full['junction_code'] = hourly_full['dominant_junction'].astype('category').cat.codes
    hourly_full['police_code'] = hourly_full['dominant_police_station'].astype('category').cat.codes
    
    hourly_full = hourly_full.sort_values(['hotspot_id', 'date_hour'])
    grouped = hourly_full.groupby('hotspot_id')['violation_count']
    
    hourly_full['rolling_24h_violations'] = grouped.rolling(24, min_periods=1).sum().values
    hourly_full['rolling_7d_violations'] = grouped.rolling(24*7, min_periods=1).sum().values
    
    hourly_full['lag_1'] = grouped.shift(1).fillna(0)
    hourly_full['lag_6'] = grouped.shift(6).fillna(0)
    hourly_full['lag_24'] = grouped.shift(24).fillna(0)
    
    hourly_full['trend_features'] = hourly_full['rolling_24h_violations'] - (hourly_full['rolling_7d_violations'] / 7)
    
    avg_24h_vol = hourly_full.groupby('hotspot_id')['rolling_24h_violations'].transform('mean').replace(0, 1)
    hourly_full['rolling_24h_CHI'] = hourly_full['historical_CHI'] * (hourly_full['rolling_24h_violations'] / avg_24h_vol)
    
    avg_7d_vol = hourly_full.groupby('hotspot_id')['rolling_7d_violations'].transform('mean').replace(0, 1)
    hourly_full['rolling_7d_CHI'] = hourly_full['historical_CHI'] * (hourly_full['rolling_7d_violations'] / avg_7d_vol)
    
    hourly_full['target_future_violation_count'] = hourly_full.groupby('hotspot_id')['violation_count'].shift(-24).rolling(24, min_periods=1).sum().values
    
    # We will explicitly bound the target to 100 during training/testing this time
    raw_target_chi = hourly_full['historical_CHI'] * (hourly_full['target_future_violation_count'] / avg_24h_vol)
    hourly_full['target_future_CHI'] = np.clip(raw_target_chi, 0, 100)
    
    train_df = hourly_full.dropna()
    
    features = ['hour', 'day_of_week', 'month', 'is_weekend', 'temporal_block_idx',
                'junction_code', 'police_code', 'historical_CHI', 
                'rolling_24h_violations', 'rolling_7d_violations',
                'rolling_24h_CHI', 'rolling_7d_CHI',
                'lag_1', 'lag_6', 'lag_24', 'trend_features']
                
    X = train_df[features]
    y_chi = train_df['target_future_CHI']
    
    X_train, X_test, y_chi_train, y_chi_test = train_test_split(X, y_chi, test_size=0.2, random_state=42)
    
    print("Training XGBoost Regressor on Bounded Target [0, 100]...")
    model_chi = xgb.XGBRegressor(n_estimators=50, max_depth=5, learning_rate=0.1, n_jobs=-1, tree_method='hist')
    model_chi.fit(X_train, y_chi_train)
    
    raw_preds = model_chi.predict(X_test)
    preds = np.clip(raw_preds, 0, 100)
    
    print("\n--- FORECASTING AUDIT METRICS ---")
    actual_min = y_chi_test.min()
    actual_max = y_chi_test.max()
    pred_min = preds.min()
    pred_max = preds.max()
    
    mae = mean_absolute_error(y_chi_test, preds)
    rmse = np.sqrt(mean_squared_error(y_chi_test, preds))
    r2 = r2_score(y_chi_test, preds)
    
    # MAPE (safeguard div by zero)
    mask = y_chi_test != 0
    if mask.sum() > 0:
        mape = mean_absolute_percentage_error(y_chi_test[mask], preds[mask]) * 100
    else:
        mape = 0
        
    print(f"1. Actual CHI range: [{actual_min:.1f}, {actual_max:.1f}]")
    print(f"2. Predicted CHI range: [{pred_min:.1f}, {pred_max:.1f}]")
    print(f"3. MAE (Mean Absolute Error): {mae:.2f}")
    print(f"4. RMSE (Root Mean Squared Error): {rmse:.2f}")
    print(f"5. MAPE (Mean Absolute Percentage Error): {mape:.2f}%")
    print(f"6. R² (Coefficient of Determination): {r2:.4f}")
    
    print("\n--- FORECAST QUALITY ASSESSMENT ---")
    target_range = 100.0  # Since bounds are [0, 100]
    error_threshold = target_range * 0.20
    
    print(f"Error Threshold (20% of Range): {error_threshold:.1f}")
    
    if mae > error_threshold:
        print("Status: FAILED ❌")
        print("Reason: MAE exceeds 20% of the target range.")
        print("\nRecommendations for Correction:")
        print("1. Target Bounding: The original Phase 4 script did not bound the target CHI variable to [0, 100] during training, causing massive outlier loss gradients.")
        print("2. Temporal Imbalance: The vast majority of hourly windows for a given hotspot have 0 future violations. The model is struggling heavily with zero-inflation.")
        print("3. Classification Approach: Instead of predicting exact CHI via regression, frame it as a Multi-Class problem (Low, Moderate, High, Critical) using XGBClassifier.")
    else:
        print("Status: PASSED ✅")
        print("Reason: Model MAE is within acceptable operational bounds.")
        
    if r2 < 0.5:
        print(f"\nWARNING: R² Score is {r2:.2f}, indicating the model is capturing less than 50% of the variance. The target variable (Target Future CHI) is too noisy when calculated on a granular hourly basis.")

if __name__ == '__main__':
    main()
