import pandas as pd
import re

file_path = '/Users/bharathchilaka/Desktop/Grid 2.0/chi_hotspots.csv'
df = pd.read_csv(file_path)

contribs = []
for idx, row in df.iterrows():
    ex = row['explainability']
    try:
        junction = float(re.search(r'([\d\.]+)% Junction', ex).group(1))
        vehicle = float(re.search(r'([\d\.]+)% Vehicle', ex).group(1))
        violation = float(re.search(r'([\d\.]+)% Violation', ex).group(1))
        density = float(re.search(r'([\d\.]+)% Density', ex).group(1))
        recurrence = float(re.search(r'([\d\.]+)% Recurrence', ex).group(1))
        temporal = float(re.search(r'([\d\.]+)% Temporal', ex).group(1))
        contribs.append({
            'Junction Criticality': junction,
            'Vehicle Impact': vehicle,
            'Violation Severity': violation,
            'Spatial Density': density,
            'Historical Recurrence': recurrence,
            'Temporal Pressure': temporal
        })
    except Exception as e:
        print(f"Failed parsing row: {ex}")

cdf = pd.DataFrame(contribs)

print("--- FEATURE SENSITIVITY & BALANCE REPORT ---")
print("\nAverage Percentage Contribution per Feature:")
avg_contrib = cdf.mean().sort_values(ascending=False)
for k, v in avg_contrib.items():
    print(f"{k}: {v:.1f}%")

print("\n--- IMBALANCE DETECTION ---")
imbalanced = avg_contrib[avg_contrib > 40]
if not imbalanced.empty:
    for k, v in imbalanced.items():
        print(f"WARNING: '{k}' is dominating the CHI index, contributing {v:.1f}% on average (> 40% threshold).")
    
    print("\n--- REWEIGHTING RECOMMENDATION ---")
    print("Historical Recurrence acts as a multiplier (up to 2x boost), meaning its percentage of the total score can scale up to 50% naturally. If the goal is a balanced additive index, the recurrence multiplier heavily skews the model towards older hotspots rather than dense/severe ones.")
    print("\nRecommended Action:")
    print("1. Instead of a 100% multiplier, cap the recurrence multiplier at 1.25x (25% boost): `CHI_final = CHI * (1 + (recurrence_score / 100) * 0.25)`")
    print("2. Alternatively, integrate Recurrence as a standard additive weight: e.g., Base CHI = ... + 0.15 * Recurrence (Adjusting other weights down to sum to 1).")
else:
    print("All features are well-balanced. No feature exceeds 40% average contribution.")

