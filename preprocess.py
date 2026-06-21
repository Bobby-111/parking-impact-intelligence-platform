import pandas as pd
import numpy as np
import json
import ast

input_file = '/Users/bharathchilaka/Desktop/Grid 2.0/jan to may police violation_anonymized791b166.csv'
output_file = '/Users/bharathchilaka/Desktop/Grid 2.0/cleaned_parking_violations.csv'

print("1. Loading CSV...")
df = pd.read_csv(input_file)
initial_rows = len(df)

print("2. Removing duplicates...")
df = df.drop_duplicates()
print(f"   Removed {initial_rows - len(df)} duplicates.")

print("3. Handling missing values...")
# Drop rows where critical geospatial/temporal data is missing
critical_cols = ['latitude', 'longitude', 'created_datetime', 'vehicle_type', 'violation_type']
df = df.dropna(subset=critical_cols)

# Fill missing junction names with 'No Junction'
df['junction_name'] = df['junction_name'].fillna('No Junction')

print("4. Parsing created_datetime...")
df['created_datetime'] = pd.to_datetime(df['created_datetime'], errors='coerce')
df = df.dropna(subset=['created_datetime']) # Drop any that failed to parse

print("5. Generating temporal features (hour, day_of_week, month, is_weekend)...")
df['hour'] = df['created_datetime'].dt.hour
df['day_of_week'] = df['created_datetime'].dt.day_name()
df['month'] = df['created_datetime'].dt.month
df['is_weekend'] = df['created_datetime'].dt.dayofweek >= 5

print("6. Creating temporal_block...")
def get_temporal_block(hour):
    if 7 <= hour < 10:
        return 'Morning Rush (07-10)'
    elif 10 <= hour < 16:
        return 'Office Hours (10-16)'
    elif 16 <= hour < 21:
        return 'Evening Rush (16-21)'
    else:
        return 'Night (21-07)'

df['temporal_block'] = df['hour'].apply(get_temporal_block)

print("7. Parsing violation_type JSON strings into Python lists...")
def safe_parse(val):
    if pd.isna(val) or val == 'NULL': return []
    try:
        return json.loads(val)
    except:
        try:
            return ast.literal_eval(val)
        except:
            return [val]

df['parsed_violation_type'] = df['violation_type'].apply(safe_parse)

print("8. Standardizing vehicle categories...")
def standardize_vehicle(v):
    v = str(v).upper().strip()
    if v in ['SCOOTER', 'MOTOR CYCLE', 'MOPED']: return 'TWO_WHEELER'
    if v in ['PASSENGER AUTO', 'GOODS AUTO']: return 'AUTO_RICKSHAW'
    if v in ['CAR', 'JEEP']: return 'CAR_JEEP'
    if v in ['MAXI-CAB', 'VAN', 'TEMPO']: return 'LIGHT_COMMERCIAL'
    if v in ['LGV', 'HGV', 'LORRY/GOODS VEHICLE', 'TANKER', 'TRAILER']: return 'HEAVY_COMMERCIAL'
    if 'BUS' in v: return 'BUS'
    return 'OTHER'

df['vehicle_category'] = df['vehicle_type'].apply(standardize_vehicle)

print("9. Saving cleaned dataset...")
df.to_csv(output_file, index=False)

print("\n10. Displaying Validation Statistics:")
print(f"Original Row Count: {initial_rows}")
print(f"Cleaned Row Count: {len(df)}")
print(f"Total Columns: {len(df.columns)}")

print("\nMissing Values Check (Should be 0 for selected cols):")
print(df[['latitude', 'longitude', 'created_datetime', 'vehicle_type', 'junction_name', 'violation_type']].isnull().sum())

print("\nTemporal Block Distribution:")
print(df['temporal_block'].value_counts())

print("\nStandardized Vehicle Categories Distribution:")
print(df['vehicle_category'].value_counts())

print("\nSample Output (First 3 rows of new features):")
cols_to_show = ['created_datetime', 'hour', 'day_of_week', 'month', 'is_weekend', 'temporal_block', 'parsed_violation_type', 'vehicle_category']
print(df[cols_to_show].head(3).to_string())

print(f"\nCleaned dataset successfully saved to: {output_file}")
