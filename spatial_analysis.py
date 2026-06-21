import pandas as pd

file_path = '/Users/bharathchilaka/Desktop/Grid 2.0/cleaned_parking_violations.csv'
print("Loading cleaned dataset...")
df = pd.read_csv(file_path)

print("\n--- Spatial Analysis ---")

# 1. Unique junctions
num_unique_junctions = df['junction_name'].nunique()
print(f"Unique Junctions: {num_unique_junctions}")

# 2. Unique police stations
num_unique_police_stations = df['police_station'].nunique()
print(f"Unique Police Stations: {num_unique_police_stations}")

# 3. Top 20 locations
print("\nTop 20 Locations by Violation Count:")
print(df['location'].value_counts().head(20))

# 4. Spatial density distribution & Average violations per coordinate
# Calculate violations per unique coordinate
coord_counts = df.groupby(['latitude', 'longitude']).size()

total_violations = len(df)
unique_coords = len(coord_counts)
avg_violations_per_coord = total_violations / unique_coords if unique_coords > 0 else 0

print(f"\nTotal Unique Coordinates (Lat/Long pairs): {unique_coords}")
print(f"Average Violations per Coordinate: {avg_violations_per_coord:.2f}")

print("\nSpatial Density Distribution (Violations per Coordinate Stats):")
print(coord_counts.describe())

# Additionally, let's see how many coordinates have 1 violation, 2-10, etc.
bins = [0, 1, 10, 50, 100, 500, 1000, 10000]
labels = ['1', '2-10', '11-50', '51-100', '101-500', '501-1000', '>1000']
density_bins = pd.cut(coord_counts, bins=bins, labels=labels)
print("\nCoordinate Density (Number of coordinates by violation count range):")
print(density_bins.value_counts().sort_index())
