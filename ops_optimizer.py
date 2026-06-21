import pandas as pd
import numpy as np

def main():
    print("1. Loading datasets...")
    chi_v2 = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/chi_hotspots_v2.csv')
    forecast_24h = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/forecast_24h.csv')
    spatiotemporal = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/spatiotemporal_hotspots.csv')
    
    print("2. Preparing candidate baseline...")
    candidates = forecast_24h.copy()
    candidates.rename(columns={
        'pred_24h_CHI': 'forecasted_CHI',
        'pred_24h_violations': 'forecasted_violation_count'
    }, inplace=True)
    
    candidates = candidates.merge(chi_v2[['hotspot_id', 'dominant_police_station']], on='hotspot_id', how='left')
    
    candidates['historical_CHI_safe'] = candidates['historical_CHI'].replace(0, 1)
    candidates['hotspot_growth_rate'] = ((candidates['forecasted_CHI'] - candidates['historical_CHI']) / candidates['historical_CHI_safe']) * 100
    candidates['hotspot_growth_rate'] = candidates['hotspot_growth_rate'].clip(lower=0)
    
    # Calculate old deployment score for comparison
    c_chi = candidates['forecasted_CHI'] / 100.0
    c_vol = candidates['forecasted_violation_count'] / candidates['forecasted_violation_count'].max()
    c_gro = candidates['hotspot_growth_rate'] / candidates['hotspot_growth_rate'].replace(0, 1).max()
    candidates['old_deployment_score'] = (0.50 * c_chi) + (0.30 * c_vol) + (0.20 * c_gro)
    candidates['old_rank'] = candidates['old_deployment_score'].rank(ascending=False)
    
    print("3. Applying Operational Priority Score (OPS)...")
    chi_95th = candidates['forecasted_CHI'].quantile(0.95)
    
    def get_ops_multiplier(row):
        j = str(row['dominant_junction']).upper()
        mult = 1.0
        
        if j == 'NO JUNCTION':
            if row['forecasted_CHI'] <= chi_95th:
                mult = 0.50 # 50% penalty for generic non-critical corridors
        else:
            mult += 0.20 # Named Junction bonus
            if 'METRO' in j:
                mult += 0.15 # Metro Station bonus
            if 'MARKET' in j:
                mult += 0.15 # Market Area bonus
                
        return mult
        
    candidates['ops_multiplier'] = candidates.apply(get_ops_multiplier, axis=1)
    candidates['ops_score'] = candidates['old_deployment_score'] * candidates['ops_multiplier']
    
    # Sort by new OPS
    candidates = candidates.sort_values(by='ops_score', ascending=False).reset_index(drop=True)
    candidates['new_rank'] = candidates.index + 1
    
    print("4. Generating Deployment Details...")
    spatiotemporal['hotspot_id'] = 'HS_' + spatiotemporal['spatiotemporal_hotspot_id'].str.split('_').str[0]
    st_sorted = spatiotemporal.sort_values(by=['hotspot_id', 'violation_count'], ascending=[True, False])
    st_peak = st_sorted.drop_duplicates(subset=['hotspot_id'])
    time_map = dict(zip(st_peak['hotspot_id'], st_peak['temporal_block']))
    
    def map_time_window(block):
        if pd.isna(block): return "10:00-16:00"
        if 'Morning' in str(block): return "07:00-10:00"
        if 'Office' in str(block): return "10:00-16:00"
        if 'Evening' in str(block): return "16:00-21:00"
        if 'Night' in str(block): return "21:00-07:00"
        return "10:00-16:00"
        
    candidates['recommended_time'] = candidates['hotspot_id'].map(time_map).apply(map_time_window)
    
    # Take top 20
    AVAILABLE_OFFICERS = 20
    top_20 = candidates.head(AVAILABLE_OFFICERS).copy()
    top_20['assigned_officer'] = [f"OFFICER_{str(i+1).zfill(2)}" for i in range(AVAILABLE_OFFICERS)]
    
    # Output v2 manifest
    out_cols = ['new_rank', 'hotspot_id', 'dominant_junction', 'dominant_police_station', 
                'recommended_time', 'forecasted_CHI', 'ops_score', 'assigned_officer']
    manifest_v2 = top_20[out_cols].copy()
    manifest_v2.rename(columns={
        'new_rank': 'priority_rank',
        'hotspot_id': 'hotspot',
        'dominant_junction': 'junction',
        'dominant_police_station': 'police_station'
    }, inplace=True)
    
    out_dir = '/Users/bharathchilaka/Desktop/Grid 2.0/'
    manifest_v2.to_csv(out_dir + 'patrol_manifest_v2.csv', index=False)
    
    print("\n==================================================")
    print("      OPS RANKING COMPARISON (Top 20)             ")
    print("==================================================")
    
    for i, row in top_20.iterrows():
        shift = int(row['old_rank'] - row['new_rank'])
        shift_str = f"+{shift}" if shift >= 0 else str(shift)
        
        flags = []
        if 'METRO' in str(row['dominant_junction']).upper(): flags.append("[Metro]")
        if 'MARKET' in str(row['dominant_junction']).upper(): flags.append("[Market]")
        
        flag_str = "".join(flags) + " " if flags else ""
        
        print(f"{i+1}. {row['dominant_junction']} ({row['hotspot_id']})")
        print(f"   OPS: {row['ops_score']:.3f} | Forecast CHI: {row['forecasted_CHI']:.1f}")
        print(f"   Rank Shift: {shift_str} {flag_str}")
        print(f"   Time: {row['recommended_time']} | Assigned: OFFICER_{str(i+1).zfill(2)}\n")

    print("==================================================")
    print("Saved patrol_manifest_v2.csv successfully!")

if __name__ == '__main__':
    main()
