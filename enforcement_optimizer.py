import pandas as pd
import numpy as np

def optimize_patrol(df, available_officers=10):
    # Sort by deployment score
    df_sorted = df.sort_values(by='deployment_score', ascending=False).reset_index(drop=True)
    
    # Select top N hotspots
    assigned = df_sorted.head(available_officers).copy()
    
    # Assign officer IDs
    assigned['assigned_officer'] = [f"OFFICER_{str(i+1).zfill(2)}" for i in range(len(assigned))]
    assigned['priority_rank'] = assigned.index + 1
    
    return assigned

def main():
    print("1. Loading datasets...")
    # Load inputs
    chi_v2 = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/chi_hotspots_v2.csv')
    forecast_24h = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/forecast_24h.csv')
    spatiotemporal = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/spatiotemporal_hotspots.csv')
    
    print("2. Creating patrol candidates & scoring...")
    # Merge required columns
    candidates = forecast_24h.copy()
    candidates.rename(columns={
        'pred_24h_CHI': 'forecasted_CHI',
        'pred_24h_violations': 'forecasted_violation_count'
    }, inplace=True)
    
    # Bring in police station
    candidates = candidates.merge(chi_v2[['hotspot_id', 'dominant_police_station']], on='hotspot_id', how='left')
    
    # Calculate Growth Rate
    # Handle division by zero
    candidates['historical_CHI_safe'] = candidates['historical_CHI'].replace(0, 1)
    candidates['hotspot_growth_rate'] = ((candidates['forecasted_CHI'] - candidates['historical_CHI']) / candidates['historical_CHI_safe']) * 100
    candidates['hotspot_growth_rate'] = candidates['hotspot_growth_rate'].clip(lower=0) # Only positive growth as risk
    
    # Normalize components for score to balance them
    # Because CHI is 0-100, Violations could be 0-1000+, Growth 0-200%+
    c_chi = candidates['forecasted_CHI'] / 100.0
    c_vol = candidates['forecasted_violation_count'] / candidates['forecasted_violation_count'].max()
    c_gro = candidates['hotspot_growth_rate'] / candidates['hotspot_growth_rate'].replace(0, 1).max()
    
    # deployment_score = 0.50 * CHI + 0.30 * Vol + 0.20 * Growth
    candidates['deployment_score'] = (0.50 * c_chi) + (0.30 * c_vol) + (0.20 * c_gro)
    
    print("3. Determining Recommended Time Windows...")
    # Find the peak temporal block for each hotspot using spatiotemporal data
    # Sort by violations to keep the top block per hotspot
    spatiotemporal['hotspot_id'] = 'HS_' + spatiotemporal['spatiotemporal_hotspot_id'].str.split('_').str[0]
    st_sorted = spatiotemporal.sort_values(by=['hotspot_id', 'violation_count'], ascending=[True, False])
    st_peak = st_sorted.drop_duplicates(subset=['hotspot_id'])
    
    time_map = dict(zip(st_peak['hotspot_id'], st_peak['temporal_block']))
    
    # Map the block string to actual hours for the manifest
    def map_time_window(block):
        if pd.isna(block): return "10:00–16:00"
        if 'Morning' in str(block): return "07:00–10:00"
        if 'Office' in str(block): return "10:00–16:00"
        if 'Evening' in str(block): return "16:00–21:00"
        if 'Night' in str(block): return "21:00–07:00"
        return "10:00–16:00"
        
    candidates['recommended_time'] = candidates['hotspot_id'].map(time_map).apply(map_time_window)
    
    print("4. Allocating Officers...")
    AVAILABLE_OFFICERS = 10
    manifest = optimize_patrol(candidates, available_officers=AVAILABLE_OFFICERS)
    
    print("5. Estimating Risk Reduction...")
    total_forecasted_chi = candidates['forecasted_CHI'].sum()
    covered_chi = manifest['forecasted_CHI'].sum()
    risk_reduction = (covered_chi / total_forecasted_chi) * 100 if total_forecasted_chi > 0 else 0
    
    print("6. Saving Patrol Manifest...")
    # Columns: priority_rank, hotspot, junction, police_station, recommended_time, forecasted_CHI, assigned_officer
    manifest_out = manifest[['priority_rank', 'hotspot_id', 'dominant_junction', 'dominant_police_station', 
                             'recommended_time', 'forecasted_CHI', 'assigned_officer']].copy()
    
    # Rename for final output requirements
    manifest_out.rename(columns={
        'hotspot_id': 'hotspot',
        'dominant_junction': 'junction',
        'dominant_police_station': 'police_station'
    }, inplace=True)
    
    out_dir = '/Users/bharathchilaka/Desktop/Grid 2.0/'
    manifest_out.to_csv(out_dir + 'patrol_manifest.csv', index=False)
    
    print("\n==================================================")
    print("        ENFORCEMENT OPTIMIZER SUMMARY             ")
    print("==================================================")
    print(f"Available Officers: {AVAILABLE_OFFICERS}")
    print(f"Predicted Risk Reduction: {risk_reduction:.1f}%")
    
    top_location = manifest_out.iloc[0]
    print(f"\nHighest Priority Location:")
    print(f"{top_location['junction']} ({top_location['hotspot']})")
    print(f"Recommended Time:\n{top_location['recommended_time']}")
    
    print("\n--- DEPLOYMENT ROSTER ---")
    for _, row in manifest_out.head(5).iterrows():
        print(f"[{row['assigned_officer']}] {row['junction']} | {row['recommended_time']} (Risk: {row['forecasted_CHI']:.1f})")
    print("==================================================")

if __name__ == '__main__':
    main()
