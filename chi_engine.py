import pandas as pd
import numpy as np
import h3
import ast
import json
import matplotlib.pyplot as plt
import seaborn as sns

def main():
    print("Loading data...")
    # Inputs
    df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/cleaned_parking_violations.csv')
    hotspots_df = pd.read_csv('/Users/bharathchilaka/Desktop/Grid 2.0/hotspot_cells.csv')
    
    print("Mapping violations to H3 Res 9 (Hotspot baseline)...")
    # In Phase 2 we used Res 9
    df['h3_cell'] = df.apply(lambda row: h3.latlng_to_cell(row['latitude'], row['longitude'], 9), axis=1)
    df['hotspot_id'] = 'HS_' + df['h3_cell']
    
    # We only care about hotspots that exist in hotspot_cells.csv
    valid_hotspots = set(hotspots_df['hotspot_id'])
    df = df[df['hotspot_id'].isin(valid_hotspots)].copy()
    
    print("STEP 1: Vehicle Impact Score...")
    def get_vehicle_score(v):
        v = str(v).upper()
        if v in ['TANKER', 'TRUCK']: return 5
        if 'BUS' in v: return 4
        if 'CAR' in v or 'JEEP' in v: return 3
        if 'MAXI-CAB' in v: return 3
        if 'PASSENGER AUTO' in v or 'GOODS AUTO' in v or 'AUTO' in v: return 2
        if 'SCOOTER' in v or 'MOTOR CYCLE' in v or 'MOPED' in v: return 1
        return 1
    
    df['v_score_raw'] = df['vehicle_type'].apply(get_vehicle_score)
    
    print("STEP 2: Violation Severity Score...")
    def get_severity_score(val):
        try:
            violations = ast.literal_eval(val) if isinstance(val, str) else val
            if not isinstance(violations, list): violations = [val]
        except:
            violations = []
            
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
    
    print("STEP 3: Junction Criticality Score...")
    df['j_score_raw'] = np.where(df['junction_name'] != 'No Junction', 5, 1)
    
    print("STEP 4: Temporal Pressure Score...")
    def get_temporal_score(t):
        if 'Morning Rush' in t: return 5
        if 'Evening Rush' in t: return 5
        if 'Office Hours' in t: return 3
        return 1
        
    df['t_score_raw'] = df['temporal_block'].apply(get_temporal_score)
    
    # Parse dates for historical recurrence
    df['created_date'] = pd.to_datetime(df['created_datetime']).dt.date
    
    print("Aggregating to Hotspot Level...")
    agg_df = df.groupby('hotspot_id').agg(
        avg_v_score=('v_score_raw', 'mean'),
        avg_s_score=('s_score_raw', 'mean'),
        avg_j_score=('j_score_raw', 'mean'),
        avg_t_score=('t_score_raw', 'mean'),
        violation_count=('id', 'count'),
        unique_days=('created_date', 'nunique')
    ).reset_index()
    
    # Join with dominant features from hotspot_cells.csv
    agg_df = agg_df.merge(hotspots_df[['hotspot_id', 'dominant_junction', 'dominant_police_station']], on='hotspot_id', how='left')
    
    print("STEP 5 & 6: Normalizing Scores...")
    # Normalize 1-5 to 0-100 for weighted components
    agg_df['V_100'] = (agg_df['avg_v_score'] / 5.0) * 100
    agg_df['S_100'] = (agg_df['avg_s_score'] / 5.0) * 100
    agg_df['J_100'] = (agg_df['avg_j_score'] / 5.0) * 100
    agg_df['T_100'] = (agg_df['avg_t_score'] / 5.0) * 100
    
    # Spatial Density (0-100)
    max_count = agg_df['violation_count'].max()
    agg_df['D_100'] = (agg_df['violation_count'] / max_count) * 100
    
    # Recurrence (0-100)
    max_days = agg_df['unique_days'].max()
    agg_df['R_100'] = (agg_df['unique_days'] / max_days) * 100
    
    print("STEP 7: Calculating CHI...")
    agg_df['Base_CHI'] = (
        0.25 * agg_df['V_100'] +
        0.25 * agg_df['S_100'] +
        0.20 * agg_df['J_100'] +
        0.10 * agg_df['T_100'] +
        0.20 * agg_df['D_100']
    )
    
    agg_df['CHI_multiplier'] = 1 + (agg_df['R_100'] / 100)
    agg_df['CHI_raw_final'] = agg_df['Base_CHI'] * agg_df['CHI_multiplier']
    
    # Normalize final result 0-100
    max_chi_raw = agg_df['CHI_raw_final'].max()
    agg_df['CHI'] = (agg_df['CHI_raw_final'] / max_chi_raw) * 100
    
    print("STEP 8: Categories...")
    def assign_chi_cat(c):
        if c >= 80: return 'Critical'
        if c >= 60: return 'High'
        if c >= 40: return 'Moderate'
        return 'Low'
    agg_df['CHI_category'] = agg_df['CHI'].apply(assign_chi_cat)
    
    print("STEP 9: Hotspot Ranking...")
    agg_df = agg_df.sort_values(by='CHI', ascending=False).reset_index(drop=True)
    agg_df['hotspot_rank'] = agg_df.index + 1
    
    print("STEP 10: Explainability...")
    # Calculate percentage contributions
    agg_df['V_val'] = 0.25 * agg_df['V_100']
    agg_df['S_val'] = 0.25 * agg_df['S_100']
    agg_df['J_val'] = 0.20 * agg_df['J_100']
    agg_df['T_val'] = 0.10 * agg_df['T_100']
    agg_df['D_val'] = 0.20 * agg_df['D_100']
    agg_df['R_val'] = agg_df['Base_CHI'] * (agg_df['R_100'] / 100)
    
    total_val = agg_df['CHI_raw_final']
    
    agg_df['cont_vehicle'] = (agg_df['V_val'] / total_val * 100).round(1)
    agg_df['cont_violation'] = (agg_df['S_val'] / total_val * 100).round(1)
    agg_df['cont_junction'] = (agg_df['J_val'] / total_val * 100).round(1)
    agg_df['cont_temporal'] = (agg_df['T_val'] / total_val * 100).round(1)
    agg_df['cont_density'] = (agg_df['D_val'] / total_val * 100).round(1)
    agg_df['cont_recurrence'] = (agg_df['R_val'] / total_val * 100).round(1)
    
    def generate_explanation(row):
        return (f"CHI = {row['CHI']:.0f} | "
                f"{row['cont_junction']}% Junction, {row['cont_vehicle']}% Vehicle, "
                f"{row['cont_violation']}% Violation, {row['cont_density']}% Density, "
                f"{row['cont_recurrence']}% Recurrence, {row['cont_temporal']}% Temporal")
                
    agg_df['explainability'] = agg_df.apply(generate_explanation, axis=1)
    
    print("STEP 11: Outputs & Visualizations...")
    out_dir = '/Users/bharathchilaka/Desktop/Grid 2.0/'
    
    # Save Main CSV
    cols_to_save = ['hotspot_id', 'CHI', 'CHI_category', 'hotspot_rank', 'dominant_junction', 'dominant_police_station', 'explainability']
    agg_df[cols_to_save].to_csv(out_dir + 'chi_hotspots.csv', index=False)
    
    # Save Top 20 CSV
    top_20 = agg_df.head(20)
    top_20[cols_to_save].to_csv(out_dir + 'top_20_chi_hotspots.csv', index=False)
    
    # Visualizations
    plt.figure(figsize=(10, 6))
    sns.histplot(agg_df['CHI'], bins=50, kde=True)
    plt.title('CHI Distribution Across Hotspots')
    plt.xlabel('Congestion Hazard Index (CHI)')
    plt.ylabel('Number of Hotspots')
    plt.axvline(80, color='red', linestyle='--', label='Critical Threshold (80)')
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_dir + 'chi_distribution.png')
    plt.close()
    
    plt.figure(figsize=(12, 6))
    sns.barplot(data=top_20, x='hotspot_id', y='CHI', hue='CHI_category', dodge=False)
    plt.xticks(rotation=90)
    plt.title('Top 20 CHI Hotspots')
    plt.tight_layout()
    plt.savefig(out_dir + 'top_20_chi_hotspots.png')
    plt.close()
    
    # Police Station Risk Chart
    ps_risk = agg_df.groupby('dominant_police_station')['CHI'].mean().sort_values(ascending=False).head(20)
    plt.figure(figsize=(12, 6))
    sns.barplot(x=ps_risk.index, y=ps_risk.values)
    plt.xticks(rotation=90)
    plt.title('Top 20 Police Stations by Average Hotspot CHI')
    plt.ylabel('Average CHI')
    plt.tight_layout()
    plt.savefig(out_dir + 'police_station_risk.png')
    plt.close()
    
    # Junction Risk Chart
    j_risk = agg_df[agg_df['dominant_junction'] != 'No Junction'].groupby('dominant_junction')['CHI'].mean().sort_values(ascending=False).head(20)
    plt.figure(figsize=(12, 6))
    sns.barplot(x=j_risk.index, y=j_risk.values)
    plt.xticks(rotation=90)
    plt.title('Top 20 Junctions by Average CHI')
    plt.ylabel('Average CHI')
    plt.tight_layout()
    plt.savefig(out_dir + 'junction_risk.png')
    plt.close()

    print("\n==================================================")
    print("           CHI VALIDATION REPORT                  ")
    print("==================================================")
    print(f"Total Hotspots Evaluated: {len(agg_df)}")
    print(f"Critical Hotspots (CHI >= 80): {len(agg_df[agg_df['CHI'] >= 80])}")
    print(f"High Risk Hotspots (CHI 60-79): {len(agg_df[(agg_df['CHI'] >= 60) & (agg_df['CHI'] < 80)])}")
    
    print("\n--- TOP 5 CRITICAL HOTSPOTS ---")
    for i, row in top_20.head(5).iterrows():
        print(f"{row['hotspot_rank']}. {row['hotspot_id']} - CHI {row['CHI']:.1f} ({row['dominant_junction']})")
        print(f"   Explainability: {row['explainability']}")
        
    print("\n--- TOP 5 JUNCTION RISKS ---")
    print(j_risk.head(5).to_string())
    
    print("\n--- TOP 5 POLICE STATION RISKS ---")
    print(ps_risk.head(5).to_string())
    print("==================================================")
    print("All outputs generated successfully!")

if __name__ == '__main__':
    main()
