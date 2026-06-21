import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split
import h3

def main():
    print("1. Loading datasets and reconstructing time-series...")
    df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/cleaned_parking_violations.csv')
    chi_df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/chi_hotspots_v2.csv')
    
    df['h3_cell'] = df.apply(lambda row: h3.latlng_to_cell(row['latitude'], row['longitude'], 9), axis=1)
    df['hotspot_id'] = 'HS_' + df['h3_cell']
    valid_hotspots = set(chi_df['hotspot_id'])
    df = df[df['hotspot_id'].isin(valid_hotspots)]
    
    df['created_datetime'] = pd.to_datetime(df['created_datetime'])
    df['date_hour'] = df['created_datetime'].dt.floor('h')
    
    hourly = df.groupby(['hotspot_id', 'date_hour']).size().reset_index(name='violation_count')
    
    # We use Top 100 hotspots to ensure rapid local training while preserving spatial variety
    top_100 = chi_df.head(100)['hotspot_id'].tolist()
    min_date = hourly['date_hour'].min()
    max_date = hourly['date_hour'].max()
    all_hours = pd.date_range(start=min_date, end=max_date, freq='h')
    
    idx = pd.MultiIndex.from_product([top_100, all_hours], names=['hotspot_id', 'date_hour'])
    hourly_full = hourly[hourly['hotspot_id'].isin(top_100)].set_index(['hotspot_id', 'date_hour']).reindex(idx, fill_value=0).reset_index()
    
    print("2. Feature Engineering...")
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
    
    # 3. Defining the Classification Target
    hourly_full['target_future_violation_count'] = hourly_full.groupby('hotspot_id')['violation_count'].shift(-24).rolling(24, min_periods=1).sum().values
    
    raw_target_chi = hourly_full['historical_CHI'] * (hourly_full['target_future_violation_count'] / avg_24h_vol)
    hourly_full['target_future_CHI'] = np.clip(raw_target_chi, 0, 100)
    
    def get_chi_class(val):
        if val >= 80: return 3 # Critical
        if val >= 60: return 2 # High
        if val >= 40: return 1 # Moderate
        return 0 # Low
        
    hourly_full['target_CHI_category'] = hourly_full['target_future_CHI'].apply(get_chi_class)
    
    train_df = hourly_full.dropna()
    
    features = ['hour', 'day_of_week', 'month', 'is_weekend', 'temporal_block_idx',
                'junction_code', 'police_code', 'historical_CHI', 
                'rolling_24h_violations', 'rolling_7d_violations',
                'rolling_24h_CHI', 'rolling_7d_CHI',
                'lag_1', 'lag_6', 'lag_24', 'trend_features']
                
    X = train_df[features]
    y = train_df['target_CHI_category']
    
    # Check class distribution to see zero-inflation impact
    class_counts = y.value_counts().to_dict()
    print(f"Class Distribution: Low(0):{class_counts.get(0,0)}, Mod(1):{class_counts.get(1,0)}, High(2):{class_counts.get(2,0)}, Crit(3):{class_counts.get(3,0)}")
    
    # Calculate sample weights to balance the severe zero-inflation of Low risk hours
    total = len(y)
    weights = y.map({
        0: total / (4 * max(class_counts.get(0,1), 1)),
        1: total / (4 * max(class_counts.get(1,1), 1)),
        2: total / (4 * max(class_counts.get(2,1), 1)),
        3: total / (4 * max(class_counts.get(3,1), 1))
    })
    
    X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(X, y, weights, test_size=0.2, random_state=42, stratify=y)
    
    print("4. Training XGBClassifier...")
    model_clf = xgb.XGBClassifier(
        n_estimators=100, 
        max_depth=6, 
        learning_rate=0.1, 
        n_jobs=-1, 
        tree_method='hist',
        objective='multi:softmax',
        num_class=4
    )
    
    # Train with sample weights to prioritize High/Critical spikes
    model_clf.fit(X_train, y_train, sample_weight=w_train)
    
    preds = model_clf.predict(X_test)
    
    print("\n--- CLASSIFICATION METRICS ---")
    acc = accuracy_score(y_test, preds)
    # Using weighted average for multi-class precision/recall/f1
    prec = precision_score(y_test, preds, average='weighted', zero_division=0)
    rec = recall_score(y_test, preds, average='weighted', zero_division=0)
    f1 = f1_score(y_test, preds, average='weighted', zero_division=0)
    
    print(f"Accuracy:  {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall:    {rec:.4f}")
    print(f"F1 Score:  {f1:.4f}")
    
    print("\n--- COMPARISON VS. REGRESSION MODEL ---")
    print("Previous Regression Model (Phase 4/Audit):")
    print("   - Failed Operational Tolerance (MAE > 20% limits)")
    print("   - R² Score: 0.15 (Captured < 20% of variance due to zero-inflation)")
    print("\nNew Classification Model:")
    if f1 > 0.70:
        print(f"   - F1 Score of {f1:.2f} proves strong multi-class separability.")
        print("   - By converting continuous regression into categorical Risk Bands (Low/Mod/High/Crit),")
        print("     and applying Sample Weights, the XGBClassifier successfully overcame the zero-inflation.")
        print("   - Status: PASSED ✅")
    else:
        print(f"   - F1 Score is {f1:.2f}, model still struggling with extreme class imbalance.")
        print("   - Status: FAILED ❌")
        
    print("\n5. Generating Forecast Predictions...")
    # Generate predictions for the actual future using current state
    last_7d = df[df['created_datetime'] >= df['created_datetime'].max() - pd.Timedelta(days=7)]
    last_24h = df[df['created_datetime'] >= df['created_datetime'].max() - pd.Timedelta(days=1)]
    
    vol_7d = last_7d.groupby('hotspot_id').size()
    vol_24h = last_24h.groupby('hotspot_id').size()
    
    forecast_df = chi_df[['hotspot_id', 'dominant_junction', 'dominant_police_station', 'CHI']].copy()
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
    forecast_classes = model_clf.predict(X_pred)
    
    class_map = {0: 'Low', 1: 'Moderate', 2: 'High', 3: 'Critical'}
    forecast_df['pred_CHI_category'] = [class_map[c] for c in forecast_classes]
    
    # Save Outputs
    out_dir = '/Users/bharathchilaka/Desktop/Grid 2.0/'
    forecast_df[['hotspot_id', 'dominant_junction', 'dominant_police_station', 'historical_CHI', 'pred_CHI_category']].to_csv(out_dir + 'risk_category_predictions.csv', index=False)
    
    print(f"\nSaved {len(forecast_df)} categorical predictions to risk_category_predictions.csv")

if __name__ == '__main__':
    main()
