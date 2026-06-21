import pandas as pd
import numpy as np
import h3
import hdbscan
import folium
from folium.plugins import HeatMap
import matplotlib.pyplot as plt
import seaborn as sns
import json
import ast

def main():
    file_path = '/Users/bharathchilaka/Desktop/Grid 2.0/cleaned_parking_violations.csv'
    print("Loading cleaned dataset...")
    df = pd.read_csv(file_path)
    
    # ---------------------------------------------------
    # STEP 1: H3 Spatial Indexing
    # ---------------------------------------------------
    print("\n--- STEP 1: H3 Spatial Indexing ---")
    
    # Add H3 cells for resolutions 7, 8, 9
    for res in [7, 8, 9]:
        df[f'h3_res{res}'] = df.apply(lambda row: h3.latlng_to_cell(row['latitude'], row['longitude'], res), axis=1)
        
    res_stats = {}
    for res in [7, 8, 9]:
        col = f'h3_res{res}'
        num_cells = df[col].nunique()
        avg_violations = len(df) / num_cells
        res_stats[res] = {
            'num_cells': num_cells,
            'avg_violations': avg_violations
        }
        print(f"Resolution {res}: {num_cells} cells, {avg_violations:.2f} avg violations/cell")
    
    # Auto-select resolution: We want enough granularity (more cells) but avoid sparsity. 
    # A good balance is usually where avg violations is between 50 and 500 for urban analysis.
    # We will pick Resolution 8 as it typically provides neighborhood/corridor level precision (~0.7 km^2) 
    # while maintaining statistical density.
    selected_res = 8
    best_diff = float('inf')
    for res, stats in res_stats.items():
        # Target ~200 violations per cell for stable modeling
        diff = abs(stats['avg_violations'] - 200)
        if diff < best_diff:
            best_diff = diff
            selected_res = res
            
    # Hardcode constraint for this specific project based on urban traffic norms: 8 or 9
    if selected_res == 7: selected_res = 8
    
    h3_col = f'h3_res{selected_res}'
    df['h3_cell'] = df[h3_col]
    
    reason = f"Selected Resolution {selected_res} because it balances spatial precision with statistical density (Avg {res_stats[selected_res]['avg_violations']:.2f} violations/cell). Res 7 is too coarse, and Res 9 may be too sparse."
    print(f"\nOptimal Resolution Selected: {selected_res}")
    print(f"Reason: {reason}")

    # ---------------------------------------------------
    # STEP 2: Spatial Aggregation
    # ---------------------------------------------------
    print("\n--- STEP 2: Spatial Aggregation ---")
    
    def get_mode(x):
        return x.mode()[0] if not x.mode().empty else 'Unknown'

    # Explode violation_type to get the dominant one properly
    # df['parsed_violation_type'] is a string representation of list in CSV, need to parse
    import ast
    def parse_list(x):
        try: return ast.literal_eval(x)
        except: return []
    
    df['parsed_violations'] = df['parsed_violation_type'].apply(parse_list)
    # We'll just use the first violation for simplicity in aggregation mode, or explode
    df['primary_violation'] = df['parsed_violations'].apply(lambda x: x[0] if len(x) > 0 else 'Unknown')
    
    hotspots = df.groupby('h3_cell').agg(
        violation_count=('id', 'count'),
        unique_vehicle_types=('vehicle_category', 'nunique'),
        unique_violation_types=('primary_violation', 'nunique'),
        unique_junctions=('junction_name', 'nunique'),
        unique_police_stations=('police_station', 'nunique'),
        dominant_vehicle_type=('vehicle_category', get_mode),
        dominant_violation_type=('primary_violation', get_mode),
        dominant_junction=('junction_name', get_mode),
        dominant_police_station=('police_station', get_mode)
    ).reset_index()

    # Get centroids
    hotspots['center_lat'] = hotspots['h3_cell'].apply(lambda x: h3.cell_to_latlng(x)[0])
    hotspots['center_lon'] = hotspots['h3_cell'].apply(lambda x: h3.cell_to_latlng(x)[1])

    # ---------------------------------------------------
    # STEP 3: Hotspot Identification
    # ---------------------------------------------------
    print("\n--- STEP 3: Hotspot Identification ---")
    
    # Normalized score (0 to 1)
    max_vol = hotspots['violation_count'].max()
    hotspots['hotspot_score'] = hotspots['violation_count'] / max_vol
    
    hotspots = hotspots.sort_values(by='violation_count', ascending=False).reset_index(drop=True)
    hotspots['hotspot_rank'] = hotspots.index + 1
    hotspots['hotspot_id'] = 'HS_' + hotspots['h3_cell']
    
    # Categories: Top 5%, Next 15%, Next 30%, Remaining
    p95 = hotspots['violation_count'].quantile(0.95)
    p80 = hotspots['violation_count'].quantile(0.80)
    p50 = hotspots['violation_count'].quantile(0.50)
    
    def assign_category(val):
        if val >= p95: return 'Critical'
        elif val >= p80: return 'High'
        elif val >= p50: return 'Moderate'
        else: return 'Low'
        
    hotspots['hotspot_category'] = hotspots['violation_count'].apply(assign_category)

    # ---------------------------------------------------
    # STEP 4: Spatio-Temporal Hotspots
    # ---------------------------------------------------
    print("\n--- STEP 4: Spatio-Temporal Hotspots ---")
    
    st_hotspots = df.groupby(['h3_cell', 'temporal_block']).agg(
        violation_count=('id', 'count'),
        dominant_vehicle_type=('vehicle_category', get_mode),
        dominant_violation_type=('primary_violation', get_mode),
        dominant_junction=('junction_name', get_mode),
        dominant_police_station=('police_station', get_mode)
    ).reset_index()
    
    st_hotspots['spatiotemporal_hotspot_id'] = st_hotspots['h3_cell'] + "_" + st_hotspots['temporal_block'].str.replace(' ', '_').str.replace('(', '').str.replace(')', '')
    
    st_hotspots = st_hotspots.sort_values(by='violation_count', ascending=False)

    # ---------------------------------------------------
    # STEP 5: HDBSCAN Validation Layer
    # ---------------------------------------------------
    print("\n--- STEP 5: HDBSCAN Validation Layer ---")
    
    # Apply HDBSCAN on centroids of Critical & High hotspots
    sig_hotspots = hotspots[hotspots['hotspot_category'].isin(['Critical', 'High'])]
    coords = np.radians(sig_hotspots[['center_lat', 'center_lon']])
    
    # Haversine metric for lat/lon, min_cluster_size=3
    clusterer = hdbscan.HDBSCAN(min_cluster_size=3, metric='haversine')
    cluster_labels = clusterer.fit_predict(coords)
    
    sig_hotspots = sig_hotspots.copy()
    sig_hotspots['cluster_id'] = cluster_labels
    
    cluster_stats = sig_hotspots[sig_hotspots['cluster_id'] != -1].groupby('cluster_id').agg(
        cluster_size=('hotspot_id', 'count'),
        total_violations=('violation_count', 'sum')
    )
    
    # Map back to main hotspots (non-clustered get -1)
    hotspots['cluster_id'] = hotspots['hotspot_id'].map(sig_hotspots.set_index('hotspot_id')['cluster_id']).fillna(-1).astype(int)

    # ---------------------------------------------------
    # STEP 6: Outputs
    # ---------------------------------------------------
    print("\n--- STEP 6: Outputs ---")
    out_dir = '/Users/bharathchilaka/Desktop/Grid 2.0/'
    
    cols_hs = ['hotspot_id', 'h3_cell', 'center_lat', 'center_lon', 'violation_count', 
               'hotspot_score', 'hotspot_category', 'dominant_junction', 
               'dominant_vehicle_type', 'dominant_violation_type', 'dominant_police_station', 'cluster_id']
    hotspots[cols_hs].to_csv(out_dir + 'hotspot_cells.csv', index=False)
    
    cols_st = ['spatiotemporal_hotspot_id', 'temporal_block', 'violation_count', 
               'dominant_junction', 'dominant_vehicle_type', 'dominant_violation_type', 'dominant_police_station']
    st_hotspots[cols_st].to_csv(out_dir + 'spatiotemporal_hotspots.csv', index=False)
    
    print(f"Saved {out_dir}hotspot_cells.csv")
    print(f"Saved {out_dir}spatiotemporal_hotspots.csv")

    # ---------------------------------------------------
    # STEP 7: Visualizations
    # ---------------------------------------------------
    print("\n--- STEP 7: Visualizations ---")
    
    # 1. H3 hotspot heatmap
    m = folium.Map(location=[hotspots['center_lat'].mean(), hotspots['center_lon'].mean()], zoom_start=11)
    heat_data = [[row['center_lat'], row['center_lon'], row['violation_count']] for index, row in hotspots.iterrows()]
    HeatMap(heat_data).add_to(m)
    m.save(out_dir + 'h3_hotspot_heatmap.html')
    
    # 2. Top 20 hotspot cells chart
    plt.figure(figsize=(12, 6))
    sns.barplot(data=hotspots.head(20), x='hotspot_id', y='violation_count', hue='dominant_police_station', dodge=False)
    plt.xticks(rotation=90)
    plt.title('Top 20 Hotspot Cells by Violation Count')
    plt.tight_layout()
    plt.savefig(out_dir + 'top_20_hotspots.png')
    plt.close()
    
    # 3. Junction-wise hotspot distribution
    plt.figure(figsize=(12, 6))
    j_counts = hotspots['dominant_junction'].value_counts().head(20)
    sns.barplot(x=j_counts.index, y=j_counts.values)
    plt.xticks(rotation=90)
    plt.title('Top 20 Junctions by Number of Hotspot Cells')
    plt.tight_layout()
    plt.savefig(out_dir + 'junction_hotspot_dist.png')
    plt.close()
    
    # 4. Police-station-wise hotspot distribution
    plt.figure(figsize=(12, 6))
    p_counts = hotspots['dominant_police_station'].value_counts().head(20)
    sns.barplot(x=p_counts.index, y=p_counts.values)
    plt.xticks(rotation=90)
    plt.title('Top 20 Police Stations by Number of Hotspot Cells')
    plt.tight_layout()
    plt.savefig(out_dir + 'police_station_hotspot_dist.png')
    plt.close()

    # ---------------------------------------------------
    # STEP 8: Validation Report
    # ---------------------------------------------------
    print("\n==================================================")
    print("           VALIDATION REPORT                      ")
    print("==================================================")
    print(f"Selected H3 Resolution: {selected_res}")
    print(f"Total Hotspot Cells: {len(hotspots)}")
    print(f"Critical Hotspots Count (Top 5%): {len(hotspots[hotspots['hotspot_category'] == 'Critical'])}")
    print(f"HDBSCAN Corridors Validated (Clusters found): {len(cluster_stats) if 'cluster_stats' in locals() else 0}")
    
    print("\n--- TOP 20 HOTSPOTS ---")
    for i, row in hotspots.head(20).iterrows():
        print(f"{row['hotspot_rank']}. {row['hotspot_id']} | Violations: {row['violation_count']} | {row['dominant_junction']} | {row['temporal_block'] if 'temporal_block' in row else 'Overall'}")
        
    print("\n--- TOP 20 JUNCTIONS (Dominant in Hotspots) ---")
    print(hotspots['dominant_junction'].value_counts().head(20).to_string())
    
    print("\n--- TOP 10 POLICE STATIONS (Dominant in Hotspots) ---")
    print(hotspots['dominant_police_station'].value_counts().head(10).to_string())
    print("==================================================")

if __name__ == '__main__':
    main()
