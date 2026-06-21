import pandas as pd
import numpy as np
import h3
import ast
from scipy.stats import rankdata

def main():
    print("Loading data...")
    df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/cleaned_parking_violations.csv')
    hotspots_df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/hotspot_cells.csv')
    
    # Re-build the base scores
    df['h3_cell'] = df.apply(lambda row: h3.latlng_to_cell(row['latitude'], row['longitude'], 9), axis=1)
    df['hotspot_id'] = 'HS_' + df['h3_cell']
    valid_hotspots = set(hotspots_df['hotspot_id'])
    df = df[df['hotspot_id'].isin(valid_hotspots)].copy()
    
    def get_vehicle_score(v):
        v = str(v).upper()
        if v in ['TANKER', 'TRUCK']: return 5
        if 'BUS' in v: return 4
        if 'CAR' in v or 'JEEP' in v: return 3
        if 'MAXI-CAB' in v: return 3
        if 'PASSENGER AUTO' or 'GOODS AUTO' in v or 'AUTO' in v: return 2
        return 1
        
    df['v_score_raw'] = df['vehicle_type'].apply(get_vehicle_score)
    
    def get_severity_score(val):
        try:
            v = ast.literal_eval(val) if isinstance(val, str) else val
            violations = v if isinstance(v, list) else [val]
        except: violations = []
        scores = []
        for v in violations:
            v_str = str(v).upper()
            if 'ROAD CROSSING' in v_str: scores.append(5)
            elif 'MAIN ROAD' in v_str: scores.append(4)
            elif 'WRONG PARKING' in v_str: scores.append(3)
            elif 'FOOTPATH' in v_str: scores.append(3)
            elif 'NO PARKING' in v_str: scores.append(2)
            else: scores.append(1)
        return max(scores) if scores else 1
        
    df['s_score_raw'] = df['parsed_violation_type'].apply(get_severity_score)
    df['j_score_raw'] = np.where(df['junction_name'] != 'No Junction', 5, 1)
    
    def get_temporal_score(t):
        if 'Morning Rush' in t or 'Evening Rush' in t: return 5
        if 'Office Hours' in t: return 3
        return 1
    df['t_score_raw'] = df['temporal_block'].apply(get_temporal_score)
    df['created_date'] = pd.to_datetime(df['created_datetime']).dt.date
    
    agg_df = df.groupby('hotspot_id').agg(
        avg_v_score=('v_score_raw', 'mean'),
        avg_s_score=('s_score_raw', 'mean'),
        avg_j_score=('j_score_raw', 'mean'),
        avg_t_score=('t_score_raw', 'mean'),
        violation_count=('id', 'count'),
        unique_days=('created_date', 'nunique')
    ).reset_index()
    
    agg_df = agg_df.merge(hotspots_df[['hotspot_id', 'dominant_junction', 'dominant_police_station']], on='hotspot_id', how='left')
    
    agg_df['V_100'] = (agg_df['avg_v_score'] / 5.0) * 100
    agg_df['S_100'] = (agg_df['avg_s_score'] / 5.0) * 100
    agg_df['J_100'] = (agg_df['avg_j_score'] / 5.0) * 100
    agg_df['T_100'] = (agg_df['avg_t_score'] / 5.0) * 100
    agg_df['R_100'] = (agg_df['unique_days'] / agg_df['unique_days'].max()) * 100
    
    # STEP 1: Scaling Methods for violation_count
    c = agg_df['violation_count']
    
    # 1. MinMax
    d_minmax = (c - c.min()) / (c.max() - c.min()) * 100
    
    # 2. Log Scaling
    log_c = np.log1p(c)
    d_log = (log_c - log_c.min()) / (log_c.max() - log_c.min()) * 100
    
    # 3. Quantile (Percentile Rank)
    d_quantile = c.rank(pct=True) * 100
    
    # 4. Robust Scaling (IQR)
    q75, q25 = np.percentile(c, [75, 25])
    iqr = q75 - q25
    if iqr == 0: iqr = 1
    d_robust_raw = (c - np.median(c)) / iqr
    # Clip and MinMax scale the robust values to 0-100
    d_robust_clipped = np.clip(d_robust_raw, -1, 5) # cap at 5 IQR
    d_robust = (d_robust_clipped - d_robust_clipped.min()) / (d_robust_clipped.max() - d_robust_clipped.min()) * 100

    methods = {
        'MinMax Scaling': d_minmax,
        'Log Scaling': d_log,
        'Quantile Scaling': d_quantile,
        'Robust Scaling': d_robust
    }
    
    print("\n--- STEP 1 & 2: EVALUATING SCALING METHODS ---")
    results = []
    
    for name, d_100 in methods.items():
        base_chi = (0.25 * agg_df['V_100'] + 0.25 * agg_df['S_100'] + 
                    0.20 * agg_df['J_100'] + 0.10 * agg_df['T_100'] + 0.20 * d_100)
        chi_raw = base_chi * (1 + agg_df['R_100'] / 100)
        
        d_val = 0.20 * d_100
        contribs = (d_val / chi_raw) * 100
        
        mean_contrib = contribs.mean()
        median_contrib = contribs.median()
        results.append((name, mean_contrib, median_contrib, d_100))
        print(f"{name}: Mean Contrib = {mean_contrib:.2f}%, Median Contrib = {median_contrib:.2f}%")
        
    # STEP 3: Select Best Strategy
    # We want mean contribution closest to 15% (between 10% and 20%)
    best_method = None
    best_diff = 100
    best_d_100 = None
    for name, mean_c, med_c, d_100 in results:
        if abs(mean_c - 15) < best_diff:
            best_diff = abs(mean_c - 15)
            best_method = name
            best_d_100 = d_100
            
    print(f"\n--- STEP 3: SELECTION ---")
    print(f"Selected Strategy: {best_method}")
    print("Reason: Best aligns with the target 10%-20% density contribution range.")
    
    # STEP 4: Recalculate CHI
    agg_df['D_100'] = best_d_100
    agg_df['Base_CHI'] = (0.25 * agg_df['V_100'] + 0.25 * agg_df['S_100'] + 
                          0.20 * agg_df['J_100'] + 0.10 * agg_df['T_100'] + 0.20 * agg_df['D_100'])
    agg_df['CHI_multiplier'] = 1 + (agg_df['R_100'] / 100)
    agg_df['CHI_raw_final'] = agg_df['Base_CHI'] * agg_df['CHI_multiplier']
    
    max_chi_raw = agg_df['CHI_raw_final'].max()
    agg_df['CHI_v2'] = (agg_df['CHI_raw_final'] / max_chi_raw) * 100
    
    def assign_chi_cat(c):
        if c >= 80: return 'Critical'
        if c >= 60: return 'High'
        if c >= 40: return 'Moderate'
        return 'Low'
    agg_df['CHI_category_v2'] = agg_df['CHI_v2'].apply(assign_chi_cat)
    
    agg_df = agg_df.sort_values(by='CHI_v2', ascending=False).reset_index(drop=True)
    agg_df['hotspot_rank_v2'] = agg_df.index + 1
    
    # STEP 5: Compare Rankings
    # Load old ranks
    old_chi = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/chi_hotspots.csv')
    comparison = agg_df[['hotspot_id', 'CHI_v2', 'hotspot_rank_v2', 'CHI_category_v2']].merge(
        old_chi[['hotspot_id', 'CHI', 'hotspot_rank', 'CHI_category']], on='hotspot_id'
    )
    comparison['rank_change'] = comparison['hotspot_rank'] - comparison['hotspot_rank_v2'] # Positive means moved up
    
    print("\n--- STEP 5: RANKING CHANGE REPORT ---")
    avg_change = comparison['rank_change'].abs().mean()
    print(f"Average Rank Shift: {avg_change:.1f} positions")
    
    moved_up = comparison.sort_values('rank_change', ascending=False).head(3)
    print("\nTop 3 Hotspots moving UP in rank:")
    for _, r in moved_up.iterrows():
        print(f"{r['hotspot_id']}: Rank {r['hotspot_rank']} -> {r['hotspot_rank_v2']} (+{r['rank_change']})")
        
    moved_down = comparison.sort_values('rank_change').head(3)
    print("\nTop 3 Hotspots moving DOWN in rank:")
    for _, r in moved_down.iterrows():
        print(f"{r['hotspot_id']}: Rank {r['hotspot_rank']} -> {r['hotspot_rank_v2']} ({r['rank_change']})")
        
    # Explainability for v2
    total_val = agg_df['CHI_raw_final']
    agg_df['cont_vehicle'] = ((0.25 * agg_df['V_100']) / total_val * 100).round(1)
    agg_df['cont_violation'] = ((0.25 * agg_df['S_100']) / total_val * 100).round(1)
    agg_df['cont_junction'] = ((0.20 * agg_df['J_100']) / total_val * 100).round(1)
    agg_df['cont_temporal'] = ((0.10 * agg_df['T_100']) / total_val * 100).round(1)
    agg_df['cont_density'] = ((0.20 * agg_df['D_100']) / total_val * 100).round(1)
    agg_df['cont_recurrence'] = ((agg_df['Base_CHI'] * (agg_df['R_100'] / 100)) / total_val * 100).round(1)
    
    def generate_explanation(row):
        return (f"CHI = {row['CHI_v2']:.0f} | "
                f"{row['cont_junction']}% Junction, {row['cont_vehicle']}% Vehicle, "
                f"{row['cont_violation']}% Violation, {row['cont_density']}% Density, "
                f"{row['cont_recurrence']}% Recurrence, {row['cont_temporal']}% Temporal")
    agg_df['explainability'] = agg_df.apply(generate_explanation, axis=1)

    # STEP 6: Output
    out_dir = '/Users/bharathchilaka/Desktop/Grid 2.0/'
    cols = ['hotspot_id', 'CHI_v2', 'CHI_category_v2', 'hotspot_rank_v2', 'dominant_junction', 'dominant_police_station', 'explainability']
    agg_df[cols].rename(columns={'CHI_v2':'CHI', 'CHI_category_v2':'CHI_category', 'hotspot_rank_v2':'hotspot_rank'}).to_csv(out_dir + 'chi_hotspots_v2.csv', index=False)
    
    print("\n--- STEP 6: CALIBRATION SUCCESS ---")
    print("Saved output to: chi_hotspots_v2.csv")

if __name__ == '__main__':
    main()
