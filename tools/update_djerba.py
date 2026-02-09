import json
import re
import math

def clean_json_content(content):
    # Pattern: <<<<<<< HEAD ... ======= ... >>>>>>> ...
    # We want to keep the content in the HEAD block
    pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n.*?\n>>>>>>> .*?\n', re.DOTALL)
    cleaned_content = re.sub(pattern, r'\1', content)
    return cleaned_content

def haversine(lat1, lon1, lat2, lon2):
    R = 6371e3
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def main():
    filepath = 'public/djerba.geojson'

    print(f"Reading {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Clean Merge Conflicts
    if '<<<<<<< HEAD' in content:
        print("Resolving merge conflicts (Keeping HEAD)...")
        content = clean_json_content(content)

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        return

    features = data.get('features', [])
    original_count = len(features)
    print(f"Loaded {original_count} features.")

    features_to_remove = []

    # Target 1: Mosquée El Chouhoud near 33.781583, 10.889722
    target_chouhoud_lat = 33.781583
    target_chouhoud_lon = 10.889722

    # Target 2: Mosquée Ibrahim El-Kalil Dhhira (Exact Name)
    target_ibrahim_name = "Mosquée Ibrahim El-Kalil Dhhira"

    updated_features = []

    for f in features:
        props = f.get('properties', {})
        name = props.get('Nom du site FR', '')

        # Check for Removal 1 (El Chouhoud)
        if name == "Mosquée El Chouhoud":
            c = f['geometry']['coordinates']
            lon, lat = c[0], c[1]
            dist = haversine(target_chouhoud_lat, target_chouhoud_lon, lat, lon)
            if dist < 10: # Exact match basically
                print(f"Removing: {name} at {lat}, {lon}")
                continue

        # Check for Removal 2 (Ibrahim El-Kalil Dhhira)
        if name == target_ibrahim_name:
            print(f"Removing: {name}")
            continue

        # Check for Updates
        # Mosquée El Ghoula : 33.777147513068996, 10.794860611273545
        if name == "Mosquée El Ghoula":
            print(f"Updating {name} coordinates.")
            # GeoJSON is [lon, lat]
            f['geometry']['coordinates'] = [10.794860611273545, 33.777147513068996]
            f['properties']['Latitude'] = 33.777147513068996
            f['properties']['Longitude'] = 10.794860611273545
            f['properties']['Coordonnées GPS'] = "33.777147513068996, 10.794860611273545"

        # Mosquée Khnensa : 33.75818454061917, 10.791050841108836
        if name == "Mosquée Khnensa":
            print(f"Updating {name} coordinates.")
            f['geometry']['coordinates'] = [10.791050841108836, 33.75818454061917]
            f['properties']['Latitude'] = 33.75818454061917
            f['properties']['Longitude'] = 10.791050841108836
            f['properties']['Coordonnées GPS'] = "33.75818454061917, 10.791050841108836"

        updated_features.append(f)

    data['features'] = updated_features
    print(f"Final feature count: {len(updated_features)} (Removed {original_count - len(updated_features)})")

    print(f"Saving to {filepath}...")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Done.")

if __name__ == "__main__":
    main()
