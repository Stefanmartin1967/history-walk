import json
import math
import re

def haversine(lat1, lon1, lat2, lon2):
    R = 6371e3  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def clean_json_content(content):
    # Remove merge conflict markers, keeping HEAD content
    # Pattern: <<<<<<< HEAD ... ======= ... >>>>>>> ...
    pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n.*?\n>>>>>>> .*?\n', re.DOTALL)
    cleaned_content = re.sub(pattern, r'\1', content)
    return cleaned_content

def main():
    filepath = 'public/djerba.geojson'
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check for merge conflicts
        if '<<<<<<< HEAD' in content:
            print(f"Warning: Merge conflicts found in {filepath}. Attempting to parse with HEAD content.")
            content = clean_json_content(content)

        data = json.loads(content)
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        return

    features = data.get('features', [])
    mosques = [f for f in features if f.get('properties', {}).get('Catégorie') == 'Mosquée']

    print(f"Found {len(mosques)} mosques out of {len(features)} total features.")

    duplicates = []

    for i in range(len(mosques)):
        for j in range(i + 1, len(mosques)):
            m1 = mosques[i]
            m2 = mosques[j]

            p1 = m1['properties']
            p2 = m2['properties']

            # Coordinates can be in geometry.coordinates or properties.Latitude/Longitude
            # GeoJSON uses [lon, lat]
            c1 = m1['geometry']['coordinates']
            c2 = m2['geometry']['coordinates']

            lat1, lon1 = c1[1], c1[0]
            lat2, lon2 = c2[1], c2[0]

            distance = haversine(lat1, lon1, lat2, lon2)

            if distance <= 50:
                duplicates.append({
                    'distance': distance,
                    'm1': {
                        'name': p1.get('Nom du site FR'),
                        'name_ar': p1.get('Nom du site arabe'),
                        'id': p1.get('HW_ID')
                    },
                    'm2': {
                        'name': p2.get('Nom du site FR'),
                        'name_ar': p2.get('Nom du site arabe'),
                        'id': p2.get('HW_ID')
                    }
                })

    if duplicates:
        print(f"\nFound {len(duplicates)} pairs of mosques within 50m:")
        for dup in duplicates:
            print(f"- Distance: {dup['distance']:.2f}m")
            print(f"  1. {dup['m1']['name']} ({dup['m1']['name_ar']}) [ID: {dup['m1']['id']}]")
            print(f"  2. {dup['m2']['name']} ({dup['m2']['name_ar']}) [ID: {dup['m2']['id']}]")
            print("-" * 40)
    else:
        print("\nNo duplicate mosques found within 50m.")

if __name__ == "__main__":
    main()
