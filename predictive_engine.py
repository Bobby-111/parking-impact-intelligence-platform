import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, mean_absolute_percentage_error
from sklearn.model_selection import train_test_split
import h3

def main():
    print("1. Loading datasets...")
    df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/cleaned_parking_violations.csv')
    chi_df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/chi_hotspots_v2.csv')
    
    # Map violations to hotspots
    df['h3_cell'] = df.apply(lambda row: h3.latlng_to_cell(row['latitude'], row['longitude'], 9), axis=1)
    df['hotspot_id'] = 'HS_' + df['h3_cell']
    
    # Filter to known hotspots
    valid_hotspots = set(chi_df['hotspot_id'])
    df = df[df['hotspot_id'].isin(valid_hotspots)]
    
    print("2. Hourly Aggregation & Subsetting...")
    df['created_datetime'] = pd.to_datetime(df['created_datetime'])
    df['date_hour'] = df['created_datetime'].dt.floor('h')
    
    hourly = df.groupby(['hotspot_id', 'date_hour']).size().reset_index(name='violation_count')
    
    # To prevent out-of-memory errors on small local disk/RAM, we will forecast using
    # the top 100 hotspots by CHI as requested for risk profiling.
    top_100 = chi_df.head(100)['hotspot_id'].tolist()
    min_date = hourly['date_hour'].min()
    max_date = hourly['date_hour'].max()
    all_hours = pd.date_range(start=min_date, end=max_date, freq='h')
    
    idx = pd.MultiIndex.from_product([top_100, all_hours], names=['hotspot_id', 'date_hour'])
    hourly_full = hourly[hourly['hotspot_id'].isin(top_100)].set_index(['hotspot_id', 'date_hour']).reindex(idx, fill_value=0).reset_index()
    
    print("3. Feature Engineering...")
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
    hourly_full['target_future_CHI'] = hourly_full['historical_CHI'] * (hourly_full['target_future_violation_count'] / avg_24h_vol)
    
    train_df = hourly_full.dropna()
    
    print("4. Training XGBoost Models...")
    features = ['hour', 'day_of_week', 'month', 'is_weekend', 'temporal_block_idx',
                'junction_code', 'police_code', 'historical_CHI', 
                'rolling_24h_violations', 'rolling_7d_violations',
                'rolling_24h_CHI', 'rolling_7d_CHI',
                'lag_1', 'lag_6', 'lag_24', 'trend_features']
                
    X = train_df[features]
    y_vol = train_df['target_future_violation_count']
    y_chi = train_df['target_future_CHI']
    
    X_train, X_test, y_vol_train, y_vol_test, y_chi_train, y_chi_test = train_test_split(X, y_vol, y_chi, test_size=0.2, random_state=42)
    
    model_vol = xgb.XGBRegressor(n_estimators=50, max_depth=5, learning_rate=0.1, n_jobs=-1, tree_method='hist')
    model_vol.fit(X_train, y_vol_train)
    
    model_chi = xgb.XGBRegressor(n_estimators=50, max_depth=5, learning_rate=0.1, n_jobs=-1, tree_method='hist')
    model_chi.fit(X_train, y_chi_train)
    
    vol_preds = model_vol.predict(X_test)
    chi_preds = model_chi.predict(X_test)
    
    baseline_vol = X_test['rolling_24h_violations']
    baseline_chi = X_test['rolling_24h_CHI']
    
    def evaluate(true, pred, name):
        mae = mean_absolute_error(true, pred)
        rmse = np.sqrt(mean_squared_error(true, pred))
        # Handle zero division for MAPE
        mask = true != 0
        if mask.sum() > 0:
            mape = mean_absolute_percentage_error(true[mask], pred[mask]) * 100
        else:
            mape = 0
        return mae, rmse, mape
        
    mae_vol, rmse_vol, mape_vol = evaluate(y_vol_test, vol_preds, 'Violations XGB')
    mae_base_vol, rmse_base_vol, mape_base_vol = evaluate(y_vol_test, baseline_vol, 'Violations Baseline')
    
    mae_chi, rmse_chi, mape_chi = evaluate(y_chi_test, chi_preds, 'CHI XGB')
    mae_base_chi, rmse_base_chi, mape_base_chi = evaluate(y_chi_test, baseline_chi, 'CHI Baseline')
    
    print("\n--- VALIDATION METRICS ---")
    print("Violation Count Prediction:")
    print(f"   XGBoost  -> MAE: {mae_vol:.2f}, RMSE: {rmse_vol:.2f}, MAPE: {mape_vol:.1f}%")
    print(f"   Baseline -> MAE: {mae_base_vol:.2f}, RMSE: {rmse_base_vol:.2f}, MAPE: {mape_base_vol:.1f}%")
    print("CHI Prediction:")
    print(f"   XGBoost  -> MAE: {mae_chi:.2f}, RMSE: {rmse_chi:.2f}, MAPE: {mape_chi:.1f}%")
    print(f"   Baseline -> MAE: {mae_base_chi:.2f}, RMSE: {rmse_base_chi:.2f}, MAPE: {mape_base_chi:.1f}%")
    
    print("\n5. Generating Forecasts...")
    last_7d = df[df['created_datetime'] >= df['created_datetime'].max() - pd.Timedelta(days=7)]
    last_24h = df[df['created_datetime'] >= df['created_datetime'].max() - pd.Timedelta(days=1)]
    
    vol_7d = last_7d.groupby('hotspot_id').size()
    vol_24h = last_24h.groupby('hotspot_id').size()
    
    forecast_df = chi_df[['hotspot_id', 'CHI', 'dominant_junction', 'dominant_police_station']].copy()
    forecast_df.rename(columns={'CHI': 'historical_CHI'}, inplace=True)
    
    forecast_df['rolling_24h_violations'] = forecast_df['hotspot_id'].map(vol_24h).fillna(0)
    forecast_df['rolling_7d_violations'] = forecast_df['hotspot_id'].map(vol_7d).fillna(0)
    
    forecast_df['lag_1'] = forecast_df['rolling_24h_violations'] / 24
    forecast_df['lag_6'] = forecast_df['rolling_24h_violations'] / 4
    forecast_df['lag_24'] = forecast_df['rolling_24h_violations']
    forecast_df['trend_features'] = forecast_df['rolling_24h_violations'] - (forecast_df['rolling_7d_violations'] / 7)
    
    avg_vols = hourly_full.groupby('hotspot_id')['rolling_24h_violations'].mean().to_dict()
    global_avg = hourly_full['rolling_24h_violations'].mean()
    
    forecast_df['avg_24h'] = forecast_df['hotspot_id'].map(avg_vols).fillna(global_avg)
    forecast_df['rolling_24h_CHI'] = forecast_df['historical_CHI'] * (forecast_df['rolling_24h_violations'] / forecast_df['avg_24h'].replace(0, 1))
    forecast_df['rolling_7d_CHI'] = forecast_df['historical_CHI'] * (forecast_df['rolling_7d_violations'] / (forecast_df['avg_24h'].replace(0, 1)*7))
    
    forecast_df['hour'] = 9
    forecast_df['day_of_week'] = 0
    forecast_df['month'] = max_date.month
    forecast_df['is_weekend'] = 0
    forecast_df['temporal_block_idx'] = 1
    
    j_map = dict(zip(hourly_full['dominant_junction'], hourly_full['junction_code']))
    p_map = dict(zip(hourly_full['dominant_police_station'], hourly_full['police_code']))
    forecast_df['junction_code'] = forecast_df['dominant_junction'].map(j_map).fillna(0)
    forecast_df['police_code'] = forecast_df['dominant_police_station'].map(p_map).fillna(0)
    
    X_pred = forecast_df[features]
    forecast_df['pred_24h_violations'] = np.clip(model_vol.predict(X_pred), 0, None)
    forecast_df['pred_24h_CHI'] = np.clip(model_chi.predict(X_pred), 0, 100)
    
    forecast_df['pred_7d_violations'] = np.clip(forecast_df['pred_24h_violations'] * 7 * (1 + (forecast_df['trend_features']/100)), 0, None)
    forecast_df['pred_7d_CHI'] = np.clip(forecast_df['pred_24h_CHI'] * (1 + (forecast_df['trend_features']/100)), 0, 100)
    
    forecast_df['chi_pct_change'] = ((forecast_df['pred_24h_CHI'] - forecast_df['historical_CHI']) / forecast_df['historical_CHI'].replace(0, 1)) * 100
    emerging = forecast_df[forecast_df['chi_pct_change'] > 20].sort_values('chi_pct_change', ascending=False)
    
    top_20_hotspots = forecast_df.sort_values('pred_24h_CHI', ascending=False).head(20)
    top_20_junctions = forecast_df.groupby('dominant_junction')['pred_24h_CHI'].mean().sort_values(ascending=False).head(20)
    top_10_police = forecast_df.groupby('dominant_police_station')['pred_24h_CHI'].mean().sort_values(ascending=False).head(10)
    
    print("\n6. Saving Outputs...")
    out_dir = '/Users/bharathchilaka/Desktop/Grid 2.0/'
    
    forecast_df[['hotspot_id', 'dominant_junction', 'historical_CHI', 'pred_24h_violations', 'pred_24h_CHI']].to_csv(out_dir + 'forecast_24h.csv', index=False)
    forecast_df[['hotspot_id', 'dominant_junction', 'historical_CHI', 'pred_7d_violations', 'pred_7d_CHI']].to_csv(out_dir + 'forecast_7d.csv', index=False)
    emerging[['hotspot_id', 'dominant_junction', 'historical_CHI', 'pred_24h_CHI', 'chi_pct_change']].to_csv(out_dir + 'emerging_hotspots.csv', index=False)
    top_20_hotspots[['hotspot_id', 'dominant_junction', 'pred_24h_CHI']].to_csv(out_dir + 'predicted_hotspot_rankings.csv', index=False)
    
    print("\n==================================================")
    print("           FORECAST VALIDATION REPORT             ")
    print("==================================================")
    
    print("\n--- FEATURE IMPORTANCE (CHI Model) ---")
    imp = pd.Series(model_chi.feature_importances_, index=features).sort_values(ascending=False)
    for k, v in imp.head(5).items():
        print(f"{k}: {v:.3f}")
        
    print("\n--- TOP 5 FORECASTED HOTSPOTS (Next 24h) ---")
    for i, r in top_20_hotspots.head(5).iterrows():
        print(f"{r['hotspot_id']} | Pred CHI: {r['pred_24h_CHI']:.1f} | Junction: {r['dominant_junction']}")
        
    print("\n--- TOP 5 EMERGING HOTSPOTS (>20% Risk Surge) ---")
    for i, r in emerging.head(5).iterrows():
        print(f"{r['hotspot_id']} | Spike: +{r['chi_pct_change']:.1f}% (CHI {r['historical_CHI']:.1f} -> {r['pred_24h_CHI']:.1f})")

    print("\n==================================================")
    print("All outputs generated successfully!")

if __name__ == '__main__':
    main()
